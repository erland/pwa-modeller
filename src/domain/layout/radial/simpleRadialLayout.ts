import type { AutoLayoutOptions, LayoutInput, LayoutOutput } from '../types';

type NodeBox = { id: string; w: number; h: number };

/**
 * Simple, deterministic radial layout used as a safe fallback when ELK radial
 * is unstable in the current elkjs bundle (can cause stack overflows).
 *
 * Design goals:
 * - Deterministic output for the same input.
 * - Respect node sizes.
 * - Provide enough separation for the diagram router to find channels.
 * - Keep complexity minimal (no physics iterations).
 */
export function simpleRadialLayout(input: LayoutInput, options: AutoLayoutOptions = {}): LayoutOutput {
  const spacing = options.spacing ?? 80;

  const nodes: NodeBox[] = input.nodes.map((n) => ({
    id: n.id,
    w: Math.max(40, n.width ?? 120),
    h: Math.max(30, n.height ?? 60),
  }));

  // Degree heuristic: higher-degree nodes earlier (more central-ish ordering around the circle).
  const degree: Record<string, number> = {};
  for (const n of nodes) degree[n.id] = 0;
  for (const e of input.edges) {
    degree[e.sourceId] = (degree[e.sourceId] ?? 0) + 1;
    degree[e.targetId] = (degree[e.targetId] ?? 0) + 1;
  }

  nodes.sort((a, b) => {
    const da = degree[a.id] ?? 0;
    const db = degree[b.id] ?? 0;
    if (db !== da) return db - da;
    return a.id.localeCompare(b.id);
  });

  const n = nodes.length;
  if (n === 0) return { positions: {} };

  const maxW = Math.max(...nodes.map((x) => x.w));
  const maxH = Math.max(...nodes.map((x) => x.h));
  const nodeSpan = Math.max(maxW, maxH) + spacing;

  // Choose a radius that roughly fits nodes around the circumference.
  const radius = Math.max(160, Math.ceil((n * nodeSpan) / (2 * Math.PI)));

  // Place nodes around a circle, deterministic start at -90deg (top).
  const positions: Record<string, { x: number; y: number }> = {};
  const cx = 0;
  const cy = 0;

  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    const angle = (-Math.PI / 2) + (i * (2 * Math.PI / n));
    const xCenter = cx + radius * Math.cos(angle);
    const yCenter = cy + radius * Math.sin(angle);
    positions[node.id] = {
      x: Math.round(xCenter - node.w / 2),
      y: Math.round(yCenter - node.h / 2),
    };
  }

  // Normalize to a positive coordinate system with a bit of padding.
  let minX = Infinity;
  let minY = Infinity;
  for (const p of Object.values(positions)) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
  }
  const pad = Math.round(spacing / 2);
  for (const id of Object.keys(positions)) {
    positions[id] = { x: positions[id].x - minX + pad, y: positions[id].y - minY + pad };
  }

  return { positions };
}
