// packages/templates/src/index.ts
// ─── @oneatlas/templates — main export barrel ───

// Types
export * from './types/index.js';

// Spec Engine
export {
  generateAppSpec,
  refineAppSpec,
  buildSpecFromEntities,
  diffSpecs,
} from './spec-engine/index.js';

// Registry
export {
  getTemplate,
  listTemplates,
  resolveTemplate,
  registerTemplate,
  REGISTRY,
} from './registry/index.js';

// Loader
export { loadTemplate, generateAppShellFiles } from './loader/index.js';
export { computeSlotValues, generateFullPrismaSchema, generateZodSchema, generateTypeScriptInterface } from './loader/code-generator.js';
export { patchSlots, smartPatch, generateFileFromTemplate, diffFileSets, sha256 } from './loader/ast-patcher.js';
export { generateHydrationManifest, generateHydrationModule, serializeHydrationManifest } from './loader/hydration.js';
export type { HydrationManifest, HydrationEntity, HydrationField } from './loader/hydration.js';
export { generateComponentRegistryModule, generateDynamicListPageShell, generateDynamicDetailPageShell, generateDynamicFormPageShell } from './loader/component-registry.js';
export type { ComponentRegistryEntry } from './loader/component-registry.js';

// Composer
export { composeBundle, serializeManifest, deserializeManifest } from './composer/composer.js';
export type { BundleResult } from './composer/composer.js';

// Preview
export { PreviewEngine, previewEngine } from './preview/index.js';
export type { PreviewRequest, PreviewResponse, PreviewSession, PreviewStore } from './preview/index.js';
export { RedisPreviewStore } from './preview/redis-store.js';
export { renderPreviewPage } from './preview/html-renderer.js';
export type { RenderedPage } from './preview/html-renderer.js';

// Deployment
export { DeploymentEngine, deploymentEngine } from './deployment/index.js';
export type { DeployRequest, DeployResult, DeploymentRecord, DeploymentStatus } from './deployment/index.js';

// Workflows
export { WorkflowExecutor, workflowExecutor, evaluateCondition, matchesTrigger, setPrismaResolver } from './workflows/executor.js';
export type { WorkflowRun, StepResult } from './workflows/executor.js';

// Pipeline (main entrypoints)
export {
  runGenerationPipeline,
  runPreviewPipeline,
  runDeployPipeline,
  runIncrementalUpdate,
} from './pipeline.js';
export type { GenerateOptions, PipelineResult } from './pipeline.js';

// HTTP API Server (Team 2 integration)
export { createApiServer } from './api/server.js';
export type { AppUnderstanding } from './api/server.js';
