export type MiniColumnGraphTooltip = { title: string; lines: string[] };

export type MiniColumnGraphNode = {
  id: string;
  label: string;
  /** Column index (0 = left-most). */
  level: number;
  /** Optional explicit vertical ordering inside a column. If omitted, nodes are sorted by label. */
  order?: number;
  /** Optional background fill (CSS color or var). */
  bg?: string;
  /** Optional overlay badge (e.g., node degree). */
  badge?: string;
  /** Optional per-node size scale (e.g., based on score). Clamp to a small range like 0.85–1.25. */
  sizeScale?: number;
  /** UI-only: hidden nodes are not rendered. */
  hidden?: boolean;
};

export type MiniColumnGraphEdge = {
  id: string;
  from: string;
  to: string;
  /** UI-only: hidden edges are kept but not rendered. */
  hidden?: boolean;
};
