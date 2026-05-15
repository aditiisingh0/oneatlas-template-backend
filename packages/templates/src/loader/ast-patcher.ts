// packages/templates/src/loader/ast-patcher.ts
// ─── AST Patcher — injects generated code into slot markers; never full regen ───

import { createHash } from 'crypto';
import type { GeneratedFile } from '../types/render-manifest.js';

// Slot marker format: {{SLOT_ID}} or {{SLOT_ID:START}} ... {{SLOT_ID:END}}
const SLOT_SINGLE_RE = /\{\{([A-Z_]+)\}\}/g;
const SLOT_BLOCK_START_RE = /\{\{([A-Z_]+):START\}\}/g;
const SLOT_BLOCK_END = (id: string) => `{{${id}:END}}`;

// ─── Core patch function ───────────────────────────────────────────────────────
export function patchSlots(
  templateSource: string,
  slotValues: Record<string, string>
): string {
  // 1. Replace block slots ({{SLOT:START}} ... {{SLOT:END}})
  let result = replaceBlockSlots(templateSource, slotValues);
  // 2. Replace inline slots ({{SLOT}})
  result = result.replace(SLOT_SINGLE_RE, (_match, slotId: string) => {
    return slotValues[slotId] ?? _match; // leave unresolved slots as-is
  });
  return result;
}

function replaceBlockSlots(source: string, values: Record<string, string>): string {
  let result = source;
  let match: RegExpExecArray | null;
  const re = new RegExp(SLOT_BLOCK_START_RE.source, 'g');

  while ((match = re.exec(source)) !== null) {
    const slotId = match[1]!;
    const startMarker = `{{${slotId}:START}}`;
    const endMarker = SLOT_BLOCK_END(slotId);

    const startIdx = result.indexOf(startMarker);
    const endIdx = result.indexOf(endMarker);
    if (startIdx === -1 || endIdx === -1) continue;

    const newContent = values[slotId] ?? '';
    result =
      result.slice(0, startIdx) +
      newContent +
      result.slice(endIdx + endMarker.length);
  }

  return result;
}

// ─── Smart patch: only update modified slots, preserve user edits ─────────────
export function smartPatch(
  existingFile: GeneratedFile,
  newSlotValues: Record<string, string>,
  templateSource: string
): GeneratedFile {
  // If user has modified this file, don't touch it
  if (existingFile.lockedFromRegen) {
    return existingFile;
  }

  // Determine which slots have changed
  const changedSlots = Object.entries(newSlotValues).filter(
    ([key, val]) => existingFile.slotValues?.[key] !== val
  );

  if (changedSlots.length === 0) {
    return existingFile; // Nothing changed
  }

  // Re-patch the template with new slot values
  const mergedSlots = { ...existingFile.slotValues, ...newSlotValues };
  const newContent = patchSlots(templateSource, mergedSlots);
  const newHash = sha256(newContent);

  return {
    ...existingFile,
    content: newContent,
    slotValues: mergedSlots,
    hash: newHash,
    generatedAt: new Date().toISOString(),
    origin: 'template',
  };
}

// ─── Detect user modifications ────────────────────────────────────────────────
export function detectUserModification(
  file: GeneratedFile,
  currentContentOnDisk: string
): boolean {
  const currentHash = sha256(currentContentOnDisk);
  return currentHash !== file.hash;
}

// ─── File path resolver: replaces {{TABLE_NAME}} in paths ────────────────────
export function resolveFilePath(
  templatePath: string,
  slotValues: Record<string, string>
): string {
  return templatePath.replace(/\{\{([A-Z_]+)\}\}/g, (_match, slotId: string) => {
    return slotValues[slotId] ?? _match;
  });
}

// ─── Diff two file sets to find what needs patching ──────────────────────────
export function diffFileSets(
  existing: GeneratedFile[],
  incoming: Omit<GeneratedFile, 'hash' | 'generatedAt'>[]
): {
  toAdd: typeof incoming;
  toUpdate: typeof incoming;
  toDelete: GeneratedFile[];
  unchanged: GeneratedFile[];
} {
  const existingByPath = new Map(existing.map((f) => [f.relativePath, f]));
  const incomingByPath = new Map(incoming.map((f) => [f.relativePath, f]));

  const toAdd = incoming.filter((f) => !existingByPath.has(f.relativePath));
  const toDelete = existing.filter((f) => !incomingByPath.has(f.relativePath) && !f.lockedFromRegen);
  const toUpdate = incoming.filter((f) => {
    const ex = existingByPath.get(f.relativePath);
    if (!ex) return false;
    if (ex.lockedFromRegen) return false;
    return ex.content !== f.content;
  });
  const unchanged = existing.filter((f) => {
    const inc = incomingByPath.get(f.relativePath);
    return inc && f.content === inc.content;
  });

  return { toAdd, toUpdate, toDelete, unchanged };
}

// ─── Utility ──────────────────────────────────────────────────────────────────
export function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function generateFileFromTemplate(
  templateSource: string,
  slotValues: Record<string, string>,
  relativePath: string,
  templateId: string
): GeneratedFile {
  const resolvedPath = resolveFilePath(relativePath, slotValues);
  const content = patchSlots(templateSource, slotValues);
  return {
    relativePath: resolvedPath,
    content,
    origin: 'template',
    templateId,
    slotValues,
    hash: sha256(content),
    generatedAt: new Date().toISOString(),
    lockedFromRegen: false,
  };
}
