// chaos-msauth-down.k6.js — paired with chaos-msauth-down.sh.
// Sustains 500 RPS against /api/products with a pre-warmed token.
// During the 30s window where ms-auth is down, the cached-kid path must keep
// returning 200 (CA-008 / SC-007).
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const TOKEN = __ENV.TOKEN;

export const options = {
  scenarios: {
    chaos: {
      executor: 'constant-arrival-rate',
      rate: 500,
      timeUnit: '1s',
      duration: '40s',
      preAllocatedVUs: 100,
      maxVUs: 500,
    },
  },
  thresholds: {
    'http_req_failed': ['rate<0.01'],
    'http_req_duration': ['p(95)<200'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/products`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  check(res, {
    'status 200': r => r.status === 200,
  });
}
