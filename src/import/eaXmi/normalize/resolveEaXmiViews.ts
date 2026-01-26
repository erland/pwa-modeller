import type {
  IRExternalId,
  IRId,
  IRRelationship,
  IRView,
  IRViewConnection,
  IRViewNode
} from '../../framework/ir';
import { info, warn } from './normalizeEaXmiShared';
import type { NormalizeEaXmiOptions } from './normalizeEaXmiShared';

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

export function buildElementLookup(elements: { id: IRId; externalIds?: IRExternalId[] }[]): Map<string, IRId> {
  const m = new Map<string, IRId>();
  for (const e of elements) {
    if (!e?.id) continue;
    addLookupVariants(m, e.id, e.id);
    addExternalIdVariants(m, e.externalIds, e.id);
  }
  return m;
}

export function buildRelationshipLookup(relationships: { id: IRId; externalIds?: IRExternalId[] }[]): Map<string, IRId> {
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

export function resolveEaXmiViews(
  viewsRaw: IRView[] | undefined,
  folderIds: Set<string>,
  elementLookup: Map<string, IRId>,
  relationshipLookup: Map<string, IRId>,
  relationships: IRRelationship[],
  opts?: NormalizeEaXmiOptions
): IRView[] | undefined {
  if (!viewsRaw) return undefined;

  const looksLikeRelationshipRef = (candidates: string[]): boolean => {
    for (const cand of candidates) {
      for (const tok of normalizeRefToken(cand)) {
        if (relationshipLookup.has(tok)) return true;
      }
    }
    return false;
  };

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
        // EA sometimes includes diagram "objects" for connectors/relationships (lines) that carry a connector GUID.
        // Those are not model elements and should not be imported as view nodes.
        // If the reference looks like a relationship/connector, skip silently to avoid noisy "unresolved element" warnings.
        if (candidates.length && looksLikeRelationshipRef(candidates)) {
          continue;
        }

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
