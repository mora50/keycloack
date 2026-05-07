package com.poc.msproducts.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Contract test for GET /products.
 * Validates that the controller echoes X-User-Id (the trust contract — FR-014).
 */
@WebMvcTest(ProductsController.class)
class ProductsControllerContractTest {

    @Autowired
    MockMvc mockMvc;

    @Test
    void list_products_echoes_x_user_id_into_response_body() throws Exception {
        mockMvc.perform(get("/products")
                        .header("X-User-Id", "6c8a1234-5678-90ab-cdef-1234567890ab")
                        .header("X-Claim-email", "alice@example.com")
                        .header("X-Claim-preferred_username", "alice"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user_id").value("6c8a1234-5678-90ab-cdef-1234567890ab"))
                .andExpect(jsonPath("$.email").value("alice@example.com"))
                .andExpect(jsonPath("$.preferred_username").value("alice"))
                .andExpect(jsonPath("$.products[0].id").exists());
    }

    @Test
    void list_products_returns_400_missing_x_user_id_when_header_absent() throws Exception {
        mockMvc.perform(get("/products"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("missing_x_user_id"));
    }

    @Test
    void health_endpoint_returns_200_without_x_user_id() throws Exception {
        mockMvc.perform(get("/products/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }
}
