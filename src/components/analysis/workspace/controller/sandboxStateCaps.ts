import type { SandboxNode } from './sandboxTypes';

export function uniqByElementId(nodes: SandboxNode[]): SandboxNode[] {
  const seen = new Set<string>();
  const out: SandboxNode[] = [];
  for (const n of nodes) {
    if (seen.has(n.elementId)) continue;
    seen.add(n.elementId);
    out.push(n);
  }
  return out;
}

export function applyNodeCap(args: {
  prev: SandboxNode[];
  toAdd: SandboxNode[];
  maxNodes: number;
}): { next: SandboxNode[]; dropped: number } {
  const { prev, toAdd, maxNodes } = args;
  const merged = uniqByElementId([...prev, ...toAdd]);
  if (merged.length <= maxNodes) return { next: merged, dropped: 0 };
  const next = merged.slice(0, maxNodes);
  return { next, dropped: merged.length - next.length };
}
