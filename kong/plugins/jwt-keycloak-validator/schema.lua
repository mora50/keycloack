-- Schema for the jwt-keycloak-validator plugin.
-- Contract source of truth: specs/001-auth-trust-gateway/contracts/plugin-schema.md
local typedefs = require "kong.db.schema.typedefs"

return {
  name = "jwt-keycloak-validator",
  fields = {
    { consumer = typedefs.no_consumer },
    { protocols = typedefs.protocols_http },
    { config = {
        type = "record",
        fields = {
          { jwks_url = typedefs.url { required = true } },
          { issuer = { type = "string", required = true } },
          { audience = { type = "string", required = false } },
          { algorithm = {
              type = "string",
              required = false,
              default = "RS256",
              one_of = { "RS256", "RS384", "RS512" },
          } },
          { cache_ttl = {
              type = "number",
              required = false,
              default = 3600,
              gt = 0,
          } },
          { negative_cache_ttl = {
              type = "number",
              required = false,
              default = 30,
              gt = 0,
          } },
          { user_id_claim = {
              type = "string",
              required = false,
              default = "sub",
          } },
          { user_id_header = {
              type = "string",
              required = false,
              default = "X-User-Id",
          } },
          { forward_claims = {
              type = "array",
              required = false,
              default = { "preferred_username", "email" },
              elements = { type = "string" },
          } },
          { strip_client_headers = {
              type = "boolean",
              required = false,
              default = true,
          } },
        },
      },
    },
  },
}
