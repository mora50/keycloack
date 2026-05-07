package com.poc.msauth.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.poc.msauth.auth.dto.LoginRequest;
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
 * Contract test for POST /auth/login.
 * Maps to spec scenario CA-001: "Login returns token pair".
 */
@WebMvcTest(AuthController.class)
@Import(GlobalExceptionHandler.class)
class AuthControllerLoginContractTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper json;

    @MockitoBean
    AuthService authService;

    @Test
    void CA001_login_returns_token_pair() throws Exception {
        when(authService.login(any())).thenReturn(
                TokenResponse.bearer("access.jwt.token", "refresh.jwt.token", 300, 1800)
        );

        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(new LoginRequest("alice", "alice"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.access_token").value("access.jwt.token"))
                .andExpect(jsonPath("$.refresh_token").value("refresh.jwt.token"))
                .andExpect(jsonPath("$.token_type").value("Bearer"))
                .andExpect(jsonPath("$.expires_in").value(300))
                .andExpect(jsonPath("$.refresh_expires_in").value(1800));
    }

    @Test
    void login_returns_400_when_username_blank() throws Exception {
        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"","password":"alice"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_request"));
    }

    @Test
    void login_returns_401_with_invalid_credentials_code() throws Exception {
        when(authService.login(any())).thenThrow(
                new AuthException(HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_CREDENTIALS));

        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(new LoginRequest("alice", "wrong"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("invalid_credentials"));
    }
}
