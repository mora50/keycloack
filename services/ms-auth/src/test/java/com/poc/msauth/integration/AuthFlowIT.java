package com.poc.msauth.integration;

import com.poc.msauth.auth.dto.JwksResponse;
import com.poc.msauth.auth.dto.LoginRequest;
import com.poc.msauth.auth.dto.RefreshRequest;
import com.poc.msauth.auth.dto.TokenResponse;
import dasniko.testcontainers.keycloak.KeycloakContainer;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.io.File;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test exercising the full login + refresh + JWKS flow against a real Keycloak.
 * Uses Testcontainers' Keycloak module with the POC realm import.
 *
 * Maps to spec scenarios CA-001, CA-002 plus FR-013 (JWKS proxy w/ short cache).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class AuthFlowIT {

    @Container
    static final KeycloakContainer KEYCLOAK = new KeycloakContainer("quay.io/keycloak/keycloak:26.6.1")
            .withRealmImportFile("/poc-realm.json")
            .withCopyFileToContainer(
                    org.testcontainers.utility.MountableFile.forHostPath(
                            new File("../../keycloak/realm-export/poc-realm.json").getAbsolutePath()),
                    "/poc-realm.json");

    @DynamicPropertySource
    static void registerKeycloakProps(DynamicPropertyRegistry r) {
        r.add("keycloak.base-url", KEYCLOAK::getAuthServerUrl);
        r.add("keycloak.realm", () -> "poc");
        r.add("keycloak.client-id", () -> "poc-client");
    }

    @LocalServerPort
    int port;

    @Autowired
    TestRestTemplate http;

    @BeforeAll
    static void boot() {
        // Container started by @Container
    }

    @Test
    void CA001_login_then_CA002_refresh_then_jwks_returns_keys() {
        // CA-001: login
        TokenResponse loginResp = http.postForObject(
                "http://localhost:" + port + "/auth/login",
                jsonBody(new LoginRequest("alice", "alice")),
                TokenResponse.class);

        assertThat(loginResp).isNotNull();
        assertThat(loginResp.accessToken()).isNotBlank();
        assertThat(loginResp.refreshToken()).isNotBlank();
        assertThat(loginResp.tokenType()).isEqualTo("Bearer");

        // CA-002: refresh
        TokenResponse refreshResp = http.postForObject(
                "http://localhost:" + port + "/auth/refresh",
                jsonBody(new RefreshRequest(loginResp.refreshToken())),
                TokenResponse.class);

        assertThat(refreshResp).isNotNull();
        assertThat(refreshResp.accessToken()).isNotBlank();

        // JWKS proxy
        ResponseEntity<JwksResponse> jwksResp = http.exchange(
                "http://localhost:" + port + "/auth/jwks",
                HttpMethod.GET,
                null,
                JwksResponse.class);

        assertThat(jwksResp.getStatusCode().value()).isEqualTo(200);
        assertThat(jwksResp.getBody()).isNotNull();
        List<JwksResponse.Jwk> keys = jwksResp.getBody().keys();
        assertThat(keys).isNotEmpty();
        assertThat(keys.getFirst().kty()).isEqualTo("RSA");
        assertThat(keys.getFirst().kid()).isNotBlank();
        assertThat(jwksResp.getHeaders().getFirst("Cache-Control")).contains("max-age=60");
    }

    private static <T> HttpEntity<T> jsonBody(T body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, headers);
    }
}
