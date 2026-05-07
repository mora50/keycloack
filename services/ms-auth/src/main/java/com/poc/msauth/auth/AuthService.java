package com.poc.msauth.auth;

import com.poc.msauth.auth.dto.JwksResponse;
import com.poc.msauth.auth.dto.LoginRequest;
import com.poc.msauth.auth.dto.RefreshRequest;
import com.poc.msauth.auth.dto.TokenResponse;
import com.poc.msauth.config.CacheConfig;
import com.poc.msauth.error.AuthException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * Orchestrates login (grant=password), refresh (grant=refresh_token) and JWKS proxy.
 *
 * Translates Keycloak responses into the public OpenAPI contract:
 *   - 4xx -> AuthException(401, invalid_credentials | invalid_refresh_token)
 *   - 5xx / network -> AuthException(503, idp_unavailable)
 * Strips id_token from token responses (sanitization, see contract description).
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private static final String JWKS_CACHE_KEY = "current";

    private final KeycloakClient keycloak;
    private final CacheManager cacheManager;

    public AuthService(KeycloakClient keycloak, CacheManager cacheManager) {
        this.keycloak = keycloak;
        this.cacheManager = cacheManager;
    }

    public TokenResponse login(LoginRequest request) {
        Map<String, Object> raw = keycloak.tokenPassword(request.username(), request.password());
        return toTokenResponse(raw);
    }

    public TokenResponse refresh(RefreshRequest request) {
        Map<String, Object> raw = keycloak.tokenRefresh(request.refreshToken());
        return toTokenResponse(raw);
    }

    /**
     * Returns the JWKS, falling back to the last successful response when Keycloak
     * is briefly unavailable (US4 / SC-007). Manual cache lookup so we control the
     * fallback semantics — @Cacheable would not let us return stale on miss + error.
     */
    public JwksResponse jwks() {
        Cache cache = cacheManager.getCache(CacheConfig.JWKS_CACHE);
        if (cache != null) {
            JwksResponse cached = cache.get(JWKS_CACHE_KEY, JwksResponse.class);
            if (cached != null) {
                return cached;
            }
        }
        try {
            JwksResponse fresh = keycloak.certs();
            if (cache != null) {
                cache.put(JWKS_CACHE_KEY, fresh);
            }
            return fresh;
        } catch (AuthException ex) {
            log.warn("keycloak unavailable; cache empty, propagating idp_unavailable");
            throw ex;
        }
    }

    private TokenResponse toTokenResponse(Map<String, Object> raw) {
        String access = stringValue(raw, "access_token");
        String refresh = stringValue(raw, "refresh_token");
        Integer expiresIn = intValue(raw, "expires_in");
        Integer refreshExpiresIn = intValue(raw, "refresh_expires_in");
        return TokenResponse.bearer(access, refresh, expiresIn, refreshExpiresIn);
    }

    private static String stringValue(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v == null ? null : v.toString();
    }

    private static Integer intValue(Map<String, Object> m, String key) {
        Object v = m.get(key);
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(v.toString());
        } catch (NumberFormatException ex) {
            log.warn("non-numeric {} in token response: {}", key, v);
            return null;
        }
    }
}
