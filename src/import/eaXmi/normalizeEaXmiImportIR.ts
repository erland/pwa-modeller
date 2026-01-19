import { addWarning } from '../importReport';
import type { ImportReport } from '../importReport';
import type { IRModel } from '../framework/ir';

export type NormalizeEaXmiOptions = {
  report?: ImportReport;
  source?: string;
};

function warn(opts: NormalizeEaXmiOptions | undefined, message: string): void {
  if (!opts?.report) return;
  addWarning(opts.report, `${opts.source ? `${opts.source}: ` : ''}${message}`);
}

function trimOrUndef(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  return s.length ? s : undefined;
}

function normalizeBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : undefined;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    if (t === 'true' || t === '1' || t === 'yes') return true;
    if (t === 'false' || t === '0' || t === 'no') return false;
  }
  return undefined;
}

function normalizeUmlMembers(raw: unknown): unknown {
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

function normalizeUmlRelAttrs(raw: unknown): unknown {
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

/**
 * Step 9 (EA XMI): format-specific normalization & finalization.
 *
 * This intentionally does *not* duplicate the generic normalizeImportIR pass.
 * Instead it:
 * - trims/cleans a couple EA-specific meta payloads (umlMembers, umlAttrs)
 * - ensures folder references are safe
 * - ensures basic meta fields are present
 */
export function normalizeEaXmiImportIR(ir: IRModel | undefined, opts?: NormalizeEaXmiOptions): IRModel | undefined {
  if (!ir) return ir;

  const folderIds = new Set((ir.folders ?? []).map((f) => (typeof f?.id === 'string' ? f.id : '')));

  const elements = (ir.elements ?? []).map((e) => {
    const name = trimOrUndef(e.name) ?? e.name;
    const documentation = trimOrUndef(e.documentation);

    let folderId = e.folderId;
    if (folderId && typeof folderId === 'string' && !folderIds.has(folderId)) {
      warn(opts, `EA XMI Normalize: Element "${e.id}" referenced missing folderId "${folderId}"; moved to root.`);
      folderId = null;
    }

    const meta = e.meta && typeof e.meta === 'object' ? { ...(e.meta as Record<string, unknown>) } : undefined;
    if (meta && 'umlMembers' in meta) {
      meta.umlMembers = normalizeUmlMembers((meta as any).umlMembers);
    }

    return {
      ...e,
      name,
      documentation,
      ...(folderId !== undefined ? { folderId } : {}),
      ...(meta ? { meta } : {})
    };
  });

  const relationships = (ir.relationships ?? []).map((r) => {
    const name = trimOrUndef(r.name);
    const documentation = trimOrUndef(r.documentation);

    const meta = r.meta && typeof r.meta === 'object' ? { ...(r.meta as Record<string, unknown>) } : undefined;
    if (meta && 'umlAttrs' in meta) {
      const next = normalizeUmlRelAttrs((meta as any).umlAttrs);
      if (next) meta.umlAttrs = next;
      else delete (meta as any).umlAttrs;
    }

    return {
      ...r,
      ...(name ? { name } : {}),
      ...(documentation ? { documentation } : {}),
      ...(meta ? { meta } : {})
    };
  });

  const meta = {
    ...(ir.meta ?? {}),
    format: (ir.meta?.format ?? 'ea-xmi-uml').toString(),
    tool: (ir.meta?.tool ?? 'Sparx Enterprise Architect').toString(),
    sourceSystem: (ir.meta?.sourceSystem ?? 'sparx-ea').toString(),
    importedAtIso: (ir.meta?.importedAtIso ?? new Date().toISOString()).toString()
  };

  return {
    ...ir,
    folders: ir.folders ?? [],
    elements,
    relationships,
    meta
  };
}
