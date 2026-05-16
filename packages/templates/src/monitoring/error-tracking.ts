// packages/templates/src/monitoring/error-tracking.ts
// ─── Sentry Error Tracking — wraps Sentry SDK for server-side error capture ───

import * as Sentry from '@sentry/node';
import type { Request, Response, NextFunction } from 'express';

let _initialized = false;

export interface ErrorTrackingConfig {
  dsn: string;
  environment: string;
  release?: string;
  tracesSampleRate?: number;
  debug?: boolean;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export function initErrorTracking(config: ErrorTrackingConfig): void {
  if (_initialized) return;

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release ?? process.env['npm_package_version'],
    tracesSampleRate: config.tracesSampleRate ?? (config.environment === 'production' ? 0.2 : 1.0),
    debug: config.debug ?? false,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
    ],
    beforeSend(event) {
      // Strip PII from request bodies
      if (event.request?.data) {
        const data = event.request.data as Record<string, unknown>;
        for (const key of ['password', 'token', 'secret', 'apiKey', 'authorization']) {
          if (key in data) data[key] = '[REDACTED]';
        }
      }
      return event;
    },
  });

  _initialized = true;
  console.log(`[ErrorTracking] Sentry initialized (env=${config.environment})`);
}

// ─── Express middleware ───────────────────────────────────────────────────────
export function sentryRequestMiddleware() {
  return Sentry.expressErrorHandler();
}

export function errorHandler() {
  return (err: Error, req: Request, res: Response, _next: NextFunction) => {
    // Capture with Sentry — attach tenant context if available
    Sentry.withScope((scope) => {
      const tenantId = (req as Record<string, unknown>)['tenantId'] as string | undefined;
      if (tenantId) scope.setTag('tenantId', tenantId);
      scope.setTag('method', req.method);
      scope.setTag('path', req.path);
      Sentry.captureException(err);
    });

    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({
      error: status === 500 ? 'Internal server error' : err.message,
      ...(process.env['NODE_ENV'] !== 'production' && { stack: err.stack }),
    });
  };
}

// ─── Manual capture helpers ───────────────────────────────────────────────────
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  Sentry.withScope((scope) => {
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
    }
    Sentry.captureException(err);
  });
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  Sentry.captureMessage(message, level);
}

export function setUserContext(userId: string, orgId: string): void {
  Sentry.setUser({ id: userId, orgId });
}

export function clearUserContext(): void {
  Sentry.setUser(null);
}
