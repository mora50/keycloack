-- cache.lua: lookup of the public PEM for a given JWT `kid`.
--
-- Single backend: kong.cache (which is itself L1 worker LRU + L2 nginx
-- shared dict broadcast across workers in the same Kong node). On a miss,
-- the loader fetches from ms-auth.
--
-- Why kong.cache and not a custom shared dict?
--   1. It is L1+L2 already, so a hit costs ~1–10 µs (well below SC-001's 5 ms).
--   2. It coalesces concurrent misses on the same key under a per-key mutex.
--      That single fact gives us FR-007 / SC-006 ("only one JWKS refresh per
--      burst of unknown kid") for free, without any locking code of our own.
--   3. It supports negative caching with its own TTL, so a kid that does not
--      exist in the JWKS is remembered as "absent" for `negative_cache_ttl`
--      seconds, preventing retry storms against ms-auth.
--
-- Public surface:
--   M.get(key, conf, kid, loader) -> pem_string | nil, err

local jwks = require "kong.plugins.jwt-keycloak-validator.jwks"

local M = {}

-- ---------------------------------------------------------------------------
-- Default loader: invoked by kong.cache on a miss. Fetches the JWKS from
-- ms-auth and extracts the PEM for the given kid. Returning `nil, err`
-- makes kong.cache store a negative entry honoring `neg_ttl`.
-- ---------------------------------------------------------------------------
local function load_public_key(conf, kid)
  local kong = _G.kong

  if kong and kong.log then
    kong.log.info("event=jwks_refresh reason=unknown_kid kid=", kid,
                  " iss=", conf.issuer)
  end

  -- 1s timeout: the JWKS endpoint is on ms-auth, hop is a few ms in Compose.
  -- Anything slower than this is a sign of trouble and should not block the
  -- gateway worker; the loader will return nil, err and trigger negative cache.
  local jwks_doc, err = jwks.fetch(conf.jwks_url, 1000)
  if not jwks_doc then
    return nil, err
  end

  local pem, ferr = jwks.find_pem(jwks_doc, kid)
  if not pem then
    return nil, ferr
  end

  return pem
end

-- ---------------------------------------------------------------------------
-- Look up a PEM. kong.cache:get does the heavy lifting:
--   * hit  -> returns immediately (no I/O, no loader call)
--   * miss -> serializes concurrent callers and runs the loader exactly once
--   * loader returning (nil, err) -> negative entry cached with neg_ttl
-- ---------------------------------------------------------------------------
function M.get(key, conf, kid, loader)
  loader = loader or load_public_key

  local kong = _G.kong
  if not kong or not kong.cache then
    -- Fallback for unit tests that run outside the Kong runtime.
    return loader(conf, kid)
  end

  local opts = {
    ttl = conf.cache_ttl,
    neg_ttl = conf.negative_cache_ttl,
  }

  local pem, err = kong.cache:get(key, opts, loader, conf, kid)
  if err then
    return nil, "cache_error: " .. tostring(err)
  end
  return pem
end

return M
