-- Handler spec — covers CA-001..CA-009 with kong.cache and resty.http mocked.
local helpers = require "spec.helpers"
local cjson   = require "cjson.safe"

describe("jwt-keycloak-validator handler", function()
  local plugin_name = "jwt-keycloak-validator"

  local strategy
  local proxy_client
  local pem_a, jwt_a, kid_a

  setup(function()
    -- TODO(US1): bootstrap a kong-pongo / busted env that signs a real RS256 token
    -- via lua-resty-openssl in before_each. For now this spec is a placeholder
    -- enumerating the CA-NNN test cases the implementation must satisfy.
  end)

  describe("CA001_happy_path_injects_xuserid", function()
    it("calls kong.service.request.set_header('X-User-Id', payload.sub) on a valid token", function()
      pending("requires kong-pongo bootstrap with signed RS256 token")
    end)
  end)

  describe("CA002_refresh_returns_new_pair (covered by ms-auth contract test)", function()
    it("delegates to AuthControllerRefreshContractTest", function()
      pending("covered in services/ms-auth")
    end)
  end)

  describe("CA003_cache_hit_skips_fetch", function()
    it("does not invoke loader on second request with same kid (US2)", function()
      pending("US2 implementation pending")
    end)
  end)

  describe("CA006_spoofed_xuserid_is_overwritten", function()
    it("calls kong.service.request.clear_header('X-User-Id') before injection (US3)", function()
      pending("US3 implementation pending")
    end)
  end)

  describe("CA007_unknown_kid_triggers_single_refresh", function()
    it("invokes loader exactly once for N concurrent calls with same unknown kid (US5)", function()
      pending("US5 implementation pending")
    end)
  end)

  describe("CA008_msauth_down_cached_kid_still_works", function()
    it("does not invoke loader when cache holds the PEM (US4)", function()
      pending("US4 implementation pending")
    end)
  end)

  describe("CA009_unknown_kid_with_msauth_down_returns_401_and_negative_caches", function()
    it("returns 401 key_not_available; subsequent identical lookup hits neg cache (US4)", function()
      pending("US4 implementation pending")
    end)
  end)
end)
