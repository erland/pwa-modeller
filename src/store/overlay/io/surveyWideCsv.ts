import type { Model, TaggedValue } from '../../../domain';
import { dedupeExternalIds, externalKey } from '../../../domain/externalIds';
import type { Element, Relationship, ExternalIdRef } from '../../../domain/types';
import { normalizeKey } from '../../../domain/taggedValues';
import {
  buildOverlayModelExternalIdIndex,
  computeModelSignature,
  resolveTargetsByExternalKey,
  toOverlayExternalRef,
  type OverlayExternalRef,
  type OverlayTagValue
} from '../../../domain/overlay';

import type { OverlayStore } from '../OverlayStore';
import { resolveOverlayAgainstModel } from '../resolve';
import type { ResolveReport } from '../resolve';
import { getEffectiveTagsForElement, getEffectiveTagsForRelationship } from '../effectiveTags';

import { parseCsv, toCsvLine } from './csv';
export { parseCsv } from './csv';

export type SurveyTargetSet = 'elements' | 'relationships' | 'both';

export type SurveyExportOptions = {
  targetSet: SurveyTargetSet;
  /** If set, include only elements whose type is in this list. Empty/undefined means include all. */
  elementTypes?: string[];
  /** If set, include only relationships whose type is in this list. Empty/undefined means include all. */
  relationshipTypes?: string[];
  /** Tag keys (columns) to include (normalized, no namespaces). */
  tagKeys: string[];
  /** If true, prefill export values from effective tags (overlay if present else core). */
  prefillFromEffectiveTags?: boolean;
};

export type SurveyImportOptions = {
  /**
   * How to treat blank cells in tag columns.
   * - ignore: do not change overlay for that key
   * - clear: remove the overlay key if present
   */
  blankMode: 'ignore' | 'clear';
};

export type SurveyImportResult = {
  warnings: string[];
  resolveReport: ResolveReport;
  stats: { rowsProcessed: number; rowsSkipped: number; entriesTouched: number };
};

const FIXED_COLS = ['kind', 'target_id', 'ref_scheme', 'ref_scope', 'ref_value', 'name', 'type'] as const;


function normalizeTagKeys(keys: string[]): string[] {
  const set = new Set<string>();
  for (const k0 of keys ?? []) {
    const k = normalizeKey(k0);
    if (!k) continue;
    set.add(k);
  }
  return [...set].sort();
}

function findTaggedValue(taggedValues: TaggedValue[] | undefined, key: string): TaggedValue | undefined {
  const want = normalizeKey(key);
  if (!want) return undefined;
  for (const tv of taggedValues ?? []) {
    const k = normalizeKey(tv.key);
    if (!k) continue;
    if (k === want) return tv;
  }
  return undefined;
}

function stringifyTaggedValue(tv: TaggedValue | undefined): string {
  if (!tv) return '';
  const raw = (tv.value ?? '').toString();
  return raw;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function isExternalIdRef(v: unknown): v is ExternalIdRef {
  const r = asRecord(v);
  return typeof r?.system === 'string' && typeof r?.id === 'string' && (r.scope === undefined || typeof r.scope === 'string');
}

function pickPrimaryExternalRef(
  externalIds: unknown
): { scheme: string; scope: string; value: string; ref?: OverlayExternalRef } {
  const raw = Array.isArray(externalIds) ? (externalIds as unknown[]) : [];
  const list = dedupeExternalIds(raw.filter(isExternalIdRef));
  const first = list[0];
  if (!first) return { scheme: '', scope: '', value: '' };
  const scheme = (first.system ?? '').toString().trim();
  const scope = (first.scope ?? '').toString().trim();
  const value = (first.id ?? '').toString().trim();
  return { scheme, scope, value, ref: toOverlayExternalRef(first) };
}

function modelTargets(
  model: Model,
  options: Pick<SurveyExportOptions, 'targetSet' | 'elementTypes' | 'relationshipTypes'>
): Array<{ kind: 'element' | 'relationship'; obj: Element | Relationship }> {
  const out: Array<{ kind: 'element' | 'relationship'; obj: Element | Relationship }> = [];
  const targetSet = options.targetSet;

  const elTypes = (options.elementTypes ?? []).filter((t) => !!t);
  const relTypes = (options.relationshipTypes ?? []).filter((t) => !!t);

  if (targetSet === 'elements' || targetSet === 'both') {
    for (const el of Object.values(model.elements ?? {})) {
      const t = (asRecord(el)?.type as unknown) ?? '';
      if (elTypes.length > 0 && !elTypes.includes(String(t))) continue;
      out.push({ kind: 'element', obj: el });
    }
  }
  if (targetSet === 'relationships' || targetSet === 'both') {
    for (const rel of Object.values(model.relationships ?? {})) {
      const t = (asRecord(rel)?.type as unknown) ?? '';
      if (relTypes.length > 0 && !relTypes.includes(String(t))) continue;
      out.push({ kind: 'relationship', obj: rel });
    }
  }
  return out;
}

export function serializeOverlaySurveyCsv(args: {
  model: Model;
  overlayStore: OverlayStore;
  options: SurveyExportOptions;
}): string {
  const { model, overlayStore, options } = args;
  const tagKeys = normalizeTagKeys(options.tagKeys);
  const prefill = options.prefillFromEffectiveTags !== false;

  const header = [...FIXED_COLS, ...tagKeys];
  const lines: string[] = [];
  lines.push(toCsvLine(header as unknown as string[]));

  // metadata row: helps detect accidental imports into another model
  const sig = computeModelSignature(model);
  lines.push(toCsvLine(['#model_signature', sig, '', '', '', '', '', ...tagKeys.map(() => '')]));

  const targets = modelTargets(model, options);
  for (const t of targets) {
    const kind = t.kind;
    const rec = asRecord(t.obj) ?? {};
    const id = rec.id ?? '';
    const name = rec.name ?? '';
    const type = rec.type ?? '';
    const ext = pickPrimaryExternalRef(rec.externalIds);

    let tagged: TaggedValue[] | undefined;
    if (prefill) {
      if (kind === 'element') tagged = getEffectiveTagsForElement(model, t.obj as Element, overlayStore).effectiveTaggedValues;
      else tagged = getEffectiveTagsForRelationship(model, t.obj as Relationship, overlayStore).effectiveTaggedValues;
    }

    const row: string[] = [];
    row.push(kind);
    row.push(String(id ?? ''));
    row.push(ext.scheme);
    row.push(ext.scope);
    row.push(ext.value);
    row.push(String(name ?? ''));
    row.push(String(type ?? ''));

    for (const k of tagKeys) {
      row.push(stringifyTaggedValue(findTaggedValue(tagged, k)));
    }
    lines.push(toCsvLine(row));
  }

  return lines.join('\n') + '\n';
}

function findExistingOverlayEntriesForTarget(overlayStore: OverlayStore, kind: 'element' | 'relationship', keys: string[]): string[] {
  const ids = new Set<string>();
  for (const k of keys) {
    for (const id of overlayStore.findEntryIdsByExternalKey(k)) ids.add(id);
  }
  return [...ids].filter((id) => overlayStore.getEntry(id)?.target.kind === kind).sort();
}

function buildOverlayRefsForModelObject(obj: unknown): OverlayExternalRef[] {
  const raw = Array.isArray(asRecord(obj)?.externalIds) ? (asRecord(obj)?.externalIds as unknown[]) : [];
  const list = dedupeExternalIds(raw.filter(isExternalIdRef));
  return list.map((r) => toOverlayExternalRef(r));
}

function rowToMap(header: string[], row: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < header.length; i++) out[header[i]] = row[i] ?? '';
  return out;
}

function parseTagKeysFromHeader(header: string[]): string[] {
  const fixed = new Set<string>(FIXED_COLS as unknown as string[]);
  const tags: string[] = [];
  for (const h of header) {
    if (fixed.has(h)) continue;
    const k = normalizeKey(h);
    if (k) tags.push(k);
  }
  return normalizeTagKeys(tags);
}

function inferExternalKeyFromRow(m: Record<string, string>): string {
  const scheme = (m.ref_scheme ?? '').toString().trim();
  const scope = (m.ref_scope ?? '').toString().trim();
  const value = (m.ref_value ?? '').toString().trim();
  if (!scheme || !value) return '';
  return externalKey({ system: scheme, scope: scope || undefined, id: value });
}

export function importOverlaySurveyCsvToStore(args: {
  model: Model;
  overlayStore: OverlayStore;
  csvText: string;
  options: SurveyImportOptions;
}): SurveyImportResult {
  const { model, overlayStore, csvText, options } = args;
  const warnings: string[] = [];
  const rows = parseCsv(csvText);
  if (!rows.length) {
    return {
      warnings: ['empty csv'],
      resolveReport: resolveOverlayAgainstModel(overlayStore.listEntries(), buildOverlayModelExternalIdIndex(model)),
      stats: { rowsProcessed: 0, rowsSkipped: 0, entriesTouched: 0 }
    };
  }

  const header = rows[0].map((h: unknown) => (h ?? '').toString().trim());
  const missing = FIXED_COLS.filter((c) => !header.includes(c));
  if (missing.length) {
    warnings.push(`missing required columns: ${missing.join(', ')}`);
  }

  const tagKeys = parseTagKeysFromHeader(header);
  const sigCurrent = computeModelSignature(model);
  let sigFile: string | null = null;

  const idx = buildOverlayModelExternalIdIndex(model);
  let rowsProcessed = 0;
  let rowsSkipped = 0;
  let entriesTouched = 0;

  // Start at 1 to skip header.
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c: unknown) => (c ?? '') === '')) {
      rowsSkipped++;
      continue;
    }
    const map = rowToMap(header, row);
    const kindRaw = (map.kind ?? '').toString().trim();

    if (kindRaw === '#model_signature') {
      sigFile = (map.target_id ?? '').toString().trim() || null;
      continue;
    }

    if (kindRaw !== 'element' && kindRaw !== 'relationship') {
      rowsSkipped++;
      continue;
    }
    const kind = kindRaw;

    const targetId = (map.target_id ?? '').toString().trim();
    const byId = kind === 'element' ? model.elements?.[targetId] : model.relationships?.[targetId];

    let targetObj: Element | Relationship | null = byId ?? null;
    if (!targetObj) {
      const k = inferExternalKeyFromRow(map);
      if (k) {
        const candidates = resolveTargetsByExternalKey(idx, k).filter((c) => c.kind === kind);
        if (candidates.length === 1) {
          targetObj = kind === 'element' ? model.elements?.[candidates[0].id] ?? null : model.relationships?.[candidates[0].id] ?? null;
        } else if (candidates.length > 1) {
          warnings.push(`row ${r + 1}: ambiguous match for external key ${k} (${candidates.length} candidates)`);
        }
      }
    }

    const nextTags: Record<string, string> = {};
    let hasAnyTagValue = false;
    for (const k of tagKeys) {
      const raw = (map[k] ?? '').toString();
      const trimmed = raw.trim();
      if (!trimmed) continue;
      hasAnyTagValue = true;
      nextTags[k] = raw;
    }

    if (!targetObj) {
      // Create an orphan entry if there is at least one tag filled in.
      if (!hasAnyTagValue) {
        rowsSkipped++;
        continue;
      }
      const scheme = (map.ref_scheme ?? '').toString().trim();
      const value = (map.ref_value ?? '').toString().trim();
      const scope = (map.ref_scope ?? '').toString().trim();
      const externalRefs: OverlayExternalRef[] = scheme && value ? [{ scheme: scope ? `${scheme}@${scope}` : scheme, value }] : [];
      overlayStore.upsertEntry({ kind, externalRefs, tags: nextTags });
      entriesTouched++;
      rowsProcessed++;
      continue;
    }

    // Resolve to an existing overlay entry (if any) by external keys.
    const rawExt = Array.isArray(asRecord(targetObj)?.externalIds) ? (asRecord(targetObj)?.externalIds as unknown[]) : [];
    const extIds = dedupeExternalIds(rawExt.filter(isExternalIdRef));
    const keys = extIds.map((x) => externalKey(x)).filter((k) => !!k);
    const matches = findExistingOverlayEntriesForTarget(overlayStore, kind, keys);

    let entryId: string;
    if (matches.length >= 1) {
      entryId = matches[0];
      if (matches.length > 1) {
        warnings.push(`row ${r + 1}: multiple overlay entries matched target; updated ${entryId}`);
      }
    } else {
      entryId = overlayStore.upsertEntry({ kind, externalRefs: buildOverlayRefsForModelObject(targetObj), tags: {} });
    }

    const entry = overlayStore.getEntry(entryId);
    if (!entry) {
      rowsSkipped++;
      continue;
    }

    // Apply updates.
    const merged: Record<string, OverlayTagValue> = { ...entry.tags };
    let changed = false;

    for (const k of tagKeys) {
      const raw = (map[k] ?? '').toString();
      const trimmed = raw.trim();
      if (!trimmed) {
        if (options.blankMode === 'clear' && k in merged) {
          delete merged[k];
          changed = true;
        }
        continue;
      }
      if (merged[k] !== raw) {
        merged[k] = raw;
        changed = true;
      }
    }

    if (changed) {
      overlayStore.setTags(entryId, merged);
      entriesTouched++;
    }

    rowsProcessed++;
  }

  if (sigFile && sigFile !== sigCurrent) {
    warnings.push(`signature mismatch (file=${sigFile}, current=${sigCurrent})`);
  }

  const resolveReport = resolveOverlayAgainstModel(overlayStore.listEntries(), idx);
  return { warnings, resolveReport, stats: { rowsProcessed, rowsSkipped, entriesTouched } };
}
