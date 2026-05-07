package com.poc.msauth.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.TimeUnit;

@Configuration
public class CacheConfig {

    public static final String JWKS_CACHE = "jwks";

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager mgr = new CaffeineCacheManager(JWKS_CACHE);
        mgr.setCaffeine(Caffeine.newBuilder()
                .maximumSize(8)
                .expireAfterWrite(60, TimeUnit.SECONDS)
                .recordStats());
        return mgr;
    }
}
