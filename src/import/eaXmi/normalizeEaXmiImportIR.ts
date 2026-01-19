import { addWarning } from '../importReport';
import type { ImportReport } from '../importReport';
import type { IRExternalId, IRId, IRModel, IRView, IRViewNode } from '../framework/ir';

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



// --- Milestone B (Step B2): Resolve diagram object references to imported elements ---

function uniq<T>(arr: T[]): T[] {
  const out: T[] = [];
  const seen = new Set<T>();
  for (const a of arr) {
    if (seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
}

function normalizeRefToken(raw: string): string[] {
  const s = (raw ?? '').trim();
  if (!s) return [];

  const out: string[] = [s];
  const lower = s.toLowerCase();
  if (lower !== s) out.push(lower);

  // EA GUIDs are often wrapped in braces: {AAAAAAAA-BBBB-…}
  if (s.startsWith('{') && s.endsWith('}') && s.length > 2) {
    const inner = s.slice(1, -1).trim();
    if (inner) {
      out.push(inner);
      const innerLower = inner.toLowerCase();
      if (innerLower !== inner) out.push(innerLower);
    }
  }

  return uniq(out);
}

function addLookup(map: Map<string, IRId>, token: string, id: IRId): void {
  const t = token.trim();
  if (!t) return;
  if (!map.has(t)) map.set(t, id);
}

function addLookupVariants(map: Map<string, IRId>, token: string, id: IRId): void {
  for (const v of normalizeRefToken(token)) addLookup(map, v, id);
}

function addExternalIdVariants(map: Map<string, IRId>, externalIds: IRExternalId[] | undefined, id: IRId): void {
  for (const ex of externalIds ?? []) {
    if (!ex?.id) continue;
    addLookupVariants(map, ex.id, id);
  }
}

function buildElementLookup(elements: { id: IRId; externalIds?: IRExternalId[] }[]): Map<string, IRId> {
  const m = new Map<string, IRId>();
  for (const e of elements) {
    if (!e?.id) continue;
    addLookupVariants(m, e.id, e.id);
    addExternalIdVariants(m, e.externalIds, e.id);
  }
  return m;
}

const EA_NODE_REF_KEYS_PRIORITY = [
  // EA-specific diagram object refs
  'subject',
  'subjectid',
  'subject_id',
  'element',
  'elementid',
  'element_id',
  'classifier',
  'classifierid',
  'classifier_id',
  'instance',
  'instanceid',
  'instance_id',
  // generic refs
  'xmi:idref',
  'idref',
  'ref',
  'href'
] as const;

function getRefRaw(node: IRViewNode): Record<string, string> | undefined {
  const meta = node.meta;
  if (!meta || typeof meta !== 'object') return undefined;
  const rr = (meta as Record<string, unknown>).refRaw;
  if (!rr || typeof rr !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rr as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return Object.keys(out).length ? out : undefined;
}

function candidateRefValues(refRaw: Record<string, string> | undefined): string[] {
  if (!refRaw) return [];
  const out: string[] = [];
  for (const k of EA_NODE_REF_KEYS_PRIORITY) {
    const v = refRaw[k];
    if (v && !out.includes(v)) out.push(v);
  }
  // Add any remaining refRaw fields (best-effort)
  for (const v of Object.values(refRaw)) {
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function resolveEaXmiViews(
  viewsRaw: IRView[] | undefined,
  folderIds: Set<string>,
  elementLookup: Map<string, IRId>,
  opts?: NormalizeEaXmiOptions
): IRView[] | undefined {
  if (!viewsRaw) return undefined;

  return viewsRaw.map((v) => {
    // Validate folderId (diagram owning package)
    let folderId = v.folderId;
    if (folderId && typeof folderId === 'string' && !folderIds.has(folderId)) {
      warn(opts, `EA XMI Normalize: View "${v.id}" referenced missing folderId "${folderId}"; moved to root.`);
      folderId = null;
    }

    const nextNodes: IRViewNode[] = [];

    for (const n of v.nodes ?? []) {
      if (!n?.id) continue;

      // Preserve nodes that are already resolved or are non-element objects.
      if (n.elementId) {
        nextNodes.push(n);
        continue;
      }
      if (n.kind && n.kind !== 'element') {
        nextNodes.push(n);
        continue;
      }

      // Try to resolve element placeholder nodes.
      const refRaw = getRefRaw(n);
      const candidates = candidateRefValues(refRaw);

      let resolved: IRId | undefined;
      let usedToken: string | undefined;

      for (const cand of candidates) {
        for (const tok of normalizeRefToken(cand)) {
          const hit = elementLookup.get(tok);
          if (hit) {
            resolved = hit;
            usedToken = cand;
            break;
          }
        }
        if (resolved) break;
      }

      if (!resolved) {
        // Safety: avoid importing unresolved element placeholders as Notes/Labels in applyImportIR.
        if (candidates.length) {
          warn(
            opts,
            `EA XMI Normalize: View "${v.name}" node "${n.id}" could not resolve referenced element (${candidates
              .slice(0, 3)
              .join(', ')}${candidates.length > 3 ? ', …' : ''}); skipped node.`
          );
        } else {
          warn(opts, `EA XMI Normalize: View "${v.name}" node "${n.id}" had no resolvable reference; skipped node.`);
        }
        continue;
      }

      nextNodes.push({
        ...n,
        elementId: resolved,
        meta: {
          ...(n.meta && typeof n.meta === 'object' ? (n.meta as Record<string, unknown>) : {}),
          ...(usedToken ? { resolvedFrom: usedToken } : {})
        }
      });
    }

    return {
      ...v,
      ...(folderId !== undefined ? { folderId } : {}),
      nodes: nextNodes
    };
  });
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

  // Step B2: resolve diagram object references (unresolved view nodes -> elementId)
  const elementLookup = buildElementLookup(elements);
  const views = resolveEaXmiViews(ir.views, folderIds, elementLookup, opts);

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
    ...(views !== undefined ? { views } : {}),
    meta
  };
}
