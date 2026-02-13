import ELK from 'elkjs/lib/elk.bundled.js';
import type { AutoLayoutOptions, LayoutDirection, LayoutInput, LayoutOutput } from '../types';
import { simpleRadialLayout } from '../radial/simpleRadialLayout';
import { buildElkRootOptions } from './presetElkOptions';

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
};

type ElkPort = {
  id: string;
  layoutOptions?: Record<string, string>;
};

type ElkApi = {
  layout: (graph: ElkNode) => Promise<ElkNode>;
};

type ElkCtor = new () => ElkApi;

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

function directionToElk(direction: LayoutDirection | undefined): 'RIGHT' | 'DOWN' {
  return direction === 'DOWN' ? 'DOWN' : 'RIGHT';
}

function edgeRoutingToElk(edgeRouting: AutoLayoutOptions['edgeRouting']): 'POLYLINE' | 'ORTHOGONAL' {
  return edgeRouting === 'ORTHOGONAL' ? 'ORTHOGONAL' : 'POLYLINE';
}

/**
 * Run ELK layered layout on the given input graph and return a map of node positions.
 *
 * Notes:
 * - This adapter intentionally stays pure (no store/model access).
 * - "locked" nodes are not enforced at this stage; handle that in a post-pass if needed.
 */
export async function elkLayout(input: LayoutInput, options: AutoLayoutOptions = {}): Promise<LayoutOutput> {
  // ELK radial is unstable in the current elkjs bundle (can cause stack overflows).
  // Use a minimal deterministic radial layout instead.
  if (options.preset === 'radial') {
    return simpleRadialLayout(input, options);
  }

  const spacing = options.spacing ?? 80;

  const rootOptions = buildElkRootOptions(spacing, options, { hierarchical: false, hasHierarchy: false });

  // Keep ordering stable for deterministic results.
  const nodes = [...input.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...input.edges].sort((a, b) => {
    const s = a.sourceId.localeCompare(b.sourceId);
    if (s !== 0) return s;
    const t = a.targetId.localeCompare(b.targetId);
    if (t !== 0) return t;
    return (b.weight ?? 0) - (a.weight ?? 0);
  });

  const root: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.direction': directionToElk(options.direction),
      'elk.edgeRouting': edgeRoutingToElk(options.edgeRouting),
      ...rootOptions.layoutOptions,
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: n.width,
      height: n.height,
      ...(n.ports?.length
        ? {
            // Encourage ELK to respect our port side hints.
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
    })),
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
  for (const child of laidOut.children ?? []) {
    positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
  }

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
