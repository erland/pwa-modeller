import type { IRId, IRElement, IRRelationship, IRView } from '../../framework/ir';
import type { NormalizeEaXmiOptions } from './normalizeEaXmiShared';
import { info } from './normalizeEaXmiShared';
import { buildElementLookup, buildRelationshipLookup } from './resolveEaXmiViews';

const EA_CONN_REL_KEYS_PRIORITY = [
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
  'href'
] as const;

const EA_CONN_SRC_KEYS_PRIORITY = [
  'source',
  'sourceid',
  'source_id',
  'src',
  'from',
  'start',
  'startid',
  'start_id',
  'object1',
  'client'
] as const;

const EA_CONN_TGT_KEYS_PRIORITY = [
  'target',
  'targetid',
  'target_id',
  'tgt',
  'to',
  'end',
  'endid',
  'end_id',
  'object2',
  'supplier'
] as const;

function normalizeToken(token: string): string[] {
  const t = (token || '').trim();
  if (!t) return [];
  const out = new Set<string>();
  out.add(t);
  const lower = t.toLowerCase();
  out.add(lower);
  // remove {…} if present
  const inner = t.replace(/^\{(.+)\}$/u, '$1');
  if (inner !== t) {
    out.add(inner);
    out.add(inner.toLowerCase());
  }
  return Array.from(out);
}

function pickRefRaw(meta: unknown): Record<string, string> {
  const m = meta && typeof meta === 'object' ? (meta as any) : null;
  const rr = m?.refRaw;
  if (rr && typeof rr === 'object') return rr as Record<string, string>;
  return {};
}

function candidateVals(refRaw: Record<string, string>, keys: readonly string[]): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const v = refRaw[k];
    if (typeof v === 'string' && v.trim() && !out.includes(v.trim())) out.push(v.trim());
  }
  return out;
}

function matchSingleRelationshipByEndpoints(relationships: IRRelationship[], s: IRId, t: IRId): IRId | undefined {
  const hits = relationships.filter((r) => r?.sourceId === s && r?.targetId === t);
  if (hits.length === 1) return hits[0]!.id;
  return undefined;
}

/**
 * Create minimal relationship stubs based on diagram connector references.
 *
 * This is a safety net for older EA exports where connector records exist only in the diagram data
 * (or where relationship parsing is suppressed/partial). Stubs are ONLY created when:
 * - the diagram connection references a concrete relationship id (EAID_* or similar)
 * - we can resolve both endpoints to element ids
 * - the relationship is missing from the current relationship set
 */
export function materializeViewRelationshipStubs(
  views: IRView[] | undefined,
  elements: IRElement[],
  relationships: IRRelationship[],
  opts?: NormalizeEaXmiOptions
): IRRelationship[] {
  if (!views?.length) return relationships;

  const elementLookup = buildElementLookup(elements);
  const relationshipLookup = buildRelationshipLookup(relationships);

  // Build nodeId -> elementId mapping by resolving diagram object refs.
  const nodeToEl = new Map<string, IRId>();
  for (const v of views) {
    for (const n of v.nodes ?? []) {
      if (!n?.id || n.kind !== 'element') continue;
      const rr = pickRefRaw(n.meta);
      const subj = rr['subject'] || rr['element'] || rr['classifier'] || rr['instance'];
      const candidates = [
        subj,
        ...Object.values(rr).filter((x) => typeof x === 'string')
      ].filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
      for (const cand of candidates) {
        for (const tok of normalizeToken(cand)) {
          const hit = elementLookup.get(tok);
          if (hit) {
            nodeToEl.set(n.id, hit);
            break;
          }
        }
        if (nodeToEl.has(n.id)) break;
      }
    }
  }

  const next = [...relationships];
  const added = new Set<string>();

  for (const v of views) {
    for (const c of v.connections ?? []) {
      if (!c?.id || c.relationshipId) continue;
      const rr = pickRefRaw(c.meta);

      const relCands = candidateVals(rr, EA_CONN_REL_KEYS_PRIORITY);
      if (!relCands.length) continue;

      const srcCands = candidateVals(rr, EA_CONN_SRC_KEYS_PRIORITY);
      const tgtCands = candidateVals(rr, EA_CONN_TGT_KEYS_PRIORITY);

      const resolveEndpoint = (cands: string[]): IRId | undefined => {
        for (const cand of cands) {
          for (const tok of normalizeToken(cand)) {
            const byNode = nodeToEl.get(tok);
            if (byNode) return byNode;
            const byEl = elementLookup.get(tok);
            if (byEl) return byEl;
          }
        }
        return undefined;
      };

      const s = resolveEndpoint(srcCands);
      const t = resolveEndpoint(tgtCands);
      if (!s || !t) continue;

      // If there is already exactly one relationship between these endpoints, prefer that over a stub.
      const already = matchSingleRelationshipByEndpoints(relationships, s, t);
      if (already) continue;

      for (const rc of relCands) {
        const rawId = rc.trim();
        if (!rawId) continue;
        const exists = normalizeToken(rawId).some((tok) => relationshipLookup.get(tok));
        if (exists) continue;
        if (added.has(rawId)) continue;

        // Only materialize for EA-ish ids to avoid spamming stubs from generic ref strings.
        if (!/^EAID_/i.test(rawId) && !/^[0-9A-Fa-f]{8,}$/.test(rawId) && !/^[0-9a-f]{8}-/i.test(rawId)) {
          continue;
        }

        next.push({
          id: rawId,
          type: 'uml.dependency',
          sourceId: s,
          targetId: t,
          meta: {
            sourceSystem: 'sparx-ea',
            source: 'diagram-connector-stub',
            stub: true,
            viewId: v.id,
            connectionId: c.id
          }
        });
        added.add(rawId);
      }
    }
  }

  if (added.size) {
    info(opts, `EA XMI Normalize: Materialized ${added.size} relationship stub(s) from diagram connectors.`, {
      code: 'ea-xmi:diagram-relationship-stubs',
      context: { count: added.size }
    });
  }

  return next;
}
