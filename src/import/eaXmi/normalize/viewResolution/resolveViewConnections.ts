import type { IRId, IRRelationship, IRViewConnection } from '../../../framework/ir';
import type { NormalizeEaXmiOptions } from '../normalizeEaXmiShared';
import { warn } from '../normalizeEaXmiShared';
import { normalizeRefToken } from './refTokens';

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

export function resolveViewConnections(
  view: { id: string; name?: string; connections?: IRViewConnection[] },
  relationshipLookup: Map<string, IRId>,
  elementLookup: Map<string, IRId>,
  relationships: IRRelationship[],
  nodeKeyToElement: Map<string, IRId>,
  nodeKeyToRefCandidates: Map<string, string[]>,
  opts?: NormalizeEaXmiOptions
): IRViewConnection[] {
  const nextConnections: IRViewConnection[] = [];

  for (const c of view.connections ?? []) {
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
          const byNode = nodeKeyToElement.get(tok);
          if (byNode) return { elementId: byNode, nodeId: tok, used: cand };

          // Fallback: endpoint token might be a diagram-object id. Try to resolve via that object's stored ref.
          const nodeCands = nodeKeyToRefCandidates.get(tok);
          if (nodeCands?.length) {
            for (const nc of nodeCands) {
              for (const nt of normalizeRefToken(nc)) {
                const hit = elementLookup.get(nt);
                if (hit) return { elementId: hit, nodeId: tok, used: cand };
              }
            }
          }

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
          context: {
            viewId: view.id,
            viewName: view.name,
            connectionId: c.id,
            sourceElementId: src.elementId,
            targetElementId: tgt.elementId
          }
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
          viewId: view.id,
          viewName: view.name,
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

  return nextConnections;
}
