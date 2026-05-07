# k6 — load + chaos suites

## `load-authenticated-route.js` (SC-001 / SC-003)

```bash
k6 run tests/k6/load-authenticated-route.js \
  --env BASE_URL=http://localhost:8000 \
  --env USERNAME=alice --env PASSWORD=alice
```

**Thresholds**:

| Metric | Threshold | Encodes |
|--------|-----------|---------|
| `http_req_failed{type:auth}` | `rate<0.001` | SC-003 (errors ~0) |
| `http_req_duration{type:auth}` (p99) | `< 50 ms` | upstream + gateway p99 budget |
| `gateway_validation_p99` (p99)       | `< 5 ms`  | SC-001 (best-effort estimator — see note below) |

> **Note**: `gateway_validation_p99` subtracts an estimated upstream baseline (~1 ms in the
> compose network) from `http_req_duration`. For an exact gateway-only metric, enable Kong's
> bundled `prometheus` plugin globally and scrape `kong_request_latency_ms` instead.

## `chaos-msauth-down.sh` + `chaos-msauth-down.k6.js` (CA-008 / CA-009 / SC-007)

```bash
bash tests/k6/chaos-msauth-down.sh
```

The script:

1. Warms the JWKS cache with one valid request.
2. Starts a 500 RPS k6 run (`chaos-msauth-down.k6.js`) for 40s.
3. After 10s: `docker compose stop ms-auth` (cached `kid` traffic must keep returning 200).
4. After 30s of outage: `docker compose start ms-auth`.

Inspect the k6 summary's `http_req_failed` to confirm the cached-`kid` path stays at 100% success
during the outage window.
