import type { Model } from '../../../domain/types';
import { OVERLAY_FILE_FORMAT_V1, computeModelSignature, normalizeOverlayRefs } from '../../../domain/overlay';
import type { OverlayEntry, OverlayExternalRef, OverlayFile, OverlayTagValue, OverlayTargetKind } from '../../../domain/overlay';

import type { OverlayStore } from '../OverlayStore';
import { importOverlayFileToStore, type OverlayImportOptions, type OverlayImportStats, type OverlayImportWarning } from './jsonOverlay';

export type CsvLongFormat = 'pwa-modeller-overlay-csv-long@1';

export const OVERLAY_CSV_LONG_FORMAT_V1: CsvLongFormat = 'pwa-modeller-overlay-csv-long@1';

export type CsvLongRow = {
  kind: OverlayTargetKind;
  entryId?: string;
  primaryRefScheme?: string;
  primaryRefValue?: string;
  refsJson?: string;
  tagKey: string;
  tagValue?: string;
  tagValueJson?: string;
};

export type CsvLongParseResult = {
  rows: CsvLongRow[];
  warnings: string[];
};

export type CsvLongImportResult = {
  file: OverlayFile;
  warnings: string[];
  stats: OverlayImportStats;
  report: ReturnType<typeof importOverlayFileToStore>['resolveReport'];
};

function nowIso(): string {
  return new Date().toISOString();
}

function escapeCsvCell(value: string): string {
  const mustQuote = /[\n\r",]/.test(value);
  if (!mustQuote) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function toCsv(rows: string[][]): string {
  return rows
    .map((r) => r.map((c) => escapeCsvCell(c ?? '')).join(','))
    .join('\n');
}

function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;

  // Normalize newlines.
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = s[i + 1];
        if (next === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      row.push(cur);
      cur = '';
      continue;
    }

    if (ch === '\n') {
      row.push(cur);
      out.push(row);
      row = [];
      cur = '';
      continue;
    }

    cur += ch;
  }

  // flush last cell
  row.push(cur);
  out.push(row);

  return out;
}

function normHeader(h: string): string {
  return (h ?? '').trim().toLowerCase();
}

function tryParseJsonValue(text: string): { ok: true; value: OverlayTagValue } | { ok: false } {
  const t = text.trim();
  if (!t) return { ok: true, value: '' };
  try {
    return { ok: true, value: JSON.parse(t) as OverlayTagValue };
  } catch {
    return { ok: false };
  }
}

function warningToString(w: OverlayImportWarning): string {
  if (w.type === 'signature-mismatch') {
    const a = w.fileSignature ? `file=${w.fileSignature}` : 'file=?';
    const b = w.currentSignature ? `current=${w.currentSignature}` : 'current=?';
    return `signature mismatch (${a}, ${b})`;
  }
  if (w.type === 'merge-conflict-multiple-existing') {
    return `merge conflict: imported entry ${w.importedEntryId ?? `#${w.importedEntryIndex}`} matched multiple existing entries (${w.matchedEntryIds.join(', ')})`;
  }
  return `dropped invalid entry #${w.importedEntryIndex}: ${w.reason}`;
}

function pickPrimaryRef(refs: OverlayExternalRef[]): OverlayExternalRef | null {
  const n = normalizeOverlayRefs(refs);
  return n.length ? n[0] : null;
}

export function serializeOverlayStoreToCsvLong(args: { overlayStore: OverlayStore; model?: Model }): string {
  const rows: string[][] = [];

  rows.push([
    'kind',
    'entry_id',
    'primary_ref_scheme',
    'primary_ref_value',
    'refs_json',
    'tag_key',
    'tag_value',
    'tag_value_json'
  ]);

  for (const e of args.overlayStore.listEntries().slice().sort((a, b) => a.entryId.localeCompare(b.entryId))) {
    const refs = normalizeOverlayRefs(e.target.externalRefs);
    const primary = pickPrimaryRef(refs);
    const refsJson = JSON.stringify(refs);

    const tagKeys = Object.keys(e.tags ?? {}).sort();
    if (tagKeys.length === 0) {
      // Still export a row so that refs survive round-trips even when no tags exist.
      rows.push([
        e.target.kind,
        e.entryId,
        primary?.scheme ?? '',
        primary?.value ?? '',
        refsJson,
        '',
        '',
        ''
      ]);
      continue;
    }

    for (const k of tagKeys) {
      const v = e.tags[k];
      const vJson = JSON.stringify(v);
      const vText = typeof v === 'string' ? v : vJson;
      rows.push([
        e.target.kind,
        e.entryId,
        primary?.scheme ?? '',
        primary?.value ?? '',
        refsJson,
        k,
        vText,
        vJson
      ]);
    }
  }

  // Include a simple footer line with the model signature, as an extra convenience.
  // It is a normal data row with empty columns so CSV tools stay happy.
  if (args.model) {
    const sig = computeModelSignature(args.model);
    rows.push(['#model_signature', '', '', '', '', '', sig, '']);
  }

  return toCsv(rows);
}

export function parseCsvLong(text: string): CsvLongParseResult {
  const warnings: string[] = [];
  const grid = parseCsv(text).filter((r) => r.some((c) => (c ?? '').trim().length > 0));
  if (grid.length === 0) return { rows: [], warnings: ['empty csv'] };

  const headerRow = grid[0].map(normHeader);

  const idx = (name: string): number => headerRow.indexOf(normHeader(name));
  const iKind = idx('kind');
  const iEntry = idx('entry_id');
  const iScheme = idx('primary_ref_scheme');
  const iValue = idx('primary_ref_value');
  const iRefsJson = idx('refs_json');
  const iTagKey = idx('tag_key');
  const iTagValue = idx('tag_value');
  const iTagJson = idx('tag_value_json');

  if (iKind < 0 || iTagKey < 0) {
    return { rows: [], warnings: ['missing required headers (need at least: kind, tag_key)'] };
  }

  const rows: CsvLongRow[] = [];
  for (let r = 1; r < grid.length; r += 1) {
    const line = grid[r];
    const kindRaw = (line[iKind] ?? '').trim();
    if (kindRaw === '#model_signature') {
      continue;
    }
    if (kindRaw !== 'element' && kindRaw !== 'relationship') {
      warnings.push(`row ${r + 1}: invalid kind '${kindRaw}'`);
      continue;
    }

    const kind = kindRaw as OverlayTargetKind;

    const entryId = iEntry >= 0 ? (line[iEntry] ?? '').trim() : '';
    const scheme = iScheme >= 0 ? (line[iScheme] ?? '').trim() : '';
    const value = iValue >= 0 ? (line[iValue] ?? '').trim() : '';
    const refsJson = iRefsJson >= 0 ? (line[iRefsJson] ?? '').trim() : '';
    const tagKey = iTagKey >= 0 ? (line[iTagKey] ?? '').trim() : '';
    const tagValue = iTagValue >= 0 ? (line[iTagValue] ?? '').trim() : '';
    const tagValueJson = iTagJson >= 0 ? (line[iTagJson] ?? '').trim() : '';

    rows.push({
      kind,
      entryId: entryId || undefined,
      primaryRefScheme: scheme || undefined,
      primaryRefValue: value || undefined,
      refsJson: refsJson || undefined,
      tagKey,
      tagValue: tagValue || undefined,
      tagValueJson: tagValueJson || undefined
    });
  }

  return { rows, warnings };
}

export function csvLongRowsToOverlayFile(args: {
  rows: CsvLongRow[];
  createdAt?: string;
  model?: Model;
}): { file: OverlayFile; warnings: string[] } {
  const warnings: string[] = [];
  const createdAt = args.createdAt ?? nowIso();

  // Group rows into entries.
  type Acc = {
    kind: OverlayTargetKind;
    entryId?: string;
    refs: OverlayExternalRef[];
    tags: Record<string, OverlayTagValue>;
  };

  const byKey = new Map<string, Acc>();

  for (let i = 0; i < args.rows.length; i += 1) {
    const r = args.rows[i];
    const entryId = r.entryId?.trim();
    const scheme = (r.primaryRefScheme ?? '').trim();
    const value = (r.primaryRefValue ?? '').trim();

    const groupKey = entryId ? `id:${entryId}` : `ref:${r.kind}:${scheme}::${value}`;

    if (!entryId && (!scheme || !value) && !(r.refsJson && r.refsJson.trim())) {
      warnings.push(`row ${i + 2}: missing entry_id and missing primary_ref_scheme/value`);
      continue;
    }

    let acc = byKey.get(groupKey);
    if (!acc) {
      acc = { kind: r.kind, entryId: entryId || undefined, refs: [], tags: {} };
      byKey.set(groupKey, acc);
    }

    if (acc.kind !== r.kind) {
      warnings.push(`row ${i + 2}: inconsistent kind for entry '${acc.entryId ?? groupKey}'`);
    }

    // Refs
    if (r.refsJson && r.refsJson.trim()) {
      try {
        const parsed = JSON.parse(r.refsJson) as unknown;
        if (Array.isArray(parsed)) {
          for (const x of parsed) {
            const scheme = (x as any)?.scheme;
            const value = (x as any)?.value;
            if (typeof scheme === 'string' && typeof value === 'string' && scheme.trim() && value.trim()) {
              acc.refs.push({ scheme: scheme.trim(), value: value.trim() });
            }
          }
        }
      } catch {
        warnings.push(`row ${i + 2}: invalid refs_json`);
      }
    } else if (scheme && value) {
      acc.refs.push({ scheme, value });
    }

    // Tags
    const tagKey = (r.tagKey ?? '').trim();
    if (!tagKey) continue;

    const vJson = (r.tagValueJson ?? '').trim();
    if (vJson) {
      const p = tryParseJsonValue(vJson);
      if (p.ok) acc.tags[tagKey] = p.value;
      else acc.tags[tagKey] = r.tagValue ?? '';
    } else {
      // Tag values are treated as strings when no JSON column exists.
      acc.tags[tagKey] = r.tagValue ?? '';
    }
  }

  const entries: OverlayEntry[] = [];
  for (const acc of byKey.values()) {
    const refs = normalizeOverlayRefs(acc.refs);
    if (refs.length === 0) {
      warnings.push(`entry '${acc.entryId ?? '(no-id)'}' dropped: no refs`);
      continue;
    }
    entries.push({
      entryId: acc.entryId,
      target: { kind: acc.kind, externalRefs: refs },
      tags: acc.tags
    });
  }

  const modelHint = args.model
    ? { name: args.model.metadata?.name, signature: computeModelSignature(args.model) }
    : undefined;

  return {
    file: {
      format: OVERLAY_FILE_FORMAT_V1,
      createdAt,
      modelHint,
      entries
    },
    warnings
  };
}

export function importCsvLongToStore(args: {
  overlayStore: OverlayStore;
  model: Model;
  csvText: string;
  options?: OverlayImportOptions;
}): CsvLongImportResult {
  const parseRes = parseCsvLong(args.csvText);
  const buildRes = csvLongRowsToOverlayFile({ rows: parseRes.rows, model: args.model });

  const importRes = importOverlayFileToStore({
    overlayStore: args.overlayStore,
    overlayFile: buildRes.file,
    model: args.model,
    options: args.options
  });

  const warnings = [...parseRes.warnings, ...buildRes.warnings, ...importRes.warnings.map(warningToString)];

  return {
    file: buildRes.file,
    warnings,
    stats: importRes.stats,
    report: importRes.resolveReport
  };
}
