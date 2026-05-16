// packages/templates/src/load-tests/k6-load-test.js
// ─── k6 Load Testing Suite ────────────────────────────────────────────────────
// Run with: k6 run src/load-tests/k6-load-test.js
// Install k6: brew install k6  (macOS) or https://k6.io/docs/getting-started/installation

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ─── Custom metrics ───────────────────────────────────────────────────────────
const errorRate = new Rate('errors');
const generateDuration = new Trend('generate_duration', true);
const previewDuration = new Trend('preview_duration', true);
const updateDuration = new Trend('update_duration', true);
const successfulGenerations = new Counter('successful_generations');

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4001';
const TENANT_ID = __ENV.TENANT_ID || 'load-test-tenant';

// ─── Load stages ──────────────────────────────────────────────────────────────
export const options = {
  stages: [
    { duration: '30s', target: 5 },    // Ramp up to 5 users
    { duration: '1m', target: 10 },    // Ramp up to 10 users
    { duration: '2m', target: 10 },    // Hold at 10 users
    { duration: '30s', target: 20 },   // Spike to 20 users
    { duration: '1m', target: 20 },    // Hold spike
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    // 95% of requests must complete within 2s
    http_req_duration: ['p(95)<2000'],
    // Error rate must stay below 1%
    errors: ['rate<0.01'],
    // Generate endpoint p99 < 5s
    generate_duration: ['p(99)<5000'],
    // Preview endpoint p95 < 3s
    preview_duration: ['p(95)<3000'],
  },
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const entities = [
  {
    name: 'Customer',
    pluralName: 'Customers',
    tableName: 'customers',
    tenantScoped: true,
    timestamps: true,
    fields: [
      { name: 'name', type: 'string', label: 'Name', required: true },
      { name: 'email', type: 'email', label: 'Email', required: true, unique: true },
      { name: 'status', type: 'enum', label: 'Status', required: true, enumValues: ['active', 'inactive'] },
    ],
  },
];

const headers = { 'Content-Type': 'application/json' };

// ─── Scenario: Health check ───────────────────────────────────────────────────
function testHealth() {
  group('health check', () => {
    const res = http.get(`${BASE_URL}/health`);
    const ok = check(res, {
      'health status 200': (r) => r.status === 200,
      'health body has status': (r) => JSON.parse(r.body).status !== undefined,
    });
    errorRate.add(!ok);
  });
}

// ─── Scenario: Generate ───────────────────────────────────────────────────────
function testGenerate() {
  group('template generate', () => {
    const payload = JSON.stringify({
      tenantId: TENANT_ID,
      entities,
      appName: `Load Test App ${__VU}`,
      appType: 'crud',
    });

    const start = Date.now();
    const res = http.post(`${BASE_URL}/api/templates/generate`, payload, { headers });
    const duration = Date.now() - start;
    generateDuration.add(duration);

    const ok = check(res, {
      'generate status 200': (r) => r.status === 200,
      'generate has appId': (r) => {
        try { return JSON.parse(r.body).appId !== undefined; } catch { return false; }
      },
      'generate has manifestJson': (r) => {
        try { return typeof JSON.parse(r.body).manifestJson === 'string'; } catch { return false; }
      },
    });

    if (ok) successfulGenerations.add(1);
    errorRate.add(!ok);
  });
}

// ─── Scenario: Preview ────────────────────────────────────────────────────────
function testPreview() {
  group('template preview', () => {
    const payload = JSON.stringify({
      tenantId: TENANT_ID,
      entities,
      appName: `Preview Test ${__VU}`,
      appType: 'crud',
      ttlSeconds: 300,
    });

    const start = Date.now();
    const res = http.post(`${BASE_URL}/api/templates/preview`, payload, { headers });
    const duration = Date.now() - start;
    previewDuration.add(duration);

    const ok = check(res, {
      'preview status 200': (r) => r.status === 200,
      'preview has previewUrl': (r) => {
        try { return JSON.parse(r.body).previewUrl !== undefined; } catch { return false; }
      },
    });

    errorRate.add(!ok);
  });
}

// ─── Scenario: Incremental update ────────────────────────────────────────────
function testUpdate() {
  group('template update', () => {
    const payload = JSON.stringify({
      existingSpec: { id: 'load-test-spec', appType: 'crud', entities },
      existingManifestJson: JSON.stringify({ appId: 'load-test-spec', version: 1 }),
      refinementPrompt: 'Add a notes field to Customer',
    });

    const start = Date.now();
    const res = http.post(`${BASE_URL}/api/templates/update`, payload, { headers });
    const duration = Date.now() - start;
    updateDuration.add(duration);

    const ok = check(res, {
      'update status 200': (r) => r.status === 200,
      'update has diff': (r) => {
        try { return JSON.parse(r.body).diff !== undefined; } catch { return false; }
      },
    });

    errorRate.add(!ok);
  });
}

// ─── Scenario: Team 3 integration ────────────────────────────────────────────
function testFromUnderstanding() {
  group('from-understanding', () => {
    const payload = JSON.stringify({
      tenantId: TENANT_ID,
      understanding: {
        appName: `Understanding Test ${__VU}`,
        appType: 'crud',
        features: ['create', 'list', 'delete'],
        pages: ['customers'],
        entities,
      },
    });

    const res = http.post(`${BASE_URL}/api/templates/from-understanding`, payload, { headers });

    const ok = check(res, {
      'from-understanding status 200': (r) => r.status === 200,
      'from-understanding has adapted': (r) => {
        try { return JSON.parse(r.body).adapted !== undefined; } catch { return false; }
      },
    });

    errorRate.add(!ok);
  });
}

// ─── Main VU scenario ─────────────────────────────────────────────────────────
export default function () {
  // Rotate through scenarios to simulate realistic traffic mix
  const scenario = (__ITER % 5);

  switch (scenario) {
    case 0: testHealth(); break;
    case 1: testGenerate(); break;
    case 2: testPreview(); break;
    case 3: testUpdate(); break;
    case 4: testFromUnderstanding(); break;
  }

  sleep(1);
}

// ─── Summary report ───────────────────────────────────────────────────────────
export function handleSummary(data) {
  return {
    'load-test-results.json': JSON.stringify(data, null, 2),
    stdout: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  OneAtlas Template Backend — Load Test
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total requests:       ${data.metrics.http_reqs?.values?.count ?? 'N/A'}
  Successful gens:      ${data.metrics.successful_generations?.values?.count ?? 'N/A'}
  Error rate:           ${((data.metrics.errors?.values?.rate ?? 0) * 100).toFixed(2)}%
  p95 duration:         ${data.metrics.http_req_duration?.values?.['p(95)']?.toFixed(0) ?? 'N/A'}ms
  p99 generate:         ${data.metrics.generate_duration?.values?.['p(99)']?.toFixed(0) ?? 'N/A'}ms
  p95 preview:          ${data.metrics.preview_duration?.values?.['p(95)']?.toFixed(0) ?? 'N/A'}ms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`,
  };
}
