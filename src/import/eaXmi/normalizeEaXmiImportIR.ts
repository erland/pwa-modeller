import { addInfo, addWarning } from '../importReport';
import type { ImportIssueContext, ImportReport } from '../importReport';
import type { IRExternalId, IRId, IRModel, IRRelationship, IRView, IRViewConnection, IRViewNode } from '../framework/ir';

export type NormalizeEaXmiOptions = {
  report?: ImportReport;
  source?: string;
};

function warn(
  opts: NormalizeEaXmiOptions | undefined,
  message: string,
  warnOpts?: { code?: string; context?: ImportIssueContext }
): void {
  if (!opts?.report) return;
  const prefix = opts.source ? `${opts.source}: ` : '';
  addWarning(opts.report, `${prefix}${message}`, warnOpts);
}

function info(
  opts: NormalizeEaXmiOptions | undefined,
  message: string,
  infoOpts?: { code?: string; context?: ImportIssueContext }
): void {
  if (!opts?.report) return;
  const prefix = opts.source ? `${opts.source}: ` : '';
  addInfo(opts.report, `${prefix}${message}`, infoOpts);
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

function buildRelationshipLookup(relationships: { id: IRId; externalIds?: IRExternalId[] }[]): Map<string, IRId> {
  const m = new Map<string, IRId>();
  for (const r of relationships) {
    if (!r?.id) continue;
    addLookupVariants(m, r.id, r.id);
    addExternalIdVariants(m, r.externalIds, r.id);
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

function getConnRefRaw(conn: IRViewConnection): Record<string, string> | undefined {
  const meta = conn.meta;
  if (!meta || typeof meta !== 'object') return undefined;
  const rr = (meta as Record<string, unknown>).refRaw;
  if (!rr || typeof rr !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rr as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return Object.keys(out).length ? out : undefined;
}

const EA_CONN_REL_KEYS_PRIORITY = [
  // Connector-as-<element> form may only expose the relationship ref as "subject"
  'subject',
  'connector',
  'connectorid',
  'connector_id',
  'relationship',
  'relationshipid',
  'relationship_id',
  'rel',
  'relid',
  'xmi:idref',
  'idref',
  'ref',
  'href',
  'ea_guid',
  'guid',
  'uuid'
] as const;

const EA_CONN_SRC_KEYS_PRIORITY = ['source', 'sourceid', 'source_id', 'src', 'from', 'start', 'startid', 'start_id', 'object1', 'client'] as const;
const EA_CONN_TGT_KEYS_PRIORITY = ['target', 'targetid', 'target_id', 'tgt', 'to', 'end', 'endid', 'end_id', 'object2', 'supplier'] as const;

function candidateConnRelValues(refRaw: Record<string, string> | undefined): string[] {
  if (!refRaw) return [];
  const out: string[] = [];
  for (const k of EA_CONN_REL_KEYS_PRIORITY) {
    const v = refRaw[k];
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function candidateConnEndpointValues(refRaw: Record<string, string> | undefined, keys: readonly string[]): string[] {
  if (!refRaw) return [];
  const out: string[] = [];
  for (const k of keys) {
    const v = refRaw[k];
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function matchRelationshipByEndpoints(
  relationships: IRRelationship[],
  srcEl: IRId,
  tgtEl: IRId
): { relationshipId?: IRId; reversed?: boolean; ambiguous?: boolean } {
  const direct = relationships.filter((r) => r.sourceId === srcEl && r.targetId === tgtEl);
  if (direct.length === 1) return { relationshipId: direct[0]!.id };
  if (direct.length > 1) return { ambiguous: true };

  const reversed = relationships.filter((r) => r.sourceId === tgtEl && r.targetId === srcEl);
  if (reversed.length === 1) return { relationshipId: reversed[0]!.id, reversed: true };
  if (reversed.length > 1) return { ambiguous: true };

  return {};
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
  relationshipLookup: Map<string, IRId>,
  relationships: IRRelationship[],
  opts?: NormalizeEaXmiOptions
): IRView[] | undefined {
  if (!viewsRaw) return undefined;

  return viewsRaw.map((v) => {
    // Validate folderId (diagram owning package)
    let folderId = v.folderId;
    if (folderId && typeof folderId === 'string' && !folderIds.has(folderId)) {
      info(
        opts,
        'EA XMI Normalize: View referenced missing folderId; moved to root. (EA export may omit package metadata.)',
        { code: 'missing-folder', context: { viewId: v.id, folderId } }
      );
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
          warn(opts, 'EA XMI Normalize: Could not resolve referenced element for a view node; skipped node.', {
            code: 'ea-xmi:view-node-unresolved-element',
            context: { viewId: v.id, viewName: v.name, nodeId: n.id, refCandidates: candidates.slice(0, 5) }
          });
        } else {
          warn(opts, 'EA XMI Normalize: View node had no resolvable reference; skipped node.', {
            code: 'ea-xmi:view-node-missing-ref',
            context: { viewId: v.id, viewName: v.name, nodeId: n.id }
          });
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

    const nodeToElement = new Map<string, IRId>();
    for (const n of nextNodes) {
      if (n?.id && n.elementId) nodeToElement.set(n.id, n.elementId);
    }

    const nextConnections: IRViewConnection[] = [];
    for (const c of v.connections ?? []) {
      if (!c?.id) continue;
      if (c.relationshipId) {
        nextConnections.push(c);
        continue;
      }

      const refRaw = getConnRefRaw(c);
      const relCands = candidateConnRelValues(refRaw);
      const srcCands = candidateConnEndpointValues(refRaw, EA_CONN_SRC_KEYS_PRIORITY);
      const tgtCands = candidateConnEndpointValues(refRaw, EA_CONN_TGT_KEYS_PRIORITY);

      const resolveEndpoint = (cands: string[]): { elementId?: IRId; nodeId?: string; used?: string } => {
        for (const cand of cands) {
          for (const tok of normalizeRefToken(cand)) {
            const byNode = nodeToElement.get(tok);
            if (byNode) return { elementId: byNode, nodeId: tok, used: cand };
            const byEl = elementLookup.get(tok);
            if (byEl) return { elementId: byEl, used: cand };
          }
        }
        return {};
      };

      const src = resolveEndpoint(srcCands);
      const tgt = resolveEndpoint(tgtCands);

      let relationshipId: IRId | undefined;
      let resolvedFrom: string | undefined;

      for (const cand of relCands) {
        for (const tok of normalizeRefToken(cand)) {
          const hit = relationshipLookup.get(tok);
          if (hit) {
            relationshipId = hit;
            resolvedFrom = cand;
            break;
          }
        }
        if (relationshipId) break;
      }

      if (!relationshipId && src.elementId && tgt.elementId) {
        const m = matchRelationshipByEndpoints(relationships, src.elementId, tgt.elementId);
        if (m.ambiguous) {
          warn(opts, 'EA XMI Normalize: View connection matched multiple relationships; skipped.', {
            code: 'ea-xmi:view-connection-ambiguous-relationship',
            context: { viewId: v.id, viewName: v.name, connectionId: c.id, sourceElementId: src.elementId, targetElementId: tgt.elementId }
          });
          continue;
        }
        if (m.relationshipId) {
          relationshipId = m.relationshipId;
          resolvedFrom = 'endpoints';
        }
      }

      if (!relationshipId) {
        warn(opts, 'EA XMI Normalize: Could not resolve relationship for a view connection; skipped.', {
          code: 'ea-xmi:view-connection-unresolved-relationship',
          context: {
            viewId: v.id,
            viewName: v.name,
            connectionId: c.id,
            relCandidates: relCands.slice(0, 5),
            sourceCandidates: srcCands.slice(0, 5),
            targetCandidates: tgtCands.slice(0, 5)
          }
        });
        continue;
      }

      nextConnections.push({
        ...c,
        relationshipId,
        ...(src.nodeId ? { sourceNodeId: src.nodeId } : {}),
        ...(tgt.nodeId ? { targetNodeId: tgt.nodeId } : {}),
        ...(src.elementId ? { sourceElementId: src.elementId } : {}),
        ...(tgt.elementId ? { targetElementId: tgt.elementId } : {}),
        meta: {
          ...(c.meta && typeof c.meta === 'object' ? (c.meta as Record<string, unknown>) : {}),
          ...(resolvedFrom ? { resolvedFrom } : {}),
          ...(src.used ? { resolvedSourceFrom: src.used } : {}),
          ...(tgt.used ? { resolvedTargetFrom: tgt.used } : {})
        }
      });
    }

    return {
      ...v,
      ...(folderId !== undefined ? { folderId } : {}),
      nodes: nextNodes,
      connections: nextConnections
    };
  });
}


// --- Step 5C (BPMN): Apply Pool/Lane containment based on geometry ---

type Rect = { l: number; t: number; r: number; b: number; area: number; nodeId: string };

type TypedNode = {
  node: IRViewNode;
  idx: number;
  typeId: string;
  rect: Rect;
};

function rectFromBounds(nodeId: string, b: { x: number; y: number; width: number; height: number }): Rect {
  const l = b.x;
  const t = b.y;
  const r = b.x + b.width;
  const bb = b.y + b.height;
  const area = Math.max(0, b.width) * Math.max(0, b.height);
  return { l, t, r, b: bb, area, nodeId };
}

function rectContains(outer: Rect, inner: Rect, tol = 0): boolean {
  return outer.l - tol <= inner.l && outer.t - tol <= inner.t && outer.r + tol >= inner.r && outer.b + tol >= inner.b;
}

function pickSmallestContainer(child: Rect, containers: Rect[]): Rect | undefined {
  let best: Rect | undefined;
  for (const c of containers) {
    if (!rectContains(c, child, 0)) continue;
    if (!best || c.area < best.area) best = c;
  }
  return best;
}

function applyBpmnContainmentToViews(views: IRView[] | undefined, elements: { id: IRId; type: unknown }[]): IRView[] | undefined {
  if (!views) return views;

  const elTypeById = new Map<IRId, string>();
  for (const e of elements) {
    if (!e?.id) continue;
    if (typeof e.type === 'string' && e.type.trim()) elTypeById.set(e.id, e.type);
  }

  return views.map((v) => {
    const nodes = v.nodes ?? [];

    const typed: TypedNode[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      if (!n?.id || !n.elementId || !n.bounds) continue;
      const t = elTypeById.get(n.elementId);
      if (!t) continue;
      typed.push({ node: n, idx: i, typeId: t, rect: rectFromBounds(n.id, n.bounds) });
    }

    const hasBpmnContainers = typed.some((x) => x.typeId === 'bpmn.pool' || x.typeId === 'bpmn.lane');
    if (!hasBpmnContainers) return v;

    const pools = typed.filter((x) => x.typeId === 'bpmn.pool').map((x) => x.rect);
    const lanes = typed.filter((x) => x.typeId === 'bpmn.lane').map((x) => x.rect);

    const parentByNodeId = new Map<string, IRId | null>();

    // Lanes belong to the smallest pool that fully contains them.
    for (const x of typed) {
      if (x.typeId !== 'bpmn.lane') continue;
      const p = pickSmallestContainer(x.rect, pools);
      if (p) parentByNodeId.set(x.node.id, p.nodeId);
    }

    // Other BPMN nodes belong to the smallest lane that contains them; otherwise the smallest pool.
    for (const x of typed) {
      if (!x.typeId.startsWith('bpmn.')) continue;
      if (x.typeId === 'bpmn.pool' || x.typeId === 'bpmn.lane') continue;

      const l = pickSmallestContainer(x.rect, lanes);
      if (l) {
        parentByNodeId.set(x.node.id, l.nodeId);
        continue;
      }

      const p = pickSmallestContainer(x.rect, pools);
      if (p) parentByNodeId.set(x.node.id, p.nodeId);
    }

    const nextNodes = nodes.map((n) => {
      if (!n?.id) return n;
      if (!parentByNodeId.has(n.id)) return n;
      return { ...n, parentNodeId: parentByNodeId.get(n.id) };
    });

    // Stable ordering: containers first (pool, lane), then BPMN nodes, then the rest.
    const rank = (n: IRViewNode): number => {
      const t = n.elementId ? elTypeById.get(n.elementId) : undefined;
      if (t === 'bpmn.pool') return 0;
      if (t === 'bpmn.lane') return 1;
      if (t && t.startsWith('bpmn.')) return 2;
      return 3;
    };

    const sorted = nextNodes
      .map((n, i) => ({ n, i }))
      .sort((a, b) => {
        const ra = rank(a.n);
        const rb = rank(b.n);
        if (ra !== rb) return ra - rb;
        return a.i - b.i;
      })
      .map((x) => x.n);

    return { ...v, nodes: sorted };
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
      info(
        opts,
        'EA XMI Normalize: Element referenced missing folderId; moved to root. (EA export may omit package metadata.)',
        { code: 'missing-folder', context: { elementId: e.id, folderId } }
      );
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

  // Step B2 + B2b: resolve diagram nodes and connections into finalized views.
  const elementLookup = buildElementLookup(elements);
  const relationshipLookup = buildRelationshipLookup(relationships);
  const viewsResolved = resolveEaXmiViews(ir.views, folderIds, elementLookup, relationshipLookup, relationships, opts);
  const views = applyBpmnContainmentToViews(viewsResolved, elements);

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
