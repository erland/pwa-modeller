import type { ImportReport } from '../importReport';
import { addWarning } from '../importReport';
import type { IRId, IRModel, IRView, IRViewConnection, IRViewNode } from '../framework/ir';

type ResolveOptions = {
  /** Report to write non-fatal diagnostics to. */
  report?: ImportReport;
  /** Label used for warnings (e.g. "MEFF", "BPMN2"). */
  label: string;
};

type Endpoint = { sourceElementId?: IRId; targetElementId?: IRId };

function key(a: string, b: string): string {
  return `${a}→${b}`;
}

function buildRelationshipIndex(relationships: IRModel['relationships']) {
  const direct = new Map<string, IRId[]>();
  for (const r of relationships ?? []) {
    // IR relationships use sourceId/targetId.
    if (!r?.id || !r.sourceId || !r.targetId) continue;
    const k = key(r.sourceId, r.targetId);
    const arr = direct.get(k);
    if (arr) arr.push(r.id);
    else direct.set(k, [r.id]);
  }
  return direct;
}

function nodeById(nodes: IRViewNode[] | undefined): Map<string, IRViewNode> {
  const m = new Map<string, IRViewNode>();
  for (const n of nodes ?? []) {
    if (typeof n?.id === 'string') m.set(n.id, n);
  }
  return m;
}

function inferEndpointsFromNodes(conn: IRViewConnection, nodeMap: Map<string, IRViewNode>): Endpoint {
  const srcNode = conn.sourceNodeId ? nodeMap.get(conn.sourceNodeId) : undefined;
  const tgtNode = conn.targetNodeId ? nodeMap.get(conn.targetNodeId) : undefined;
  const sourceElementId = conn.sourceElementId ?? srcNode?.elementId;
  const targetElementId = conn.targetElementId ?? tgtNode?.elementId;
  return { sourceElementId, targetElementId };
}

/**
 * Best-effort: ensure IR view connections have relationshipId when they clearly represent a model relationship.
 *
 * Why this exists:
 * - Some formats omit relationship refs in diagrams and only provide endpoints.
 * - Without relationshipId, later steps may auto-materialize *all* relationships between endpoints,
 *   leading to duplicates in a view.
 */
export function resolveViewConnectionRelationshipIds(ir: IRModel, opts: ResolveOptions): IRModel {
  const views = ir.views;
  if (!views || views.length === 0) return ir;

  const index = buildRelationshipIndex(ir.relationships);

  const nextViews: IRView[] = views.map((v) => {
    const nm = nodeById(v.nodes);
    let changed = false;

    const nextConnections = (v.connections ?? []).map((c) => {
      if (!c || typeof c.id !== 'string') return c;
      if (c.relationshipId) return c;

      const ep = inferEndpointsFromNodes(c, nm);
      const src = ep.sourceElementId;
      const tgt = ep.targetElementId;
      if (!src || !tgt) return c;

      const directHits = index.get(key(src, tgt)) ?? [];
      const revHits = index.get(key(tgt, src)) ?? [];

      if (directHits.length === 1) {
        changed = true;
        return { ...c, relationshipId: directHits[0]! };
      }

      if (revHits.length === 1) {
        // Diagram edge is reversed relative to relationship direction.
        // Align connection endpoints so rendering arrows match the relationship.
        changed = true;
        return {
          ...c,
          relationshipId: revHits[0]!,
          sourceNodeId: c.targetNodeId,
          targetNodeId: c.sourceNodeId,
          sourceElementId: tgt,
          targetElementId: src,
          meta: { ...(c.meta ?? {}), reversed: true }
        };
      }

      // Ambiguous: multiple relationships between the same endpoints.
      // Leave it unresolved; the caller can decide whether to keep a generic connection or drop it.
      if ((directHits.length + revHits.length) > 1 && opts.report) {
        addWarning(
          opts.report,
          `${opts.label}: Diagram connection "${c.id}" could not be mapped to a single relationship between "${src}" and "${tgt}" (matches: ${directHits.length + revHits.length}).`,
          { code: 'view-connection-ambiguous' }
        );
      }

      return c;
    });

    return changed ? { ...v, connections: nextConnections } : v;
  });

  return { ...ir, views: nextViews };
}
