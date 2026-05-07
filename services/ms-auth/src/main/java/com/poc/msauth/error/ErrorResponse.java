package com.poc.msauth.error;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ErrorResponse(String error, String error_description) {

    public static ErrorResponse of(ErrorCode code) {
        return new ErrorResponse(code.value(), null);
    }

    public static ErrorResponse of(ErrorCode code, String description) {
        return new ErrorResponse(code.value(), description);
    }
}
