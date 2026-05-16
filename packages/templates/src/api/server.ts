// packages/templates/src/api/server.ts
// ─── HTTP API Layer — exposes template pipelines as REST endpoints for Team 2 ───

import express, { Request, Response, NextFunction } from 'express';
import {
  runGenerationPipeline,
  runPreviewPipeline,
  runDeployPipeline,
  runIncrementalUpdate,
} from '../pipeline.js';
import { previewEngine } from '../preview/index.js';
import { deploymentEngine } from '../deployment/index.js';
import { workflowExecutor } from '../workflows/executor.js';
import { buildSpecFromEntities } from '../spec-engine/index.js';
import type { EntityDef } from '../types/app-spec.js';
import {
  initErrorTracking,
  sentryRequestMiddleware,
  errorHandler,
  captureError,
  registerDefaultHealthChecks,
  createMonitoringRouter,
  requestMetricsMiddleware,
  templateMetrics,
} from '../monitoring/index.js';

// ─── AppUnderstanding → AppSpec adapter (Team 3 contract bridge) ──────────────
export interface AppUnderstanding {
  appName: string;
  appType: string;
  features: string[];
  pages: string[];
  entities: Partial<EntityDef>[];
  workflows?: unknown[];
}

function adaptAppUnderstanding(tenantId: string, understanding: AppUnderstanding) {
  // Normalise appType
  const knownTypes = ['crud', 'dashboard', 'workflow', 'admin-panel'] as const;
  const appType = knownTypes.includes(understanding.appType as typeof knownTypes[number])
    ? (understanding.appType as typeof knownTypes[number])
    : 'crud';

  // Fill in mandatory EntityDef fields that Team 3 might omit
  const entities: EntityDef[] = (understanding.entities ?? []).map((e, idx) => {
    const name = e.name ?? `Entity${idx + 1}`;
    return {
      name,
      pluralName: e.pluralName ?? `${name}s`,
      tableName: e.tableName ?? name.toLowerCase().replace(/\s+/g, '_'),
      fields: e.fields ?? [
        { name: 'name', type: 'string', label: 'Name', required: true },
      ],
      softDelete: e.softDelete ?? false,
      timestamps: e.timestamps ?? true,
      tenantScoped: e.tenantScoped ?? true,
    };
  });

  // If Team 3 gave no entities, synthesise one from the page list
  if (entities.length === 0 && understanding.pages.length > 0) {
    const pageName = understanding.pages[0]!;
    const name = pageName.charAt(0).toUpperCase() + pageName.slice(1).replace(/-./g, (m) => m[1]!.toUpperCase());
    entities.push({
      name,
      pluralName: `${name}s`,
      tableName: pageName.toLowerCase().replace(/-/g, '_'),
      fields: [{ name: 'name', type: 'string', label: 'Name', required: true }],
      softDelete: false,
      timestamps: true,
      tenantScoped: true,
    });
  }

  return { tenantId, appName: understanding.appName, appType, entities };
}

// ─── Express app ──────────────────────────────────────────────────────────────
export function createApiServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // ── Monitoring middleware ──────────────────────────────────────────────────
  app.use(requestMetricsMiddleware());
  app.use(sentryRequestMiddleware());

  // ── Health + metrics routes ────────────────────────────────────────────────
  app.use(createMonitoringRouter());

  // Legacy health check (keep for backwards compat)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'oneatlas-template-backend', ts: new Date().toISOString() });
  });

  // ── Generate ────────────────────────────────────────────────────────────────
  // POST /api/templates/generate
  // Body: { userPrompt?, entities?, appName?, appType?, tenantId }
  app.post('/api/templates/generate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, userPrompt, entities, appName, appType, existingManifestJson, existingSpec } = req.body;
      if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });
      if (!userPrompt && !entities) return res.status(400).json({ error: 'userPrompt or entities required' });

      const _genStart = Date.now();
      templateMetrics.generationStarted(appType ?? 'crud');
      const result = await runGenerationPipeline({
        tenantId,
        userPrompt,
        entities,
        appName,
        appType,
        existingManifestJson,
        existingSpec,
      });
      templateMetrics.generationCompleted(appType ?? 'crud', Date.now() - _genStart);

      res.status(200).json({
        appId: result.spec.id,
        appType: result.spec.appType,
        entities: result.entities,
        routes: result.routes,
        fileCount: result.fileCount,
        manifestJson: result.manifestJson,
        spec: result.spec,
      });
    } catch (err) {
      next(err);
    }
  });

  // ── Preview ─────────────────────────────────────────────────────────────────
  // POST /api/templates/preview
  // Body: { userPrompt?, entities?, appName?, appType?, tenantId, ttlSeconds? }
  app.post('/api/templates/preview', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, userPrompt, entities, appName, appType, ttlSeconds = 3600 } = req.body;
      if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

      const result = await runPreviewPipeline({
        tenantId,
        userPrompt,
        entities,
        appName,
        appType,
        ttlSeconds,
      });

      res.status(200).json({
        appId: result.spec.id,
        previewUrl: result.preview?.previewUrl,
        previewId: result.preview?.previewId,
        expiresAt: result.preview?.expiresAt,
        entities: result.entities,
        manifestJson: result.manifestJson,
      });
    } catch (err) {
      next(err);
    }
  });

  // ── Deploy ──────────────────────────────────────────────────────────────────
  // POST /api/templates/deploy
  // Body: { tenantId, userPrompt?, entities?, appName?, appType?, projectName? }
  app.post('/api/templates/deploy', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, userPrompt, entities, appName, appType, projectName } = req.body;
      if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

      const result = await runDeployPipeline({
        tenantId,
        userPrompt,
        entities,
        appName,
        appType,
        projectName,
      });

      res.status(200).json({
        appId: result.spec.id,
        deploymentId: result.deployment?.deploymentId,
        deployUrl: result.deployment?.deployUrl,
        status: result.deployment?.status,
        entities: result.entities,
      });
    } catch (err) {
      next(err);
    }
  });

  // ── Incremental update ───────────────────────────────────────────────────────
  // POST /api/templates/update
  // Body: { existingSpec, existingManifestJson, refinementPrompt }
  app.post('/api/templates/update', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { existingSpec, existingManifestJson, refinementPrompt } = req.body;
      if (!existingSpec || !existingManifestJson || !refinementPrompt) {
        return res.status(400).json({ error: 'existingSpec, existingManifestJson, refinementPrompt required' });
      }

      const { result, diff } = await runIncrementalUpdate(existingSpec, existingManifestJson, refinementPrompt);

      res.status(200).json({
        appId: result.spec.id,
        manifestJson: result.manifestJson,
        entities: result.entities,
        diff: {
          addedEntities: diff.addedEntities,
          removedEntities: diff.removedEntities,
          modifiedEntities: diff.modifiedEntities,
          addedRoutes: diff.addedRoutes,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // ── Team 3 Integration: AppUnderstanding → generate ──────────────────────────
  // POST /api/templates/from-understanding
  // Body: { tenantId, understanding: AppUnderstanding }
  app.post('/api/templates/from-understanding', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, understanding }: { tenantId: string; understanding: AppUnderstanding } = req.body;
      if (!tenantId || !understanding) {
        return res.status(400).json({ error: 'tenantId and understanding are required' });
      }

      const adapted = adaptAppUnderstanding(tenantId, understanding);
      const spec = buildSpecFromEntities(adapted.tenantId, adapted.appName, adapted.appType, adapted.entities);

      const result = await runGenerationPipeline({
        tenantId,
        entities: spec.entities,
        appName: spec.name,
        appType: spec.appType,
      });

      res.status(200).json({
        appId: result.spec.id,
        entities: result.entities,
        routes: result.routes,
        fileCount: result.fileCount,
        manifestJson: result.manifestJson,
        spec: result.spec,
        adapted: { appType: adapted.appType, entityCount: adapted.entities.length },
      });
    } catch (err) {
      next(err);
    }
  });

  // ── Preview management ───────────────────────────────────────────────────────
  app.get('/api/previews/:previewId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const preview = await previewEngine.getPreview(req.params['previewId']!);
      if (!preview) return res.status(404).json({ error: 'Preview not found' });
      res.json({ preview });
    } catch (err) { next(err); }
  });

  app.delete('/api/previews/:previewId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await previewEngine.destroyPreview(req.params['previewId']!);
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // ── Deployment status ─────────────────────────────────────────────────────────
  app.get('/api/deployments/:deploymentId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await deploymentEngine.getDeployment(req.params['deploymentId']!);
      if (!status) return res.status(404).json({ error: 'Deployment not found' });
      res.json({ deployment: status });
    } catch (err) { next(err); }
  });

  // ── Workflow runs ─────────────────────────────────────────────────────────────
  app.get('/api/workflows/runs/:runId', (req: Request, res: Response) => {
    const run = workflowExecutor.getRun(req.params['runId']!);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json({ run });
  });

  // ── Error handler (Sentry-aware) ──────────────────────────────────────────
  app.use(errorHandler());

  return app;
}

// ─── Standalone entrypoint ────────────────────────────────────────────────────
if (process.env['NODE_ENV'] !== 'test') {
  // Init error tracking if DSN is configured
  const sentryDsn = process.env['SENTRY_DSN'];
  if (sentryDsn) {
    initErrorTracking({
      dsn: sentryDsn,
      environment: process.env['NODE_ENV'] ?? 'development',
      release: process.env['npm_package_version'],
    });
  }

  registerDefaultHealthChecks();

  const PORT = parseInt(process.env['PORT'] ?? '4001', 10);
  const app = createApiServer();
  app.listen(PORT, () => {
    console.log(`[Template API] Listening on http://localhost:${PORT}`);
    console.log('[Template API] Endpoints:');
    console.log('  POST /api/templates/generate');
    console.log('  POST /api/templates/preview');
    console.log('  POST /api/templates/deploy');
    console.log('  POST /api/templates/update');
    console.log('  POST /api/templates/from-understanding  ← Team 3 integration');
    console.log('  GET  /health');
  });
}
