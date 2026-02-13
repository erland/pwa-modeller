import type { ArchimateLayer } from '../../types';
import type { LayoutNodeInput, LayoutOutput } from '../types';

export type ArchiMateBandOptions = {
  /** Minimum horizontal gap between nodes within the same band (in px). */
  minGap?: number;
  /** Vertical gap between bands (in px). */
  bandGap?: number;
  /** Grid size used for snapping band Y positions. */
  grid?: number;
  /** Nodes that must not be moved (e.g., locked nodes). */
  fixedIds?: ReadonlySet<string>;
};

type BandId = 'Business' | 'Application' | 'Technology' | 'Other';

function bandForLayer(layer: ArchimateLayer | undefined): BandId {
  switch (layer) {
    case 'Business':
      return 'Business';
    case 'Application':
      return 'Application';
    case 'Technology':
      return 'Technology';
    default:
      return 'Other';
  }
}

function snap(v: number, grid: number): number {
  if (grid <= 1) return v;
  return Math.round(v / grid) * grid;
}

/**
 * Apply simple ArchiMate layer "bands" (Business/Application/Technology) to an existing
 * flat layout by normalizing each node's Y coordinate into a small number of rows.
 *
 * Notes:
 * - This is intentionally lightweight and deterministic.
 * - It does NOT attempt full packing; it pairs well with `nudgeOverlaps()`, which only shifts X.
 * - Fixed nodes are left untouched.
 */
export function applyArchiMateLayerBands(
  nodes: ReadonlyArray<LayoutNodeInput>,
  positions: LayoutOutput['positions'],
  options: ArchiMateBandOptions = {}
): LayoutOutput['positions'] {
  const bandGap = options.bandGap ?? 90;
  const minGap = options.minGap ?? 80;
  const grid = options.grid ?? 10;
  const fixedIds = options.fixedIds ?? new Set<string>();

  // Only consider nodes with positions.
  const present = nodes.filter((n) => Boolean(positions[n.id]));

  // Group nodes by band.
  const byBand: Record<BandId, LayoutNodeInput[]> = {
    Business: [],
    Application: [],
    Technology: [],
    Other: [],
  };
  for (const n of present) {
    byBand[bandForLayer(n.layerHint as ArchimateLayer | undefined)].push(n);
  }

  // Determine a stable band order.
  const order: BandId[] = ['Business', 'Application', 'Technology', 'Other'];

  // Compute a reasonable row height per band (max node height + padding).
  const rowHeightByBand: Record<BandId, number> = {
    Business: 0,
    Application: 0,
    Technology: 0,
    Other: 0,
  };
  for (const band of order) {
    const maxH = byBand[band].reduce((m, n) => Math.max(m, Math.max(1, n.height ?? 1)), 0);
    // A little breathing room makes text-heavy elements more readable.
    rowHeightByBand[band] = Math.max(120, maxH + 60);
  }

  // Establish band start Y positions.
  const yStartByBand: Record<BandId, number> = {
    Business: 0,
    Application: 0,
    Technology: 0,
    Other: 0,
  };
  let yCursor = 0;
  for (const band of order) {
    yStartByBand[band] = snap(yCursor, grid);
    yCursor += rowHeightByBand[band] + bandGap;
  }

  // Apply y normalization. Keep X as-is.
  const out: LayoutOutput['positions'] = { ...positions };
  for (const band of order) {
    const yBand = yStartByBand[band];
    for (const n of byBand[band]) {
      if (fixedIds.has(n.id)) continue;
      const p = out[n.id];
      if (!p) continue;
      out[n.id] = { x: p.x, y: yBand };
    }
  }


  // Enforce a simple minimum horizontal gap within each band so the orthogonal router
  // can find clear "channels" between neighboring nodes. This is intentionally
  // lightweight: it only shifts nodes to the right, and never moves fixed nodes.
  for (const band of order) {
    const nodesInBand = byBand[band]
      .slice()
      .sort((a, b) => (out[a.id]?.x ?? 0) - (out[b.id]?.x ?? 0));

    let prevRight = -Infinity;
    for (const n of nodesInBand) {
      const p = out[n.id];
      if (!p) continue;
      const w = Math.max(1, n.width ?? 1);

      if (fixedIds.has(n.id)) {
        prevRight = Math.max(prevRight, p.x + w);
        continue;
      }

      const desiredX = prevRight === -Infinity ? p.x : Math.max(p.x, prevRight + minGap);
      if (desiredX !== p.x) {
        out[n.id] = { x: desiredX, y: p.y };
      }
      prevRight = (out[n.id]?.x ?? p.x) + w;
    }
  }

  return out;
}
