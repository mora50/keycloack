-- jwks.lua spec — fetch() and find_pem() error/happy paths.
describe("jwks.fetch", function()
  it("returns the parsed body on HTTP 200", function()
    pending("requires resty.http mock via kong-pongo")
  end)

  it("returns nil + 'fetch_failed' on HTTP timeout", function()
    pending("requires resty.http mock via kong-pongo")
  end)

  it("returns nil + 'fetch_failed' on non-200 status", function()
    pending("requires resty.http mock via kong-pongo")
  end)

  it("returns nil + 'fetch_failed: malformed' on invalid JSON", function()
    pending("requires resty.http mock via kong-pongo")
  end)
end)

describe("jwks.find_pem", function()
  it("returns the PEM for a present RSA kid", function()
    pending("requires lua-resty-openssl in pongo")
  end)

  it("returns nil + 'kid_not_found' for an absent kid", function()
    pending("requires lua-resty-openssl in pongo")
  end)

  it("returns nil + 'kty_not_rsa' when the JWK is not RSA", function()
    pending("requires lua-resty-openssl in pongo")
  end)
end)
