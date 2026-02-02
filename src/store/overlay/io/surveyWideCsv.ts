import type { Model, TaggedValue } from '../../../domain';
import { dedupeExternalIds, externalKey } from '../../../domain/externalIds';
import type { Element, Relationship } from '../../../domain/types';
import { normalizeKey } from '../../../domain/taggedValues';
import {
  buildOverlayModelExternalIdIndex,
  computeModelSignature,
  resolveTargetsByExternalKey,
  toOverlayExternalRef,
  type OverlayExternalRef
} from '../../../domain/overlay';

import type { OverlayStore } from '../OverlayStore';
import { resolveOverlayAgainstModel } from '../resolve';
import type { ResolveReport } from '../resolve';
import { getEffectiveTagsForElement, getEffectiveTagsForRelationship } from '../effectiveTags';

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

function escapeCsvCell(v: string): string {
  const s = (v ?? '').toString();
  if (!s) return '';
  if (/[\n\r",]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsvLine(cells: string[]): string {
  return cells.map(escapeCsvCell).join(',');
}

type CsvDelimiter = ',' | ';' | '\t';

function countDelimsInSample(sample: string, delim: CsvDelimiter): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = sample[i + 1];
        if (next === '"') {
          i++;
          continue;
        }
        inQuotes = false;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delim) count++;
    if (ch === '\n' || ch === '\r') break;
  }
  return count;
}

function detectDelimiter(text: string): CsvDelimiter {
  const s = (text ?? '').toString();
  // Use the first non-empty line as the sample (usually the header).
  const lines = s.split(/\r?\n/);
  const sample = (lines.find((l) => l.trim().length > 0) ?? '').toString();
  const candidates: CsvDelimiter[] = [',', ';', '\t'];
  let best: CsvDelimiter = ',';
  let bestCount = -1;
  for (const d of candidates) {
    const c = countDelimsInSample(sample, d);
    if (c > bestCount) {
      bestCount = c;
      best = d;
    }
  }
  return best;
}

/** Minimal CSV parser (RFC4180-ish). Handles quoted fields, commas/semicolons/tabs, CRLF/LF. */
export function parseCsv(text: string, delimiter?: CsvDelimiter): string[][] {
  const out: string[][] = [];
  const s = (text ?? '').toString();

  const delim: CsvDelimiter = delimiter ?? detectDelimiter(s);

  let row: string[] = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    // ignore trailing empty row
    if (row.length === 1 && row[0] === '' && out.length === 0) {
      row = [];
      return;
    }
    out.push(row);
    row = [];
  };

  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = s[i + 1];
        if (next === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === delim) {
      pushCell();
      i++;
      continue;
    }

    if (ch === '\n' || ch === '\r') {
      pushCell();
      pushRow();
      // swallow CRLF
      if (ch === '\r' && s[i + 1] === '\n') i++;
      i++;
      continue;
    }

    cell += ch;
    i++;
  }

  // last cell/row
  pushCell();
  if (row.some((c) => c !== '') || out.length > 0) pushRow();
  return out;
}

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

function pickPrimaryExternalRef(externalIds: any): { scheme: string; scope: string; value: string; ref?: OverlayExternalRef } {
  const list = dedupeExternalIds(externalIds ?? []);
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
  const out: Array<{ kind: 'element' | 'relationship'; obj: any }> = [];
  const targetSet = options.targetSet;

  const elTypes = (options.elementTypes ?? []).filter((t) => !!t);
  const relTypes = (options.relationshipTypes ?? []).filter((t) => !!t);

  if (targetSet === 'elements' || targetSet === 'both') {
    for (const el of Object.values(model.elements ?? {})) {
      const t = (el as any).type ?? '';
      if (elTypes.length > 0 && !elTypes.includes(String(t))) continue;
      out.push({ kind: 'element', obj: el });
    }
  }
  if (targetSet === 'relationships' || targetSet === 'both') {
    for (const rel of Object.values(model.relationships ?? {})) {
      const t = (rel as any).type ?? '';
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
    const id = (t.obj as any).id ?? '';
    const name = (t.obj as any).name ?? '';
    const type = (t.obj as any).type ?? '';
    const ext = pickPrimaryExternalRef((t.obj as any).externalIds);

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

function buildOverlayRefsForModelObject(obj: any): OverlayExternalRef[] {
  const list = dedupeExternalIds(obj?.externalIds ?? []);
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

  const header = rows[0].map((h) => (h ?? '').toString().trim());
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
    if (!row || row.every((c) => (c ?? '') === '')) {
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
    const byId = kind === 'element' ? (model.elements as any)[targetId] : (model.relationships as any)[targetId];

    let targetObj: any | null = byId ?? null;
    if (!targetObj) {
      const k = inferExternalKeyFromRow(map);
      if (k) {
        const candidates = resolveTargetsByExternalKey(idx, k).filter((c) => c.kind === kind);
        if (candidates.length === 1) {
          targetObj = kind === 'element' ? (model.elements as any)[candidates[0].id] : (model.relationships as any)[candidates[0].id];
        } else if (candidates.length > 1) {
          warnings.push(`row ${r + 1}: ambiguous match for external key ${k} (${candidates.length} candidates)`);
        }
      }
    }

    const nextTags: Record<string, any> = {};
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
    const extIds = dedupeExternalIds(targetObj.externalIds ?? []);
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
    const merged: Record<string, any> = { ...entry.tags };
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
