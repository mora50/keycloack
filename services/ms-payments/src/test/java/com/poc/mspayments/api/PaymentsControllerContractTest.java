package com.poc.mspayments.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Contract test for POST /payments.
 * Validates that the controller echoes X-User-Id and produces a payment_id.
 */
@WebMvcTest(PaymentsController.class)
class PaymentsControllerContractTest {

    @Autowired
    MockMvc mockMvc;

    @Test
    void create_payment_echoes_x_user_id_and_produces_payment_id() throws Exception {
        mockMvc.perform(post("/payments")
                        .header("X-User-Id", "6c8a1234-5678-90ab-cdef-1234567890ab")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amount": 99.90, "currency": "BRL"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user_id").value("6c8a1234-5678-90ab-cdef-1234567890ab"))
                .andExpect(jsonPath("$.payment_id").exists())
                .andExpect(jsonPath("$.status").value("accepted"));
    }

    @Test
    void create_payment_returns_400_when_x_user_id_missing() throws Exception {
        mockMvc.perform(post("/payments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amount": 1.0, "currency": "BRL"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("missing_x_user_id"));
    }
}
