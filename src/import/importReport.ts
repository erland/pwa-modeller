import type { Model } from '../domain';
import type { UnknownTypeInfo } from '../domain/types';

export type ImportUnknownCounts = Record<string, number>;

export type ImportIssueLevel = 'info' | 'warn' | 'error';

export type ImportIssueContext = {
  elementId?: string;
  relationshipId?: string;
  viewId?: string;
  folderId?: string;
  xmiId?: string;
  profileTag?: string;
  [k: string]: unknown;
};

export type ImportIssue = {
  level: ImportIssueLevel;
  code: string;
  message: string;
  count: number;
  samples?: ImportIssueContext[];
};

export interface ImportReport {
  /** A short hint about where the data came from (e.g. 'json', 'archimate-exchange', 'ea-xmi'). */
  source: string;
  /** Legacy flat warnings (kept for backwards compatibility). */
  warnings: string[];
  /** Structured, deduplicated issues. */
  issues: ImportIssue[];
  unknownElementTypes: ImportUnknownCounts;
  unknownRelationshipTypes: ImportUnknownCounts;
}

export function createImportReport(source: string): ImportReport {
  return {
    source,
    warnings: [],
    issues: [],
    unknownElementTypes: {},
    unknownRelationshipTypes: {}
  };
}

function keyForUnknown(info: UnknownTypeInfo): string {
  const ns = (info.ns ?? '').trim();
  const name = (info.name ?? '').trim() || 'Unknown';
  return ns ? `${ns}:${name}` : name;
}

function bump(map: ImportUnknownCounts, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

export function recordUnknownElementType(report: ImportReport, info: UnknownTypeInfo) {
  bump(report.unknownElementTypes, keyForUnknown(info));
}

export function recordUnknownRelationshipType(report: ImportReport, info: UnknownTypeInfo) {
  bump(report.unknownRelationshipTypes, keyForUnknown(info));
}

export function addIssue(
  report: ImportReport,
  input: {
    level: ImportIssueLevel;
    code?: string;
    message: string;
    context?: ImportIssueContext;
    maxSamples?: number;
  }
) {
  const level = input.level;
  const message = (input.message ?? '').toString();
  if (!message.trim()) return;

  const code = (input.code ?? 'generic').trim() || 'generic';
  const maxSamples = Math.max(0, input.maxSamples ?? 5);

  const existing = report.issues.find((i) => i.level === level && i.code === code && i.message === message);

  if (existing) {
    existing.count += 1;
    if (input.context) {
      existing.samples = existing.samples ?? [];
      if (existing.samples.length < maxSamples) existing.samples.push(input.context);
    }
  } else {
    report.issues.push({
      level,
      code,
      message,
      count: 1,
      samples: input.context ? [input.context] : undefined
    });
  }

  // Keep legacy warnings list in sync for older UI/exports.
  if ((level === 'warn' || level === 'error') && !report.warnings.includes(message)) {
    report.warnings.push(message);
  }
}

export function addWarning(
  report: ImportReport,
  warning: string,
  opts?: { code?: string; context?: ImportIssueContext }
) {
  addIssue(report, { level: 'warn', code: opts?.code ?? 'warning', message: warning, context: opts?.context });
}

export function addInfo(report: ImportReport, message: string, opts?: { code?: string; context?: ImportIssueContext }) {
  addIssue(report, { level: 'info', code: opts?.code ?? 'info', message, context: opts?.context });
}

export function addError(report: ImportReport, message: string, opts?: { code?: string; context?: ImportIssueContext }) {
  addIssue(report, { level: 'error', code: opts?.code ?? 'error', message, context: opts?.context });
}

export function ensureIssuesFromWarnings(report: ImportReport): ImportIssue[] {
  const m = new Map<string, ImportIssue>();
  const warnMessages = new Set<string>();

  for (const i of report.issues ?? []) {
    const key = `${i.level}|${i.code}|${i.message}`;
    m.set(key, i);
    if (i.level === 'warn' || i.level === 'error') warnMessages.add(i.message);
  }

  // If some code paths still push to legacy warnings, promote those into issues so the UI can render them.
  for (const w of report.warnings ?? []) {
    const msg = (w ?? '').toString();
    if (!msg.trim()) continue;
    if (warnMessages.has(msg)) continue;

    const key = `warn|legacy-warning|${msg}`;
    const hit = m.get(key);
    if (hit) {
      hit.count += 1;
    } else {
      m.set(key, { level: 'warn', code: 'legacy-warning', message: msg, count: 1 });
      warnMessages.add(msg);
    }
  }

  report.issues = Array.from(m.values());
  return report.issues;
}

export function hasImportWarnings(report: ImportReport): boolean {
  const issues = ensureIssuesFromWarnings(report);
  const hasWarnOrError = issues.some((i) => i.level === 'warn' || i.level === 'error');
  return (
    hasWarnOrError ||
    Object.keys(report.unknownElementTypes).length > 0 ||
    Object.keys(report.unknownRelationshipTypes).length > 0
  );
}

/**
 * Useful for "format-agnostic" imports: even if we didn't actively map types during parsing,
 * we can still scan the resulting model and tell the user if it contains unknown types.
 */
export function scanModelForUnknownTypes(model: Model, source = 'model'): ImportReport | null {
  const report = createImportReport(source);

  for (const el of Object.values(model.elements)) {
    if (el.type === 'Unknown') {
      recordUnknownElementType(report, el.unknownType ?? { name: 'Unknown' });
    }
  }

  for (const rel of Object.values(model.relationships)) {
    if (rel.type === 'Unknown') {
      recordUnknownRelationshipType(report, rel.unknownType ?? { name: 'Unknown' });
    }
  }

  return hasImportWarnings(report) ? report : null;
}

export function formatUnknownCounts(counts: ImportUnknownCounts): Array<[string, number]> {
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
