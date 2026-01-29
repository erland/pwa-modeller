import type { AutoLayoutOptions, LayoutInput, LayoutNodeInput, LayoutEdgeInput } from './types';

function fnv1a32(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // 32-bit FNV-1a: h *= 16777619
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function effectiveOptions(options: AutoLayoutOptions): Required<Pick<AutoLayoutOptions, 'direction' | 'spacing' | 'edgeRouting' | 'scope' | 'respectLocked' | 'lockSelection'>> {
  return {
    direction: options.direction ?? 'RIGHT',
    spacing: options.spacing ?? 80,
    edgeRouting: options.edgeRouting ?? 'POLYLINE',
    scope: options.scope ?? 'all',
    respectLocked: Boolean(options.respectLocked),
    lockSelection: Boolean(options.lockSelection)
  };
}

function nodeSig(n: LayoutNodeInput): string {
  const ports = (n.ports ?? [])
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => `${p.id}:${p.side ?? ''}`)
    .join(',');

  return [
    n.id,
    n.width,
    n.height,
    n.parentId ?? '',
    n.locked ? 'L' : '',
    n.kind ?? '',
    n.groupId ?? '',
    n.layerHint ?? '',
    ports
  ].join('|');
}

function edgeSig(e: LayoutEdgeInput): string {
  return [
    e.id,
    e.sourceId,
    e.sourcePortId ?? '',
    e.targetId,
    e.targetPortId ?? '',
    e.weight ?? 0,
    e.kind ?? ''
  ].join('|');
}

/**
 * Produce a deterministic signature for a layout run.
 *
 * Designed to support caching expensive ELK calls for unchanged graphs/options.
 */
export function computeLayoutSignature(params: {
  viewId: string;
  viewKind: string;
  mode: 'flat' | 'hierarchical';
  input: LayoutInput;
  options?: AutoLayoutOptions;
  selectionNodeIds?: string[];
}): string {
  const opt = effectiveOptions(params.options ?? {});
  const selection = (params.selectionNodeIds ?? []).filter(Boolean);
  const selectionDedup = Array.from(new Set(selection)).sort((a, b) => a.localeCompare(b));

  const nodes = [...params.input.nodes].sort((a, b) => a.id.localeCompare(b.id)).map(nodeSig).join('\n');
  const edges = [...params.input.edges]
    .sort((a, b) => {
      const s = a.sourceId.localeCompare(b.sourceId);
      if (s !== 0) return s;
      const t = a.targetId.localeCompare(b.targetId);
      if (t !== 0) return t;
      const aw = a.weight ?? 0;
      const bw = b.weight ?? 0;
      if (aw !== bw) return bw - aw;
      return a.id.localeCompare(b.id);
    })
    .map(edgeSig)
    .join('\n');

  const header = [
    `view=${params.viewId}`,
    `kind=${params.viewKind}`,
    `mode=${params.mode}`,
    `dir=${opt.direction}`,
    `space=${opt.spacing}`,
    `route=${opt.edgeRouting}`,
    `scope=${opt.scope}`,
    `respectLocked=${opt.respectLocked ? 1 : 0}`,
    `lockSelection=${opt.lockSelection ? 1 : 0}`,
    `selection=${selectionDedup.join(',')}`
  ].join('\n');

  const raw = `${header}\n---NODES---\n${nodes}\n---EDGES---\n${edges}`;
  return fnv1a32(raw);
}
