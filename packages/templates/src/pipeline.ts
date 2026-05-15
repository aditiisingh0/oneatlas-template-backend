// packages/templates/src/pipeline.ts
// ─── Main Pipeline — orchestrates Spec → Load → Compose → Preview → Deploy ───

import { generateAppSpec, buildSpecFromEntities, refineAppSpec, diffSpecs } from './spec-engine/index.js';
import { loadTemplate, generateAppShellFiles } from './loader/index.js';
import { composeBundle, serializeManifest, deserializeManifest } from './composer/composer.js';
import { previewEngine } from './preview/index.js';
import { deploymentEngine } from './deployment/index.js';
import type { AppSpec, EntityDef } from './types/app-spec.js';
import type { RenderManifest } from './types/render-manifest.js';
import type { PreviewResponse } from './preview/index.js';
import type { DeployResult } from './deployment/index.js';

export interface GenerateOptions {
  userPrompt?: string;
  entities?: EntityDef[];
  tenantId: string;
  appName?: string;
  appType?: AppSpec['appType'];
  existingSpec?: AppSpec;
  existingManifestJson?: string;
}

export interface PipelineResult {
  spec: AppSpec;
  manifest: RenderManifest;
  manifestJson: string;
  fileCount: number;
  entities: string[];
  routes: string[];
  preview?: PreviewResponse;
}

// ─── Full generation pipeline ──────────────────────────────────────────────────
export async function runGenerationPipeline(
  opts: GenerateOptions
): Promise<PipelineResult> {
  // 1. Generate or reuse AppSpec
  let spec: AppSpec;
  if (opts.existingSpec && opts.userPrompt) {
    spec = await refineAppSpec(opts.existingSpec, opts.userPrompt);
  } else if (opts.userPrompt) {
    spec = await generateAppSpec(opts.userPrompt, opts.tenantId);
  } else if (opts.entities && opts.appName && opts.appType) {
    spec = buildSpecFromEntities(opts.tenantId, opts.appName, opts.appType, opts.entities);
  } else {
    throw new Error('Must provide userPrompt or (entities + appName + appType)');
  }

  // 2. Load template and hydrate slots
  const existingManifest = opts.existingManifestJson
    ? deserializeManifest(opts.existingManifestJson)
    : undefined;
  const manifest = await loadTemplate(spec, existingManifest);

  // 3. Compose deployable bundle
  const bundle = composeBundle(spec, manifest);

  // 4. Inject hydration manifest + component registry + dynamic page shells
  const shellFiles = generateAppShellFiles(spec, manifest.templateId);
  bundle.files.push(...shellFiles.map((f) => ({ path: f.relativePath, content: f.content })));

  // 5. Mark manifest as bundle-ready
  const finalManifest: RenderManifest = { ...manifest, bundleReady: true };

  return {
    spec,
    manifest: finalManifest,
    manifestJson: serializeManifest(finalManifest),
    fileCount: bundle.files.length,
    entities: spec.entities.map((e) => e.name),
    routes: spec.routes.map((r) => `${r.method} ${r.path}`),
  };
}

// ─── Preview pipeline ──────────────────────────────────────────────────────────
export async function runPreviewPipeline(
  opts: GenerateOptions & { ttlSeconds?: number }
): Promise<PipelineResult> {
  const result = await runGenerationPipeline(opts);
  const bundle = composeBundle(result.spec, result.manifest);

  // Shell files already in bundle from runGenerationPipeline — no need to re-add
  const previewReq = {
    appId: result.spec.id,
    tenantId: result.spec.tenantId,
    bundle,
    ...(opts.ttlSeconds !== undefined ? { ttlSeconds: opts.ttlSeconds } : {}),
  };
  const preview = await previewEngine.createPreview(previewReq);

  return { ...result, preview };
}

// ─── Deploy pipeline ───────────────────────────────────────────────────────────
export async function runDeployPipeline(
  opts: GenerateOptions & {
    slug: string;
    cfAccountId: string;
    cfApiToken: string;
  }
): Promise<{ pipelineResult: PipelineResult; deployment: DeployResult }> {
  const pipelineResult = await runGenerationPipeline(opts);
  const bundle = composeBundle(pipelineResult.spec, pipelineResult.manifest);

  const deployment = await deploymentEngine.deploy({
    appId: pipelineResult.spec.id,
    tenantId: pipelineResult.spec.tenantId,
    slug: opts.slug,
    bundle,
    cfAccountId: opts.cfAccountId,
    cfApiToken: opts.cfApiToken,
  });

  return { pipelineResult, deployment };
}

// ─── Incremental update pipeline ──────────────────────────────────────────────
export async function runIncrementalUpdate(
  existingSpec: AppSpec,
  existingManifestJson: string,
  refinementPrompt: string
): Promise<{ result: PipelineResult; diff: ReturnType<typeof diffSpecs> }> {
  const newSpec = await refineAppSpec(existingSpec, refinementPrompt);
  const diff = diffSpecs(existingSpec, newSpec);

  const result = await runGenerationPipeline({
    tenantId: existingSpec.tenantId,
    existingSpec: newSpec,
    existingManifestJson,
  });

  return { result, diff };
}