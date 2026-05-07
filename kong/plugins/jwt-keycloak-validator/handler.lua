-- jwt-keycloak-validator: access-phase JWT validation against ms-auth's JWKS.
-- Contract: specs/001-auth-trust-gateway/contracts/plugin-schema.md

local jwt_decoder = require "resty.jwt"
local validators  = require "resty.jwt-validators"
local cache_mod   = require "kong.plugins.jwt-keycloak-validator.cache"

local JwtKeycloakValidator = {
  PRIORITY = 1005,
  VERSION = "0.1.0",
}

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
local function unauthorized(message)
  local kong = _G.kong
  return kong.response.exit(401, { message = message })
end

local function strip_client_identity_headers(conf)
  local kong = _G.kong
  local spoof_attempted = false

  if kong.request.get_header(conf.user_id_header) then
    spoof_attempted = true
  end
  kong.service.request.clear_header(conf.user_id_header)

  if conf.forward_claims then
    for _, claim in ipairs(conf.forward_claims) do
      local hname = "X-Claim-" .. claim
      if kong.request.get_header(hname) then
        spoof_attempted = true
      end
      kong.service.request.clear_header(hname)
    end
  end

  if spoof_attempted then
    kong.log.warn("event=identity_headers_stripped reason=anti_spoofing")
  end
end

local function extract_bearer()
  local kong = _G.kong
  local auth = kong.request.get_header("authorization")
  if not auth then
    return nil
  end
  local prefix = auth:sub(1, 7)
  if prefix:lower() ~= "bearer " then
    return nil
  end
  local token = auth:sub(8):gsub("^%s+", ""):gsub("%s+$", "")
  if token == "" then
    return nil
  end
  return token
end

-- ---------------------------------------------------------------------------
-- Access phase
-- ---------------------------------------------------------------------------
function JwtKeycloakValidator:access(conf)
  local kong = _G.kong

  -- Step 1 (FR-010): strip any client-supplied identity headers BEFORE we even
  -- look at the token. This is the invariant US3 protects.
  if conf.strip_client_headers then
    strip_client_identity_headers(conf)
  end

  -- Step 2: parse Authorization: Bearer <token>
  local token = extract_bearer()
  if not token then
    kong.log.warn("missing_or_invalid_authorization")
    return unauthorized("missing_or_invalid_authorization")
  end

  -- Step 3: decode unverified just to read the kid
  local jwt_obj = jwt_decoder:load_jwt(token)
  if not jwt_obj or not jwt_obj.valid or not jwt_obj.header or not jwt_obj.header.kid then
    kong.log.warn("invalid_jwt_format")
    return unauthorized("invalid_jwt_format")
  end

  local kid = jwt_obj.header.kid
  local cache_key = "jwks:" .. conf.issuer .. ":" .. kid

  -- Step 4: cache lookup (hit ⇒ no I/O; miss ⇒ load via ms-auth, mutex-coalesced).
  -- Observability hint: probe the cache before delegating; the second call is a
  -- cheap hit. We only log miss/hit, never the token payload (FR-017).
  local pre_pem = kong.cache:probe(cache_key)
  local pem, cerr = cache_mod.get(cache_key, conf, kid)
  if pre_pem then
    kong.log.info("event=cache_hit kid=", kid, " iss=", conf.issuer)
  else
    kong.log.info("event=cache_miss kid=", kid, " iss=", conf.issuer)
  end
  if not pem then
    kong.log.warn("event=key_not_available kid=", kid, " iss=", conf.issuer,
                  " err=", tostring(cerr))
    return unauthorized("key_not_available")
  end

  -- Step 5: verify signature + claims
  local claim_specs = {
    iss = validators.equals(conf.issuer),
    exp = validators.is_not_expired(),
    nbf = validators.opt_is_not_before(),
  }
  if conf.audience then
    claim_specs.aud = validators.contains(conf.audience)
  end

  local verified = jwt_decoder:verify_jwt_obj(pem, jwt_obj, claim_specs)
  if not verified or not verified.verified then
    local reason = verified and verified.reason or "signature mismatch"
    kong.log.warn("event=token_verification_failed kid=", kid,
                  " iss=", conf.issuer, " reason=", reason)
    return unauthorized("token_verification_failed: " .. reason)
  end

  -- Step 6: inject identity headers derived from the validated payload
  local payload = jwt_obj.payload or {}
  local sub = payload[conf.user_id_claim]
  if sub ~= nil then
    kong.service.request.set_header(conf.user_id_header, tostring(sub))
  end
  if conf.forward_claims then
    for _, claim in ipairs(conf.forward_claims) do
      local v = payload[claim]
      if v ~= nil then
        kong.service.request.set_header("X-Claim-" .. claim, tostring(v))
      end
    end
  end
end

return JwtKeycloakValidator
