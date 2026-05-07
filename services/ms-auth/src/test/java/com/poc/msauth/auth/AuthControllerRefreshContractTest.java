package com.poc.msauth.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.poc.msauth.auth.dto.RefreshRequest;
import com.poc.msauth.auth.dto.TokenResponse;
import com.poc.msauth.error.AuthException;
import com.poc.msauth.error.ErrorCode;
import com.poc.msauth.error.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Contract test for POST /auth/refresh.
 * Maps to spec scenario CA-002: "Refresh returns new token pair".
 */
@WebMvcTest(AuthController.class)
@Import(GlobalExceptionHandler.class)
class AuthControllerRefreshContractTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper json;

    @MockitoBean
    AuthService authService;

    @Test
    void CA002_refresh_returns_new_pair() throws Exception {
        when(authService.refresh(any())).thenReturn(
                TokenResponse.bearer("new.access", "new.refresh", 300, 1800)
        );

        mockMvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(new RefreshRequest("old.refresh"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.access_token").value("new.access"))
                .andExpect(jsonPath("$.refresh_token").value("new.refresh"))
                .andExpect(jsonPath("$.token_type").value("Bearer"));
    }

    @Test
    void refresh_returns_401_when_invalid_refresh_token() throws Exception {
        when(authService.refresh(any())).thenThrow(
                new AuthException(HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_REFRESH_TOKEN));

        mockMvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(new RefreshRequest("expired.refresh"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("invalid_refresh_token"));
    }
}
