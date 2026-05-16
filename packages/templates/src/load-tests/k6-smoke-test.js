// packages/templates/src/load-tests/k6-smoke-test.js
// ─── k6 Smoke Test — quick sanity check before full load test ─────────────────
// Run with: k6 run src/load-tests/k6-smoke-test.js

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4001';
const TENANT_ID = __ENV.TENANT_ID || 'smoke-test-tenant';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(99)<3000'],
    http_req_failed: ['rate<0.01'],
  },
};

const headers = { 'Content-Type': 'application/json' };

export default function () {
  // 1. Health
  const health = http.get(`${BASE_URL}/health`);
  check(health, { 'health 200': (r) => r.status === 200 });

  // 2. Generate
  const gen = http.post(
    `${BASE_URL}/api/templates/generate`,
    JSON.stringify({
      tenantId: TENANT_ID,
      entities: [{
        name: 'Item', pluralName: 'Items', tableName: 'items',
        tenantScoped: true, timestamps: true,
        fields: [{ name: 'name', type: 'string', label: 'Name', required: true }],
      }],
      appName: 'Smoke Test App',
      appType: 'crud',
    }),
    { headers }
  );
  check(gen, {
    'generate 200': (r) => r.status === 200,
    'generate has appId': (r) => { try { return !!JSON.parse(r.body).appId; } catch { return false; } },
  });

  // 3. From-understanding
  const und = http.post(
    `${BASE_URL}/api/templates/from-understanding`,
    JSON.stringify({
      tenantId: TENANT_ID,
      understanding: {
        appName: 'Smoke Understanding', appType: 'crud',
        features: ['create'], pages: ['items'], entities: [],
      },
    }),
    { headers }
  );
  check(und, { 'from-understanding 200': (r) => r.status === 200 });

  sleep(1);
}
