-- Schema validation spec for jwt-keycloak-validator.
local schema_def = require "kong.plugins.jwt-keycloak-validator.schema"
local v = require("spec.helpers").validate_plugin_config_schema

describe("jwt-keycloak-validator schema", function()
  it("strip_client_headers defaults to true (FR-010 anti-spoofing)", function()
    local ok, err = v({
      jwks_url = "http://ms-auth:8080/auth/jwks",
      issuer = "http://keycloak:8080/realms/poc",
    }, schema_def)
    assert.is_nil(err)
    assert.is_truthy(ok)
    assert.is_true(ok.config.strip_client_headers)
  end)

  it("rejects algorithm not in {RS256, RS384, RS512}", function()
    local ok, err = v({
      jwks_url = "http://ms-auth:8080/auth/jwks",
      issuer = "http://keycloak:8080/realms/poc",
      algorithm = "HS256",
    }, schema_def)
    assert.is_falsy(ok)
    assert.is_table(err)
  end)

  it("default forward_claims contains preferred_username and email", function()
    local ok = v({
      jwks_url = "http://ms-auth:8080/auth/jwks",
      issuer = "http://keycloak:8080/realms/poc",
    }, schema_def)
    assert.is_truthy(ok)
    assert.same({ "preferred_username", "email" }, ok.config.forward_claims)
  end)

  it("default cache_ttl is 3600 and negative_cache_ttl is 30", function()
    local ok = v({
      jwks_url = "http://ms-auth:8080/auth/jwks",
      issuer = "http://keycloak:8080/realms/poc",
    }, schema_def)
    assert.is_truthy(ok)
    assert.equals(3600, ok.config.cache_ttl)
    assert.equals(30, ok.config.negative_cache_ttl)
  end)
end)
