package com.poc.msauth.auth;

import com.poc.msauth.auth.dto.JwksResponse;
import com.poc.msauth.config.KeycloakProperties;
import com.poc.msauth.error.AuthException;
import com.poc.msauth.error.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * Thin client for the Keycloak realm endpoints used by ms-auth.
 *
 * Only ms-auth talks to Keycloak (FR-005 / FR-013). Translates upstream
 * 4xx/5xx into the AuthException error codes documented in the OpenAPI contract.
 */
@Component
public class KeycloakClient {

    private static final Logger log = LoggerFactory.getLogger(KeycloakClient.class);

    private final RestClient restClient;
    private final KeycloakProperties props;

    public KeycloakClient(RestClient keycloakRestClient, KeycloakProperties props) {
        this.restClient = keycloakRestClient;
        this.props = props;
    }

    public Map<String, Object> tokenPassword(String username, String password) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "password");
        form.add("client_id", props.clientId());
        form.add("username", username);
        form.add("password", password);
        return postToken(form, ErrorCode.INVALID_CREDENTIALS);
    }

    public Map<String, Object> tokenRefresh(String refreshToken) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "refresh_token");
        form.add("client_id", props.clientId());
        form.add("refresh_token", refreshToken);
        return postToken(form, ErrorCode.INVALID_REFRESH_TOKEN);
    }

    public JwksResponse certs() {
        try {
            return restClient.get()
                    .uri(props.certsEndpoint())
                    .retrieve()
                    .body(JwksResponse.class);
        } catch (HttpStatusCodeException ex) {
            log.warn("keycloak /certs returned {}", ex.getStatusCode().value());
            throw new AuthException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.IDP_UNAVAILABLE,
                    "keycloak certs endpoint returned " + ex.getStatusCode().value());
        } catch (ResourceAccessException ex) {
            log.warn("keycloak /certs network failure: {}", ex.getMessage());
            throw new AuthException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.IDP_UNAVAILABLE,
                    "keycloak unreachable");
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> postToken(MultiValueMap<String, String> form, ErrorCode on4xx) {
        try {
            return restClient.post()
                    .uri(props.tokenEndpoint())
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(form)
                    .retrieve()
                    .body(Map.class);
        } catch (HttpStatusCodeException ex) {
            HttpStatus status = HttpStatus.resolve(ex.getStatusCode().value());
            if (status != null && status.is4xxClientError()) {
                throw new AuthException(HttpStatus.UNAUTHORIZED, on4xx);
            }
            log.warn("keycloak token endpoint returned {}", ex.getStatusCode().value());
            throw new AuthException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.IDP_UNAVAILABLE,
                    "keycloak token endpoint returned " + ex.getStatusCode().value());
        } catch (ResourceAccessException ex) {
            log.warn("keycloak token endpoint network failure: {}", ex.getMessage());
            throw new AuthException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.IDP_UNAVAILABLE,
                    "keycloak unreachable");
        }
    }
}
