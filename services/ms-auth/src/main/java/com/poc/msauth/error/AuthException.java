package com.poc.msauth.error;

import org.springframework.http.HttpStatus;

public class AuthException extends RuntimeException {

    private final HttpStatus status;
    private final ErrorCode code;
    private final String description;

    public AuthException(HttpStatus status, ErrorCode code, String description) {
        super(code.value() + (description == null ? "" : ": " + description));
        this.status = status;
        this.code = code;
        this.description = description;
    }

    public AuthException(HttpStatus status, ErrorCode code) {
        this(status, code, null);
    }

    public HttpStatus status() {
        return status;
    }

    public ErrorCode code() {
        return code;
    }

    public String description() {
        return description;
    }
}
