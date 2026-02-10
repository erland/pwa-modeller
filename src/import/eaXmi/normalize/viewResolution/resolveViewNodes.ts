import type { IRId, IRViewNode } from '../../../framework/ir';
import type { NormalizeEaXmiOptions } from '../normalizeEaXmiShared';
import { warn } from '../normalizeEaXmiShared';
import { normalizeRefToken } from './refTokens';

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

export function resolveViewNodes(
  view: { id: string; name?: string; nodes?: IRViewNode[] },
  elementLookup: Map<string, IRId>,
  relationshipLookup: Map<string, IRId>,
  opts?: NormalizeEaXmiOptions
): {
  nodes: IRViewNode[];
  nodeKeyToElement: Map<string, IRId>;
  nodeKeyToRefCandidates: Map<string, string[]>;
} {
  const looksLikeRelationshipRef = (candidates: string[]): boolean => {
    for (const cand of candidates) {
      for (const tok of normalizeRefToken(cand)) {
        if (relationshipLookup.has(tok)) return true;
      }
    }
    return false;
  };

  const nextNodes: IRViewNode[] = [];

  for (const n of view.nodes ?? []) {
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
          context: { viewId: view.id, viewName: view.name, nodeId: n.id, refCandidates: candidates.slice(0, 5) }
        });
      } else {
        warn(opts, 'EA XMI Normalize: View node had no resolvable reference; skipped node.', {
          code: 'ea-xmi:view-node-missing-ref',
          context: { viewId: view.id, viewName: view.name, nodeId: n.id }
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

  // Map diagram-object ids (including DUIDs/externalIds) to resolved element ids.
  const nodeKeyToElement = new Map<string, IRId>();
  const addNodeKey = (key: string, elId: IRId): void => {
    for (const v of normalizeRefToken(key)) nodeKeyToElement.set(v, elId);
  };

  for (const n of nextNodes) {
    if (!n?.elementId) continue;
    if (n.id) addNodeKey(n.id, n.elementId);
    for (const ex of n.externalIds ?? []) {
      if (ex?.id) addNodeKey(ex.id, n.elementId);
    }
  }

  // Some EA connector endpoints reference diagram-object ids (DUIDs) whose element reference is stored
  // on the diagram object record rather than on the connection record.
  const nodeKeyToRefCandidates = new Map<string, string[]>();
  const addNodeRefKey = (key: string, cands: string[]): void => {
    for (const v of normalizeRefToken(key)) nodeKeyToRefCandidates.set(v, cands);
  };

  for (const n of nextNodes) {
    const refRaw = getRefRaw(n);
    const cands = candidateRefValues(refRaw);
    if (!cands.length) continue;
    if (n.id) addNodeRefKey(n.id, cands);
    for (const ex of n.externalIds ?? []) {
      if (ex?.id) addNodeRefKey(ex.id, cands);
    }
  }

  return { nodes: nextNodes, nodeKeyToElement, nodeKeyToRefCandidates };
}
