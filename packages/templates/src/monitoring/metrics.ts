// packages/templates/src/monitoring/metrics.ts
// ─── Monitoring: Health checks + Prometheus-compatible metrics ────────────────

import type { Request, Response, Router } from 'express';
import express from 'express';

// ─── In-memory metric counters ────────────────────────────────────────────────
interface Counter { name: string; help: string; value: number; labels: Record<string, string> }
interface Histogram { name: string; help: string; buckets: number[]; values: number[]; labels: Record<string, string> }
interface Gauge { name: string; help: string; value: number; labels: Record<string, string> }

const counters = new Map<string, Counter>();
const histograms = new Map<string, Histogram>();
const gauges = new Map<string, Gauge>();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function counterKey(name: string, labels: Record<string, string>) {
  return `${name}{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')}}`;
}

export function incrementCounter(name: string, help: string, labels: Record<string, string> = {}) {
  const key = counterKey(name, labels);
  const existing = counters.get(key);
  if (existing) {
    existing.value++;
  } else {
    counters.set(key, { name, help, value: 1, labels });
  }
}

export function recordHistogram(name: string, help: string, value: number, labels: Record<string, string> = {}) {
  const key = counterKey(name, labels);
  const existing = histograms.get(key);
  if (existing) {
    existing.values.push(value);
  } else {
    histograms.set(key, {
      name, help,
      buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
      values: [value],
      labels,
    });
  }
}

export function setGauge(name: string, help: string, value: number, labels: Record<string, string> = {}) {
  const key = counterKey(name, labels);
  gauges.set(key, { name, help, value, labels });
}

// ─── Prometheus text format serialiser ────────────────────────────────────────
function toPrometheusText(): string {
  const lines: string[] = [];

  for (const c of counters.values()) {
    const labelStr = Object.entries(c.labels).map(([k, v]) => `${k}="${v}"`).join(',');
    lines.push(`# HELP ${c.name} ${c.help}`);
    lines.push(`# TYPE ${c.name} counter`);
    lines.push(`${c.name}{${labelStr}} ${c.value}`);
  }

  for (const g of gauges.values()) {
    const labelStr = Object.entries(g.labels).map(([k, v]) => `${k}="${v}"`).join(',');
    lines.push(`# HELP ${g.name} ${g.help}`);
    lines.push(`# TYPE ${g.name} gauge`);
    lines.push(`${g.name}{${labelStr}} ${g.value}`);
  }

  for (const h of histograms.values()) {
    const labelStr = Object.entries(h.labels).map(([k, v]) => `${k}="${v}"`).join(',');
    const sorted = [...h.values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const count = sorted.length;
    lines.push(`# HELP ${h.name} ${h.help}`);
    lines.push(`# TYPE ${h.name} histogram`);
    for (const bucket of h.buckets) {
      const le = sorted.filter((v) => v <= bucket).length;
      lines.push(`${h.name}_bucket{${labelStr},le="${bucket}"} ${le}`);
    }
    lines.push(`${h.name}_bucket{${labelStr},le="+Inf"} ${count}`);
    lines.push(`${h.name}_sum{${labelStr}} ${sum}`);
    lines.push(`${h.name}_count{${labelStr}} ${count}`);
  }

  return lines.join('\n') + '\n';
}

// ─── Request duration middleware ──────────────────────────────────────────────
export function requestMetricsMiddleware() {
  return (req: Request, res: Response, next: () => void) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const route = req.route?.path ?? req.path ?? 'unknown';
      const labels = { method: req.method, route, status: String(res.statusCode) };

      incrementCounter(
        'http_requests_total',
        'Total HTTP requests',
        labels
      );
      recordHistogram(
        'http_request_duration_ms',
        'HTTP request duration in milliseconds',
        duration,
        { method: req.method, route }
      );
    });
    next();
  };
}

// ─── Health check state ───────────────────────────────────────────────────────
interface HealthCheck {
  name: string;
  check: () => Promise<{ status: 'ok' | 'degraded' | 'down'; message?: string; latencyMs?: number }>;
}

const healthChecks: HealthCheck[] = [];

export function registerHealthCheck(check: HealthCheck) {
  healthChecks.push(check);
}

export function registerDefaultHealthChecks() {
  // Process uptime check
  registerHealthCheck({
    name: 'process',
    check: async () => ({
      status: 'ok',
      message: `uptime ${Math.floor(process.uptime())}s`,
      latencyMs: 0,
    }),
  });

  // Memory check — warn if heap > 512MB
  registerHealthCheck({
    name: 'memory',
    check: async () => {
      const used = process.memoryUsage().heapUsed / 1024 / 1024;
      return {
        status: used > 512 ? 'degraded' : 'ok',
        message: `heap ${Math.round(used)}MB`,
        latencyMs: 0,
      };
    },
  });
}

// ─── Monitoring router ────────────────────────────────────────────────────────
export function createMonitoringRouter(): Router {
  const router = express.Router();

  // GET /health — full health check (used by load balancers)
  router.get('/health', async (_req: Request, res: Response) => {
    const start = Date.now();
    const results: Record<string, { status: string; message?: string; latencyMs?: number }> = {};

    let overallStatus: 'ok' | 'degraded' | 'down' = 'ok';

    await Promise.allSettled(
      healthChecks.map(async (hc) => {
        try {
          const result = await hc.check();
          results[hc.name] = result;
          if (result.status === 'down') overallStatus = 'down';
          else if (result.status === 'degraded' && overallStatus !== 'down') overallStatus = 'degraded';
        } catch (err) {
          results[hc.name] = { status: 'down', message: (err as Error).message };
          overallStatus = 'down';
        }
      })
    );

    // Track health check latency
    setGauge('health_check_duration_ms', 'Health check duration', Date.now() - start);

    const httpStatus = overallStatus === 'ok' ? 200 : overallStatus === 'degraded' ? 200 : 503;
    res.status(httpStatus).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env['npm_package_version'] ?? '1.0.0',
      checks: results,
    });
  });

  // GET /health/live — simple liveness probe (k8s)
  router.get('/health/live', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'alive' });
  });

  // GET /health/ready — readiness probe
  router.get('/health/ready', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ready' });
  });

  // GET /metrics — Prometheus scrape endpoint
  router.get('/metrics', (_req: Request, res: Response) => {
    // Update process gauges on each scrape
    setGauge('process_heap_bytes', 'Heap used bytes', process.memoryUsage().heapUsed);
    setGauge('process_uptime_seconds', 'Process uptime seconds', process.uptime());

    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(toPrometheusText());
  });

  return router;
}

// ─── Template-specific metric helpers ────────────────────────────────────────
export const templateMetrics = {
  generationStarted: (appType: string) =>
    incrementCounter('template_generations_total', 'Template generation attempts', { appType, status: 'started' }),

  generationCompleted: (appType: string, durationMs: number) => {
    incrementCounter('template_generations_total', 'Template generation attempts', { appType, status: 'completed' });
    recordHistogram('template_generation_duration_ms', 'Template generation duration', durationMs, { appType });
  },

  generationFailed: (appType: string, reason: string) =>
    incrementCounter('template_generations_total', 'Template generation attempts', { appType, status: 'failed', reason }),

  previewCreated: () =>
    incrementCounter('template_previews_total', 'Template previews created', {}),

  deploymentStarted: () =>
    incrementCounter('template_deployments_total', 'Template deployments', { status: 'started' }),

  deploymentCompleted: (durationMs: number) => {
    incrementCounter('template_deployments_total', 'Template deployments', { status: 'completed' });
    recordHistogram('template_deployment_duration_ms', 'Template deployment duration', durationMs, {});
  },

  workflowStepExecuted: (stepType: string, status: 'success' | 'failed') =>
    incrementCounter('workflow_steps_total', 'Workflow steps executed', { stepType, status }),
};
