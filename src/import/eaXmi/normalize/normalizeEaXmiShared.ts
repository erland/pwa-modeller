import { addInfo, addWarning } from '../../importReport';
import type { ImportIssueContext, ImportReport } from '../../importReport';

export type NormalizeEaXmiOptions = {
  report?: ImportReport;
  source?: string;
};

export function warn(
  opts: NormalizeEaXmiOptions | undefined,
  message: string,
  warnOpts?: { code?: string; context?: ImportIssueContext }
): void {
  if (!opts?.report) return;
  const prefix = opts.source ? `${opts.source}: ` : '';
  addWarning(opts.report, `${prefix}${message}`, warnOpts);
}

export function info(
  opts: NormalizeEaXmiOptions | undefined,
  message: string,
  infoOpts?: { code?: string; context?: ImportIssueContext }
): void {
  if (!opts?.report) return;
  const prefix = opts.source ? `${opts.source}: ` : '';
  addInfo(opts.report, `${prefix}${message}`, infoOpts);
}

export function trimOrUndef(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  return s.length ? s : undefined;
}

export function normalizeBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : undefined;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    if (t === 'true' || t === '1' || t === 'yes') return true;
    if (t === 'false' || t === '0' || t === 'no') return false;
  }
  return undefined;
}

export function normalizeUmlMembers(raw: unknown): unknown {
  // Keep this conservative: we just trim strings and drop obviously malformed entries.
  // The strict sanitization happens later in applyImportIR via sanitizeUmlClassifierAttrs().
  if (!raw || typeof raw !== 'object') return raw;
  const r = raw as Record<string, unknown>;

  const attrs = Array.isArray(r.attributes) ? r.attributes : [];
  const ops = Array.isArray(r.operations) ? r.operations : [];

  const nextAttrs = attrs
    .filter((a) => a && typeof a === 'object')
    .map((a) => {
      const ar = a as Record<string, unknown>;
      const name = trimOrUndef(ar.name) ?? '';
      const out: Record<string, unknown> = { name };
      const type = trimOrUndef(ar.type);
      if (type) out.type = type;
      const vis = trimOrUndef(ar.visibility);
      if (vis) out.visibility = vis;
      const isStatic = normalizeBool(ar.isStatic);
      if (typeof isStatic === 'boolean') out.isStatic = isStatic;
      const dv = trimOrUndef(ar.defaultValue);
      if (dv) out.defaultValue = dv;
      return out;
    })
    .filter((a) => (a as any).name);

  const nextOps = ops
    .filter((o) => o && typeof o === 'object')
    .map((o) => {
      const or = o as Record<string, unknown>;
      const name = trimOrUndef(or.name) ?? '';
      const out: Record<string, unknown> = { name };
      const rt = trimOrUndef(or.returnType);
      if (rt) out.returnType = rt;
      const vis = trimOrUndef(or.visibility);
      if (vis) out.visibility = vis;
      const isStatic = normalizeBool(or.isStatic);
      if (typeof isStatic === 'boolean') out.isStatic = isStatic;
      const isAbstract = normalizeBool(or.isAbstract);
      if (typeof isAbstract === 'boolean') out.isAbstract = isAbstract;

      const paramsRaw = Array.isArray(or.params) ? or.params : [];
      const params = paramsRaw
        .filter((p) => p && typeof p === 'object')
        .map((p) => {
          const pr = p as Record<string, unknown>;
          const pn = trimOrUndef(pr.name) ?? '';
          const po: Record<string, unknown> = { name: pn };
          const pt = trimOrUndef(pr.type);
          if (pt) po.type = pt;
          return po;
        })
        .filter((p) => (p as any).name);
      if (params.length) out.params = params;

      return out;
    })
    .filter((o) => (o as any).name);

  return { attributes: nextAttrs, operations: nextOps };
}

export function normalizeUmlRelAttrs(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  const sr = trimOrUndef(r.sourceRole);
  if (sr) out.sourceRole = sr;
  const tr = trimOrUndef(r.targetRole);
  if (tr) out.targetRole = tr;

  const sm = trimOrUndef(r.sourceMultiplicity);
  if (sm) out.sourceMultiplicity = sm;
  const tm = trimOrUndef(r.targetMultiplicity);
  if (tm) out.targetMultiplicity = tm;

  const sn = normalizeBool(r.sourceNavigable);
  if (typeof sn === 'boolean') out.sourceNavigable = sn;
  const tn = normalizeBool(r.targetNavigable);
  if (typeof tn === 'boolean') out.targetNavigable = tn;

  const st = trimOrUndef(r.stereotype);
  if (st) out.stereotype = st;

  return Object.keys(out).length ? out : undefined;
}
