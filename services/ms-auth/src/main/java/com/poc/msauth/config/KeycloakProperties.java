package com.poc.msauth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "keycloak")
public record KeycloakProperties(
        String baseUrl,
        String realm,
        String clientId
) {
    public String tokenEndpoint() {
        return baseUrl + "/realms/" + realm + "/protocol/openid-connect/token";
    }

    public String certsEndpoint() {
        return baseUrl + "/realms/" + realm + "/protocol/openid-connect/certs";
    }
}
