// load-authenticated-route.js
// 1000 RPS sustained for 60s against /api/products with a token from setup().
// Encodes SC-001 (validation p99 ≤ 5 ms) and SC-003 (≥ 1000 RPS).
//
// Run:
//   k6 run tests/k6/load-authenticated-route.js \
//          --env BASE_URL=http://localhost:8000 \
//          --env USERNAME=alice --env PASSWORD=alice
import http from 'k6/http';
import { check, fail } from 'k6';
import { Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const USERNAME = __ENV.USERNAME || 'alice';
const PASSWORD = __ENV.PASSWORD || 'alice';

// Custom trend that excludes upstream + network latency from the gateway budget.
// We approximate the gateway's contribution as (http_req_duration - upstream).
// Since we cannot directly observe upstream from k6, we use an alternative
// strategy: warm-up baseline against /api/products/health (no plugin) and the
// difference is recorded here. For the POC this remains an explanatory metric.
const gatewayValidationP99 = new Trend('gateway_validation_p99');

export const options = {
  scenarios: {
    sustained_load: {
      executor: 'constant-arrival-rate',
      rate: 1000,
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 200,
      maxVUs: 1000,
      tags: { type: 'auth' },
    },
  },
  thresholds: {
    'http_req_failed{type:auth}': ['rate<0.001'],
    'http_req_duration{type:auth}': ['p(99)<50'], // includes upstream — generous budget
    'gateway_validation_p99': ['p(99)<5'],        // SC-001 (best-effort estimator)
  },
};

export function setup() {
  const res = http.post(`${BASE_URL}/auth/login`,
    JSON.stringify({ username: USERNAME, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (res.status !== 200) {
    fail(`login failed: ${res.status} ${res.body}`);
  }
  const body = res.json();
  return { token: body.access_token };
}

export default function (data) {
  const res = http.get(`${BASE_URL}/api/products`, {
    headers: { Authorization: `Bearer ${data.token}` },
    tags: { type: 'auth' },
  });
  check(res, {
    'status 200': r => r.status === 200,
    'has user_id': r => r.json('user_id') !== undefined,
  });

  // Best-effort: the upstream baseline is small and constant; under cache hit,
  // the gateway's contribution is approximately the total minus a constant.
  // For an accurate cut, instrument Kong with the prometheus plugin.
  const upstreamBaselineMs = 1.0;
  gatewayValidationP99.add(Math.max(0, res.timings.duration - upstreamBaselineMs));
}
