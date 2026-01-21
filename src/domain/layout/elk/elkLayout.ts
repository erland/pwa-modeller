import ELK from 'elkjs/lib/elk.bundled.js';
import type { AutoLayoutOptions, LayoutDirection, LayoutInput, LayoutOutput } from '../types';

type ElkNode = {
  id: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  children?: ElkNode[];
  edges?: ElkEdge[];
  layoutOptions?: Record<string, string>;
};

type ElkEdge = {
  id: string;
  sources: string[];
  targets: string[];
  layoutOptions?: Record<string, string>;
};

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
  const spacing = options.spacing ?? 80;

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
      'elk.algorithm': 'layered',
      'elk.direction': directionToElk(options.direction),
      'elk.edgeRouting': edgeRoutingToElk(options.edgeRouting),
      // General spacing between nodes.
      'elk.spacing.nodeNode': String(spacing),
      // Spacing between layers in layered layouts.
      'elk.layered.spacing.nodeNodeBetweenLayers': String(spacing),
      // A bit of breathing room so labels/handles don't feel cramped.
      'elk.spacing.edgeNode': String(Math.max(20, Math.floor(spacing / 3))),
      'elk.spacing.edgeEdge': String(Math.max(10, Math.floor(spacing / 4))),
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: n.width,
      height: n.height,
    })),
    edges: edges.map((e, i) => ({
      id: `e${i}`,
      sources: [e.sourceId],
      targets: [e.targetId],
      layoutOptions: e.weight != null ? { 'elk.layered.priority': String(e.weight) } : undefined,
    })),
  };

  const elk = new (ELK as any)();
  const laidOut: ElkNode = await elk.layout(root);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const child of laidOut.children ?? []) {
    positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
  }

  return { positions };
}
