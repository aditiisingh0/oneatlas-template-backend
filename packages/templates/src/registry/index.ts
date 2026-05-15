// packages/templates/src/registry/index.ts
// ─── Template Registry — versioned catalog of all base templates ───

import type { TemplateManifest } from '../types/template-manifest.js';
import type { AppType } from '../types/app-spec.js';
import { crudTemplate } from './templates/crud/manifest.js';
import { dashboardTemplate } from './templates/dashboard/manifest.js';
import { workflowTemplate } from './templates/workflow/manifest.js';
import { adminPanelTemplate } from './templates/admin-panel/manifest.js';

// ─── Master registry ──────────────────────────────────────────────────────────
const REGISTRY: Map<string, TemplateManifest> = new Map([
  [crudTemplate.id, crudTemplate],
  [dashboardTemplate.id, dashboardTemplate],
  [workflowTemplate.id, workflowTemplate],
  [adminPanelTemplate.id, adminPanelTemplate],
]);

// ─── Registry API ─────────────────────────────────────────────────────────────
export function getTemplate(id: string): TemplateManifest {
  const t = REGISTRY.get(id);
  if (!t) throw new Error(`Template not found: ${id}`);
  return t;
}

export function listTemplates(filter?: { appType?: AppType; tags?: string[] }): TemplateManifest[] {
  let templates = [...REGISTRY.values()];
  if (filter?.appType) {
    templates = templates.filter((t) => t.appType === filter.appType);
  }
  if (filter?.tags?.length) {
    templates = templates.filter((t) => filter.tags!.some((tag) => t.tags.includes(tag)));
  }
  return templates;
}

export function resolveTemplate(appType: AppType, entityCount: number): TemplateManifest {
  const candidates = listTemplates({ appType }).filter(
    (t) => entityCount >= t.requiredEntityCount.min && entityCount <= t.requiredEntityCount.max
  );
  if (!candidates.length) {
    throw new Error(`No template found for appType="${appType}" with ${entityCount} entities`);
  }
  // Return the most specific match (highest min requirement)
  return candidates.sort((a, b) => b.requiredEntityCount.min - a.requiredEntityCount.min)[0]!;
}

export function registerTemplate(manifest: TemplateManifest): void {
  REGISTRY.set(manifest.id, manifest);
}

export { REGISTRY };
