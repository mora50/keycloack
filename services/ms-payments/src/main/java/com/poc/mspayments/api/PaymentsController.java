package com.poc.mspayments.api;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/payments")
public class PaymentsController {

    private static final Logger log = LoggerFactory.getLogger(PaymentsController.class);

    @PostMapping
    public ResponseEntity<?> create(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestBody(required = false) Map<String, Object> body) {

        if (userId == null || userId.isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "missing_x_user_id"));
        }
        log.info("X-User-Id={} creating payment", userId);
        return ResponseEntity.ok(Map.of(
                "user_id", userId,
                "payment_id", UUID.randomUUID().toString(),
                "status", "accepted"
        ));
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "UP");
    }
}
