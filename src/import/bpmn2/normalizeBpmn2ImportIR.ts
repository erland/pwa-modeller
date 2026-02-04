import type { ImportReport } from '../importReport';
import { addWarning } from '../importReport';
import type { IRModel, IRTaggedValue, IRView, IRViewConnection, IRViewNode } from '../framework/ir';
import { resolveViewConnectionRelationshipIds } from '../normalize/resolveViewConnectionRelationshipIds';

export type NormalizeBpmn2ImportIROptions = {
  /** Optional report to append normalization warnings to. */
  report?: ImportReport;
  /** Optional source label used in warning strings. */
  source?: string;

  /** Max number of extension-derived tagged values to extract per item. Default: 50 */
  maxExtensionTags?: number;
};

function warn(opts: NormalizeBpmn2ImportIROptions | undefined, message: string): void {
  if (!opts?.report) return;
  addWarning(opts.report, message);
}

function srcPrefix(opts?: NormalizeBpmn2ImportIROptions): string {
  return opts?.source ? `${opts.source}: ` : '';
}

function normalizeDocText(text: string | undefined): string | undefined {
  if (!text) return undefined;
  // Normalize CRLF/CR to LF and trim.
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  return normalized || undefined;
}

function asString(v: unknown): string {
  return (typeof v === 'string' ? v : v == null ? '' : String(v)).trim();
}

function stableSortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

function mergeTaggedValues(base: IRTaggedValue[] | undefined, extra: IRTaggedValue[] | undefined): IRTaggedValue[] | undefined {
  if ((!base || base.length === 0) && (!extra || extra.length === 0)) return undefined;
  const out: IRTaggedValue[] = [];
  const seen = new Set<string>();
  const push = (tv: IRTaggedValue) => {
    const key = asString(tv.key);
    if (!key) return;
    const value = asString(tv.value);
    const sig = `${key}=${value}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    out.push({ key, value });
  };
  for (const tv of base ?? []) push(tv);
  for (const tv of extra ?? []) push(tv);
  return out.length ? out : undefined;
}

function extractExtensionTags(meta: unknown, opts?: NormalizeBpmn2ImportIROptions): IRTaggedValue[] | undefined {
  // The parser stores a lightweight extension summary in meta.extensionElements when present.
  // Keep this intentionally conservative: a handful of small key/value strings.
  const m = meta as Record<string, unknown> | undefined;
  const ext = m?.extensionElements as unknown;
  if (!ext || typeof ext !== 'object') return undefined;

  const max = opts?.maxExtensionTags ?? 50;
  const out: IRTaggedValue[] = [];

  // We support either: { tags: Record<string,string> } or plain record of string values.
  const tagsRecord =
    (ext as Record<string, unknown>)['tags'] && typeof (ext as Record<string, unknown>)['tags'] === 'object'
      ? ((ext as Record<string, unknown>)['tags'] as Record<string, unknown>)
      : (ext as Record<string, unknown>);

  for (const [k, v] of Object.entries(tagsRecord)) {
    if (out.length >= max) break;
    const key = asString(k);
    const value = asString(v);
    if (!key || !value) continue;
    if (key.length > 80) continue;
    if (value.length > 500) continue;
    out.push({ key: `ext:${key}`, value });
  }

  return out.length ? out : undefined;
}

function normalizeView(view: IRView, elementIds: Set<string>, relIds: Set<string>, opts?: NormalizeBpmn2ImportIROptions): IRView {
  // Remove nodes/edges that reference missing model ids. Generic normalization will also clean,
  // but we prefer to drop these early (typical in EA exports when diagrams contain orphaned refs).

  const nodes: IRViewNode[] = [];
  for (const n of view.nodes ?? []) {
    const elementId = n.elementId;
    if (elementId && !elementIds.has(elementId)) {
      warn(opts, `${srcPrefix(opts)}BPMN2 normalize: Dropped view node "${n.id}" referencing missing elementId "${elementId}".`);
      continue;
    }
    nodes.push({
      ...n,
      // Keep doc-like strings clean if present.
      label: n.label ? asString(n.label) : undefined,
      taggedValues: mergeTaggedValues(n.taggedValues, extractExtensionTags(n.meta, opts)),
      meta: n.meta
    });
  }

  const connections: IRViewConnection[] = [];
  for (const c of view.connections ?? []) {
    const rid = c.relationshipId;
    if (rid && !relIds.has(rid)) {
      warn(opts, `${srcPrefix(opts)}BPMN2 normalize: Dropped view connection "${c.id}" referencing missing relationshipId "${rid}".`);
      continue;
    }
    const se = c.sourceElementId;
    const te = c.targetElementId;
    if (se && !elementIds.has(se)) {
      warn(opts, `${srcPrefix(opts)}BPMN2 normalize: Dropped view connection "${c.id}" referencing missing sourceElementId "${se}".`);
      continue;
    }
    if (te && !elementIds.has(te)) {
      warn(opts, `${srcPrefix(opts)}BPMN2 normalize: Dropped view connection "${c.id}" referencing missing targetElementId "${te}".`);
      continue;
    }
    connections.push({
      ...c,
      label: c.label ? asString(c.label) : undefined,
      taggedValues: mergeTaggedValues(c.taggedValues, extractExtensionTags(c.meta, opts)),
      meta: c.meta
    });
  }

  return {
    ...view,
    name: asString(view.name) || 'Imported BPMN diagram',
    documentation: normalizeDocText(view.documentation),
    nodes: stableSortById(nodes),
    connections: stableSortById(connections),
    taggedValues: mergeTaggedValues(view.taggedValues, extractExtensionTags(view.meta, opts)),
    meta: view.meta
  };
}

/**
 * BPMN2-specific normalization intended for EA exports.
 * Run this before the generic normalizeImportIR step.
 */
export function normalizeBpmn2ImportIR(ir: IRModel, opts?: NormalizeBpmn2ImportIROptions): IRModel {
  const folders = stableSortById(ir.folders ?? []).map((f) => ({
    ...f,
    name: asString(f.name) || 'Imported folder',
    documentation: normalizeDocText(f.documentation),
    taggedValues: mergeTaggedValues(f.taggedValues, extractExtensionTags(f.meta, opts)),
    meta: f.meta
  }));

  const elements = stableSortById(ir.elements ?? []).map((e) => ({
    ...e,
    name: asString(e.name) || `Unnamed (${e.type})`,
    documentation: normalizeDocText(e.documentation),
    taggedValues: mergeTaggedValues(e.taggedValues, extractExtensionTags(e.meta, opts)),
    meta: e.meta
  }));

  const elementIds = new Set(elements.map((e) => e.id));

  const relationships = stableSortById(ir.relationships ?? []).map((r) => ({
    ...r,
    name: r.name ? asString(r.name) : undefined,
    documentation: normalizeDocText(r.documentation),
    // Keep these stable strings.
    sourceId: asString(r.sourceId),
    targetId: asString(r.targetId),
    taggedValues: mergeTaggedValues(r.taggedValues, extractExtensionTags(r.meta, opts)),
    meta: r.meta
  }));

  // Drop obviously dangling relationships (common with partial exports).
  const cleanedRelationships = relationships.filter((r) => {
    const ok = elementIds.has(r.sourceId) && elementIds.has(r.targetId);
    if (!ok) {
      warn(
        opts,
        `${srcPrefix(opts)}BPMN2 normalize: Dropped relationship "${r.id}" referencing missing element(s) (source: "${r.sourceId}", target: "${r.targetId}").`
      );
    }
    return ok;
  });

  const relIds = new Set(cleanedRelationships.map((r) => r.id));

  const views = (ir.views ?? []).map((v) => normalizeView(v, elementIds, relIds, opts));

  const base: IRModel = {
    ...ir,
    folders,
    elements,
    relationships: cleanedRelationships,
    views: stableSortById(views)
  };

  // Some BPMN exporters omit explicit relationship references on diagram edges.
  // Best-effort resolve them here so later steps can build per-diagram relationship visibility.
  return resolveViewConnectionRelationshipIds(base, {
    report: opts?.report,
    label: 'BPMN2'
  });
}
