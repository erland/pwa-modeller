import ELK from 'elkjs/lib/elk.bundled.js';

import type { AutoLayoutOptions, LayoutDirection, LayoutInput, LayoutOutput } from '../types';

type ElkNode = {
  id: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  children?: ElkNode[];
  ports?: ElkPort[];
  edges?: ElkEdge[];
  layoutOptions?: Record<string, string>;
  sections?: ElkSection[];
};

type ElkPort = {
  id: string;
  layoutOptions?: Record<string, string>;
};

type ElkPoint = { x: number; y: number };

type ElkSection = {
  startPoint?: ElkPoint;
  endPoint?: ElkPoint;
  bendPoints?: ElkPoint[];
};

type ElkEdge = {
  id: string;
  sources: string[];
  targets: string[];
  layoutOptions?: Record<string, string>;
  /** Edge routing data returned by ELK (present on layout output). */
  sections?: ElkSection[];
};

function sideToElk(side: 'N' | 'E' | 'S' | 'W'): 'NORTH' | 'EAST' | 'SOUTH' | 'WEST' {
  switch (side) {
    case 'N':
      return 'NORTH';
    case 'E':
      return 'EAST';
    case 'S':
      return 'SOUTH';
    case 'W':
      return 'WEST';
  }
}

type ElkApi = {
  layout: (graph: ElkNode) => Promise<ElkNode>;
};

type ElkCtor = new () => ElkApi;

function directionToElk(direction: LayoutDirection | undefined): 'RIGHT' | 'DOWN' {
  return direction === 'DOWN' ? 'DOWN' : 'RIGHT';
}

function edgeRoutingToElk(edgeRouting: AutoLayoutOptions['edgeRouting']): 'POLYLINE' | 'ORTHOGONAL' {
  return edgeRouting === 'ORTHOGONAL' ? 'ORTHOGONAL' : 'POLYLINE';
}

/**
 * Hierarchical ELK adapter.
 *
 * This uses `LayoutNode.parentId` to build a nested graph, allowing container-like nodes
 * (e.g., BPMN pools/lanes/subprocesses) to participate in layout.
 *
 * Notes:
 * - Node sizes are taken as-is from the input. If you want containers to grow, compute
 *   suitable sizes *before* calling this.
 * - Edges are attached at the root; ELK will route and account for hierarchy.
 */
export async function elkLayoutHierarchical(input: LayoutInput, options: AutoLayoutOptions = {}): Promise<LayoutOutput> {
  const spacing = options.spacing ?? 80;

  const nodes = [...input.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...input.edges].sort((a, b) => {
    const s = a.sourceId.localeCompare(b.sourceId);
    if (s !== 0) return s;
    const t = a.targetId.localeCompare(b.targetId);
    if (t !== 0) return t;
    return (b.weight ?? 0) - (a.weight ?? 0);
  });

  // Build child lists.
  const childrenByParent = new Map<string, string[]>();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    if (!n.parentId) continue;
    if (!nodeById.has(n.parentId)) continue;
    const list = childrenByParent.get(n.parentId) ?? [];
    list.push(n.id);
    childrenByParent.set(n.parentId, list);
  }

  const buildNode = (id: string): ElkNode => {
    const n = nodeById.get(id);
    const childIds = childrenByParent.get(id) ?? [];
    return {
      id,
      width: n?.width,
      height: n?.height,
      // Give containers some padding so children don't touch the border.
      ...(childIds.length
        ? {
            layoutOptions: {
              // Standard ELK padding syntax.
              'elk.padding': '[top=40,left=40,bottom=40,right=40]',
            },
            children: childIds.sort((a, b) => a.localeCompare(b)).map(buildNode),
          }
        : {
            ...(n?.ports?.length
              ? {
                  layoutOptions: { 'elk.portConstraints': 'FIXED_SIDE' },
                  ports: n.ports.map((p) => ({
                    id: p.id,
                    ...(p.side
                      ? {
                          layoutOptions: {
                            'elk.port.side': sideToElk(p.side),
                          },
                        }
                      : {}),
                  })),
                }
              : {}),
          }),
    };
  };

  const topLevelIds = nodes.filter((n) => !n.parentId || !nodeById.has(n.parentId)).map((n) => n.id);

  const root: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': directionToElk(options.direction),
      'elk.edgeRouting': edgeRoutingToElk(options.edgeRouting),
      'elk.spacing.nodeNode': String(spacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(spacing),
      'elk.spacing.edgeNode': String(Math.max(20, Math.floor(spacing / 3))),
      'elk.spacing.edgeEdge': String(Math.max(10, Math.floor(spacing / 4))),
    },
    children: topLevelIds.sort((a, b) => a.localeCompare(b)).map(buildNode),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.sourcePortId ?? e.sourceId],
      targets: [e.targetPortId ?? e.targetId],
      layoutOptions: e.weight != null ? { 'elk.layered.priority': String(e.weight) } : undefined,
    })),
  };

  const elk = new (ELK as unknown as ElkCtor)();
  const laidOut: ElkNode = await elk.layout(root);

  const positions: Record<string, { x: number; y: number }> = {};

  const walk = (node: ElkNode, accX: number, accY: number) => {
    // Skip the synthetic root.
    if (node.id !== 'root') {
      const x = (node.x ?? 0) + accX;
      const y = (node.y ?? 0) + accY;
      positions[node.id] = { x, y };
      accX = x;
      accY = y;
    }

    for (const child of node.children ?? []) {
      walk(child, accX, accY);
    }
  };

  walk(laidOut, 0, 0);

  const edgeRoutes: Record<string, { points: Array<{ x: number; y: number }> }> = {};
  for (const e of laidOut.edges ?? []) {
    const sec = (e.sections ?? [])[0];
    if (!sec) continue;
    const pts: Array<{ x: number; y: number }> = [];
    if (sec.startPoint) pts.push({ x: sec.startPoint.x, y: sec.startPoint.y });
    for (const bp of sec.bendPoints ?? []) pts.push({ x: bp.x, y: bp.y });
    if (sec.endPoint) pts.push({ x: sec.endPoint.x, y: sec.endPoint.y });
    if (pts.length >= 2) edgeRoutes[e.id] = { points: pts };
  }

  return { positions, ...(Object.keys(edgeRoutes).length ? { edgeRoutes } : {}) };
}
