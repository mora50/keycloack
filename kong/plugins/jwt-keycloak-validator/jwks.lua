-- jwks.lua: fetch and parse JWKS from the ms-auth proxy endpoint.
-- Public surface:
--   M.fetch(url, timeout_ms) -> jwks_table | nil, err
--   M.find_pem(jwks, kid)    -> pem_string | nil, err

local http      = require "resty.http"
local cjson     = require "cjson.safe"
local pkey_lib  = require "resty.openssl.pkey"
local bn_lib    = require "resty.openssl.bn"
local b64       = require "ngx.base64"

local M = {}

-- ---------------------------------------------------------------------------
-- Fetch JWKS document from URL with the supplied timeout (ms).
-- Returns the decoded JSON table (`{ keys = { ... } }`) on success,
-- or `nil, "<reason>"` on any failure (timeout, non-200, body invalid).
-- ---------------------------------------------------------------------------
function M.fetch(url, timeout_ms)
  local httpc, err = http.new()
  if not httpc then
    return nil, "http_client_init_failed: " .. tostring(err)
  end

  httpc:set_timeout(timeout_ms or 1000)

  local res, perr = httpc:request_uri(url, {
    method = "GET",
    headers = { ["Accept"] = "application/json" },
    ssl_verify = false,
    keepalive_timeout = 60000,
    keepalive_pool = 10,
  })

  if not res then
    return nil, "fetch_failed: " .. tostring(perr)
  end

  if res.status ~= 200 then
    return nil, "fetch_failed: status " .. tostring(res.status)
  end

  local body = res.body
  if not body or body == "" then
    return nil, "fetch_failed: empty body"
  end

  local jwks, jerr = cjson.decode(body)
  if not jwks or type(jwks) ~= "table" or type(jwks.keys) ~= "table" then
    return nil, "fetch_failed: malformed JWKS body (" .. tostring(jerr) .. ")"
  end

  return jwks, nil
end

-- ---------------------------------------------------------------------------
-- Locate the JWK with the given `kid` and return its RSA public key in PEM.
-- Returns `nil, "<reason>"` when the kid is absent or kty != RSA.
-- ---------------------------------------------------------------------------
function M.find_pem(jwks, kid)
  if not jwks or type(jwks.keys) ~= "table" then
    return nil, "no_jwks"
  end

  for _, k in ipairs(jwks.keys) do
    if k.kid == kid then
      if k.kty ~= "RSA" then
        return nil, "kty_not_rsa"
      end
      local n_bin = b64.decode_base64url(k.n)
      local e_bin = b64.decode_base64url(k.e)
      if not n_bin or not e_bin then
        return nil, "invalid_jwk_encoding"
      end
      local n_bn = bn_lib.from_binary(n_bin)
      local e_bn = bn_lib.from_binary(e_bin)
      -- lua-resty-openssl loads an existing RSA public key when
      -- `params = { n, e }` is passed (see resty/openssl/rsa.lua::set_parameters).
      local pkey, perr = pkey_lib.new({
        type = "RSA",
        params = { n = n_bn, e = e_bn },
      })
      if not pkey then
        return nil, "pkey_build_failed: " .. tostring(perr)
      end
      local pem, ferr = pkey:tostring("public", "PEM")
      if not pem then
        return nil, "pem_export_failed: " .. tostring(ferr)
      end
      return pem, nil
    end
  end

  return nil, "kid_not_found"
end

return M
