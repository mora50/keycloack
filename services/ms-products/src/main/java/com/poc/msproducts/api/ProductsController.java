package com.poc.msproducts.api;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/products")
public class ProductsController {

    private static final Logger log = LoggerFactory.getLogger(ProductsController.class);

    private static final List<Map<String, String>> CATALOG = List.of(
            Map.of("id", "P-001", "name", "Demo Product"),
            Map.of("id", "P-002", "name", "Another Demo Product")
    );

    @GetMapping
    public ResponseEntity<?> list(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestHeader(value = "X-Claim-email", required = false) String email,
            @RequestHeader(value = "X-Claim-preferred_username", required = false) String preferredUsername) {

        if (userId == null || userId.isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "missing_x_user_id"));
        }
        log.info("X-User-Id={} listing products", userId);
        Map<String, Object> body = new HashMap<>();
        body.put("user_id", userId);
        body.put("email", email);
        body.put("preferred_username", preferredUsername);
        body.put("products", CATALOG);
        return ResponseEntity.ok(body);
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "UP");
    }
}
