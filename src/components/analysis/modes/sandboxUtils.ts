import type { Model, Element, TaggedValue, RelationshipType } from '../../../domain';
import type { SandboxNode } from '../workspace/controller/sandboxTypes';
import type { SandboxRenderableRelationship } from './SandboxEdgesLayer';

import { discoverNumericPropertyKeys } from '../../../domain';

/**
 * Pure (UI-free) helpers extracted from SandboxModeView.
 *
 * Keep these helpers side-effect free and easy to unit test.
 */

/**
 * Map sandbox node elementId -> position.
 *
 * This is the shape expected by SandboxCanvas / SandboxEdgesLayer.
 */
export function buildNodeById(nodes: SandboxNode[]): Map<string, { x: number; y: number }> {
  const m = new Map<string, { x: number; y: number }>();
  for (const n of nodes) m.set(n.elementId, { x: n.x, y: n.y });
  return m;
}

/**
 * Map sandbox node elementId -> full SandboxNode (used by controllers).
 */
export function buildSandboxNodeById(nodes: SandboxNode[]): Map<string, SandboxNode> {
  const m = new Map<string, SandboxNode>();
  for (const n of nodes) m.set(n.elementId, n);
  return m;
}


/**
 * Sub-model containing only the sandbox elements.
 * Relationships are intentionally left empty and should be seeded later.
 */
export function buildSandboxSubModel(model: Model, nodes: SandboxNode[]): Model {
  const elementIds = nodes.map((n) => n.elementId);
  const elements: typeof model.elements = {};
  for (const id of elementIds) {
    const el = model.elements[id];
    if (el) elements[id] = el;
  }

  // NOTE: relationships are seeded later based on visible/rendered relationships.
  const relationshipsById: typeof model.relationships = {};
  return { ...model, elements, relationships: relationshipsById };
}

export function buildSandboxRelationshipsModel(
  model: Model,
  sandboxSubModel: Model,
  renderedRelationships: SandboxRenderableRelationship[]
): Model {
  const rels: typeof model.relationships = {};
  for (const r of renderedRelationships) {
    const rr = model.relationships[r.id];
    if (rr) rels[r.id] = rr;
  }
  return { ...sandboxSubModel, relationships: rels };
}

export function getAllRelationshipTypes(model: Model): RelationshipType[] {
  const set = new Set<RelationshipType>();
  for (const r of Object.values(model.relationships)) {
    if (!r.type) continue;
    set.add(r.type as RelationshipType);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function getRelationshipTypesFromRendered(renderedRelationships: SandboxRenderableRelationship[]): RelationshipType[] {
  const set = new Set<RelationshipType>();
  for (const r of renderedRelationships) set.add(r.type as RelationshipType);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function getAvailablePropertyKeys(
  sandboxRelationshipsModel: Model,
  opts: {
    /** Return effective tagged values (e.g. overlay-resolved). */
    getTaggedValues: (el: Element) => TaggedValue[] | undefined;
  }
): string[] {
  return discoverNumericPropertyKeys(sandboxRelationshipsModel, {
    getTaggedValues: (el) => opts.getTaggedValues(el),
  });
}

export function formatOverlayBadgesFromScores(
  nodeOverlayScores: Record<string, unknown> | null | undefined
): Record<string, string> | null {
  if (!nodeOverlayScores) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(nodeOverlayScores)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[k] = Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  return out;
}

export function computeOverlayScalesFromScores(
  nodeOverlayScores: Record<string, unknown> | null | undefined,
  opts?: { minScale?: number; maxScale?: number }
): Record<string, number> | null {
  if (!nodeOverlayScores) return null;
  const minScale = opts?.minScale ?? 0.85;
  const maxScale = opts?.maxScale ?? 1.25;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of Object.values(nodeOverlayScores)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }

  const out: Record<string, number> = {};

  // If all values are equal (or no finite values), scale everything to 1.
  if (!(max > min)) {
    for (const id of Object.keys(nodeOverlayScores)) out[id] = 1;
    return out;
  }

  for (const [id, v] of Object.entries(nodeOverlayScores)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      out[id] = 1;
      continue;
    }
    const t = (v - min) / (max - min);
    const clamped = Math.max(0, Math.min(1, t));
    out[id] = minScale + clamped * (maxScale - minScale);
  }
  return out;
}
