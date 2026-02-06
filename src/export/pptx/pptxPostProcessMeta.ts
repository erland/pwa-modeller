export type PptxEmuRect = { x: number; y: number; cx: number; cy: number };
export type PptxInchRect = { x: number; y: number; w: number; h: number };

export type PptxNodeMeta = {
  elementId: string;
  rectIn: PptxInchRect;
};

export type PptxEdgeMeta = {
  edgeId: string;
  relType?: string;
  dashed?: boolean;
  // Preferred endpoints in inches (slide coordinates) if available.
  x1In: number;
  y1In: number;
  x2In: number;
  y2In: number;
  // Bounds of placeholder line shape (as created by PptxGenJS).
  rectIn: PptxInchRect;
};

export type PptxPostProcessMeta = {
  nodes: PptxNodeMeta[];
  edges: PptxEdgeMeta[];
};

export const EMU_PER_INCH = 914400;
export function inchToEmu(v: number): number {
  return Math.round(v * EMU_PER_INCH);
}
