package com.poc.msauth.auth.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record TokenResponse(
        @JsonProperty("access_token") String accessToken,
        @JsonProperty("refresh_token") String refreshToken,
        @JsonProperty("token_type") String tokenType,
        @JsonProperty("expires_in") Integer expiresIn,
        @JsonProperty("refresh_expires_in") Integer refreshExpiresIn
) {
    public static TokenResponse bearer(String accessToken, String refreshToken,
                                       Integer expiresIn, Integer refreshExpiresIn) {
        return new TokenResponse(accessToken, refreshToken, "Bearer", expiresIn, refreshExpiresIn);
    }
}
