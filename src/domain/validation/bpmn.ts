import type { Model, ViewNodeLayout } from '../types';
import { BPMN_ELEMENT_TYPES, BPMN_RELATIONSHIP_TYPES } from '../config/catalog';
import { kindFromTypeId } from '../kindFromTypeId';
import { makeIssue } from './issues';
import type { ValidationIssue } from './types';

type Rect = { x: number; y: number; w: number; h: number; elementId: string };

function rectForNode(node: ViewNodeLayout): Rect {
  return {
    x: node.x,
    y: node.y,
    w: node.width ?? 120,
    h: node.height ?? 60,
    elementId: node.elementId!,
  };
}

function centerOf(r: Rect): { cx: number; cy: number } {
  return { cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
}

function contains(r: Rect, cx: number, cy: number): boolean {
  return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
}

function pickSmallestContaining(rs: Rect[], cx: number, cy: number): Rect | null {
  let best: Rect | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const r of rs) {
    if (!contains(r, cx, cy)) continue;
    const area = r.w * r.h;
    if (area < bestArea) {
      best = r;
      bestArea = area;
    }
  }
  return best;
}

function nodeForElementInView(nodes: ViewNodeLayout[], elementId: string): ViewNodeLayout | undefined {
  return nodes.find((n) => n.elementId === elementId);
}

function poolOfElementInView(args: {
  model: Model;
  viewId: string;
  elementId: string;
  poolRects: Rect[];
}): string | null {
  const view = args.model.views[args.viewId];
  const nodes = view?.layout?.nodes;
  if (!nodes) return null;

  const el = args.model.elements[args.elementId];
  if (!el) return null;
  if (el.type === 'bpmn.pool') return args.elementId;

  const n = nodeForElementInView(nodes, args.elementId);
  if (!n?.elementId) return null;
  const r = rectForNode(n);
  const { cx, cy } = centerOf(r);
  const pool = pickSmallestContaining(args.poolRects, cx, cy);
  return pool?.elementId ?? null;
}

function firstBpmnViewWithBothEndpoints(model: Model, a: string, b: string): string | null {
  for (const v of Object.values(model.views)) {
    if (v.kind !== 'bpmn') continue;
    const nodes = v.layout?.nodes;
    if (!nodes) continue;
    const hasA = nodes.some((n) => n.elementId === a);
    const hasB = nodes.some((n) => n.elementId === b);
    if (hasA && hasB) return v.id;
  }
  return null;
}

/**
 * Minimal BPMN validation (v1 + v2).
 *
 * - Detect unknown BPMN element/relationship types
 * - Ensure Sequence Flow connects BPMN flow nodes (not pools/lanes)
 * - v2: best-effort pools/lanes containment checks (per BPMN view)
 * - v2: best-effort cross-pool rules for Sequence Flow / Message Flow (when endpoints exist in same BPMN view)
 */
export function validateBpmnBasics(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const allowedElements = new Set(BPMN_ELEMENT_TYPES);
  const allowedRelationships = new Set(BPMN_RELATIONSHIP_TYPES);

  // ------------------------------
  // Unknown BPMN element/relationship types
  // ------------------------------
  for (const el of Object.values(model.elements)) {
    const kind = el.kind ?? kindFromTypeId(el.type);
    if (kind !== 'bpmn') continue;
    if (el.type !== 'Unknown' && !allowedElements.has(el.type)) {
      issues.push(
        makeIssue(
          'warning',
          `BPMN element ${el.id} has unknown type: ${el.type}`,
          { kind: 'element', elementId: el.id },
          `bpmn-el-unknown-type:${el.id}`
        )
      );
    }
  }

  for (const rel of Object.values(model.relationships)) {
    const kind = rel.kind ?? kindFromTypeId(rel.type);
    if (kind !== 'bpmn') continue;
    if (rel.type !== 'Unknown' && !allowedRelationships.has(rel.type)) {
      issues.push(
        makeIssue(
          'warning',
          `BPMN relationship ${rel.id} has unknown type: ${rel.type}`,
          { kind: 'relationship', relationshipId: rel.id },
          `bpmn-rel-unknown-type:${rel.id}`
        )
      );
    }
  }

  // ------------------------------
  // v2: Pools/Lanes as containers (per BPMN view)
  // ------------------------------
  for (const view of Object.values(model.views)) {
    if (view.kind !== 'bpmn') continue;
    const nodes = view.layout?.nodes;
    if (!nodes?.length) continue;

    const poolRects: Rect[] = [];
    const laneRects: Rect[] = [];

    for (const n of nodes) {
      if (!n.elementId) continue;
      const el = model.elements[n.elementId];
      if (!el) continue;
      if (el.type === 'bpmn.pool') poolRects.push(rectForNode(n));
      if (el.type === 'bpmn.lane') laneRects.push(rectForNode(n));
    }

    if (!poolRects.length && !laneRects.length) continue;

    // Lanes should sit inside a Pool.
    for (const lane of laneRects) {
      const { cx, cy } = centerOf(lane);
      const pool = pickSmallestContaining(poolRects, cx, cy);
      if (!pool) {
        issues.push(
          makeIssue(
            'warning',
            `Lane should be inside a Pool in BPMN view "${view.name}".`,
            { kind: 'viewNode', viewId: view.id, elementId: lane.elementId },
            `bpmn-lane-not-in-pool:${view.id}:${lane.elementId}`
          )
        );
      }
    }

    // BPMN elements should be inside a Pool (and inside a Lane if lanes exist in that pool).
    for (const n of nodes) {
      if (!n.elementId) continue;
      const el = model.elements[n.elementId];
      if (!el) continue;
      const kind = el.kind ?? kindFromTypeId(el.type);
      if (kind !== 'bpmn') continue;
      if (el.type === 'bpmn.pool' || el.type === 'bpmn.lane') continue;

      const r = rectForNode(n);
      const { cx, cy } = centerOf(r);
      const pool = pickSmallestContaining(poolRects, cx, cy);
      if (poolRects.length && !pool) {
        issues.push(
          makeIssue(
            'warning',
            `BPMN element should be placed inside a Pool in view "${view.name}".`,
            { kind: 'viewNode', viewId: view.id, elementId: n.elementId },
            `bpmn-el-not-in-pool:${view.id}:${n.elementId}`
          )
        );
        continue;
      }

      if (pool && laneRects.length) {
        // If lanes exist, require the element to be within at least one lane.
        const lane = pickSmallestContaining(laneRects, cx, cy);
        if (!lane) {
          issues.push(
            makeIssue(
              'warning',
              `BPMN element should be placed inside a Lane (lanes exist in view "${view.name}").`,
              { kind: 'viewNode', viewId: view.id, elementId: n.elementId },
              `bpmn-el-not-in-lane:${view.id}:${n.elementId}`
            )
          );
        }
      }
    }
  }

  // ------------------------------
  // Relationship rules
  // ------------------------------
  for (const rel of Object.values(model.relationships)) {
    if (rel.type !== 'bpmn.sequenceFlow' && rel.type !== 'bpmn.messageFlow') continue;

    const src = rel.sourceElementId ? model.elements[rel.sourceElementId] : undefined;
    const tgt = rel.targetElementId ? model.elements[rel.targetElementId] : undefined;

    if (!src || !tgt) {
      issues.push(
        makeIssue(
          'warning',
          `BPMN relationship ${rel.id} must have both source and target set.`,
          { kind: 'relationship', relationshipId: rel.id },
          `bpmn-rel-missing-endpoints:${rel.id}`
        )
      );
      continue;
    }

    const srcKind = src.kind ?? kindFromTypeId(src.type);
    const tgtKind = tgt.kind ?? kindFromTypeId(tgt.type);

    if (srcKind !== 'bpmn' || tgtKind !== 'bpmn') {
      issues.push(
        makeIssue(
          'error',
          `BPMN relationship ${rel.id} must connect two BPMN elements.`,
          { kind: 'relationship', relationshipId: rel.id },
          `bpmn-rel-nonbpmn-endpoint:${rel.id}`
        )
      );
      continue;
    }

    if (rel.type === 'bpmn.sequenceFlow') {
      if (src.type === 'bpmn.pool' || src.type === 'bpmn.lane' || tgt.type === 'bpmn.pool' || tgt.type === 'bpmn.lane') {
        issues.push(
          makeIssue(
            'error',
            `Sequence Flow ${rel.id} cannot connect to Pools/Lanes.`,
            { kind: 'relationship', relationshipId: rel.id },
            `bpmn-seqflow-container-endpoint:${rel.id}`
          )
        );
      }

      const viewId = firstBpmnViewWithBothEndpoints(model, src.id, tgt.id);
      if (viewId) {
        const view = model.views[viewId];
        const poolRects: Rect[] = [];
        for (const n of view.layout?.nodes ?? []) {
          if (!n.elementId) continue;
          const el = model.elements[n.elementId];
          if (el?.type === 'bpmn.pool') poolRects.push(rectForNode(n));
        }

        if (poolRects.length) {
          const sp = poolOfElementInView({ model, viewId, elementId: src.id, poolRects });
          const tp = poolOfElementInView({ model, viewId, elementId: tgt.id, poolRects });
          if (sp && tp && sp !== tp) {
            issues.push(
              makeIssue(
                'error',
                `Sequence Flow ${rel.id} cannot cross Pool boundaries in view "${view.name}".`,
                { kind: 'relationship', relationshipId: rel.id },
                `bpmn-seqflow-cross-pool:${viewId}:${rel.id}`
              )
            );
          }
        }
      }
    }

    if (rel.type === 'bpmn.messageFlow') {
      if (src.type === 'bpmn.lane' || tgt.type === 'bpmn.lane') {
        issues.push(
          makeIssue(
            'error',
            `Message Flow ${rel.id} cannot connect to a Lane directly.`,
            { kind: 'relationship', relationshipId: rel.id },
            `bpmn-msgflow-lane-endpoint:${rel.id}`
          )
        );
      }

      const viewId = firstBpmnViewWithBothEndpoints(model, src.id, tgt.id);
      if (viewId) {
        const view = model.views[viewId];
        const poolRects: Rect[] = [];
        for (const n of view.layout?.nodes ?? []) {
          if (!n.elementId) continue;
          const el = model.elements[n.elementId];
          if (el?.type === 'bpmn.pool') poolRects.push(rectForNode(n));
        }

        if (poolRects.length) {
          const sp = poolOfElementInView({ model, viewId, elementId: src.id, poolRects });
          const tp = poolOfElementInView({ model, viewId, elementId: tgt.id, poolRects });
          if (sp && tp) {
            if (sp === tp) {
              issues.push(
                makeIssue(
                  'error',
                  `Message Flow ${rel.id} should connect different Pools/Participants (view "${view.name}").`,
                  { kind: 'relationship', relationshipId: rel.id },
                  `bpmn-msgflow-same-pool:${viewId}:${rel.id}`
                )
              );
            }
          } else {
            issues.push(
              makeIssue(
                'warning',
                `Message Flow ${rel.id} should be used between Pools; place endpoints inside Pools in view "${view.name}".`,
                { kind: 'relationship', relationshipId: rel.id },
                `bpmn-msgflow-missing-pool:${viewId}:${rel.id}`
              )
            );
          }
        } else {
          issues.push(
            makeIssue(
              'warning',
              `Message Flow ${rel.id} is best used between Pools; no Pools found in view "${view.name}".`,
              { kind: 'relationship', relationshipId: rel.id },
              `bpmn-msgflow-no-pools:${viewId}:${rel.id}`
            )
          );
        }
      }
    }
  }

  return issues;
}
