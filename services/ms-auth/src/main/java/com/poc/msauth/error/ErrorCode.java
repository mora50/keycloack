package com.poc.msauth.error;

public enum ErrorCode {
    INVALID_REQUEST("invalid_request"),
    INVALID_CREDENTIALS("invalid_credentials"),
    INVALID_REFRESH_TOKEN("invalid_refresh_token"),
    IDP_UNAVAILABLE("idp_unavailable");

    private final String value;

    ErrorCode(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }
}
