package com.poc.msauth.auth;

import com.poc.msauth.auth.dto.JwksResponse;
import com.poc.msauth.error.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Contract test for GET /auth/jwks.
 * Validates the JwksResponse shape from contracts/ms-auth.openapi.yaml.
 */
@WebMvcTest(AuthController.class)
@Import(GlobalExceptionHandler.class)
class AuthControllerJwksContractTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    AuthService authService;

    @Test
    void jwks_returns_keyset_with_expected_jwk_fields() throws Exception {
        when(authService.jwks()).thenReturn(new JwksResponse(List.of(
                new JwksResponse.Jwk("kid-A", "RSA", "RS256", "sig", "modulus-base64url", "AQAB")
        )));

        mockMvc.perform(get("/auth/jwks"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("max-age=60")))
                .andExpect(jsonPath("$.keys[0].kid").value("kid-A"))
                .andExpect(jsonPath("$.keys[0].kty").value("RSA"))
                .andExpect(jsonPath("$.keys[0].alg").value("RS256"))
                .andExpect(jsonPath("$.keys[0].use").value("sig"))
                .andExpect(jsonPath("$.keys[0].n").value("modulus-base64url"))
                .andExpect(jsonPath("$.keys[0].e").value("AQAB"));
    }
}
