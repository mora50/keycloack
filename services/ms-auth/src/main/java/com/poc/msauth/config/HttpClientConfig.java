package com.poc.msauth.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

@Configuration
public class HttpClientConfig {

    @Bean
    public RestClient keycloakRestClient(
            KeycloakProperties props,
            @Value("${ms-auth.http.connect-timeout-ms:1000}") int connectTimeoutMs,
            @Value("${ms-auth.http.read-timeout-ms:3000}") int readTimeoutMs) {

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofMillis(connectTimeoutMs));
        factory.setReadTimeout(Duration.ofMillis(readTimeoutMs));

        return RestClient.builder()
                .baseUrl(props.baseUrl())
                .requestFactory((ClientHttpRequestFactory) factory)
                .build();
    }
}
