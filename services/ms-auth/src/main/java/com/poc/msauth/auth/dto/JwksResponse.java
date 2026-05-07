package com.poc.msauth.auth.dto;

import java.util.List;

public record JwksResponse(List<Jwk> keys) {

    public record Jwk(
            String kid,
            String kty,
            String alg,
            String use,
            String n,
            String e
    ) {
    }
}
