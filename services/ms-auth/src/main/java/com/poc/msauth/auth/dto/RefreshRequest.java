package com.poc.msauth.auth.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;

public record RefreshRequest(
        @NotBlank(message = "refresh_token must not be blank")
        @JsonProperty("refresh_token")
        String refreshToken
) {
}
