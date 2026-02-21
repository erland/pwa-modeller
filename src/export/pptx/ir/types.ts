/**
 * A notation-agnostic intermediate representation (IR) for rendering a diagram into PPTX.
 *
 * The intent is that multiple producers (e.g. Sandbox analysis graph, Model workspace view)
 * can map their data into this stable format, and a single writer can render it.
 *
 * Coordinates are in PPTX inches (pptxgenjs units).
 */

export type PptxColorHex = string; // "RRGGBB" (no '#') preferred, but writer may accept '#RRGGBB'.

export type PptxTextRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  color?: PptxColorHex;
  fontFace?: string;
};

export type PptxNodeShapeKind = 'roundRect' | 'rect' | 'ellipse' | 'custom';

export type PptxNodeIR = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;

  shape?: PptxNodeShapeKind;

  /**
   * Text content. If multiple runs are provided, the writer can render rich text.
   */
  text?: string;
  textRuns?: PptxTextRun[];

  /** Styling */
  fill?: PptxColorHex;
  stroke?: PptxColorHex;
  strokeWidth?: number;
  textColor?: PptxColorHex;

  /** Optional metadata for post-processing / diagnostics */
  meta?: Record<string, unknown>;
};

export type PptxEdgeKind = 'connector' | 'polyline';

export type PptxPoint = { x: number; y: number };

export type PptxEdgeIR = {
  id: string;
  kind: PptxEdgeKind;

  fromId: string;
  toId: string;

  /**
   * For polyline edges, an explicit routed path (including endpoints).
   * For connector edges, this is typically omitted and PowerPoint routes the connector.
   */
  path?: PptxPoint[];

  /** Styling */
  stroke?: PptxColorHex;
  strokeWidth?: number;
  dashed?: boolean;

  /**
   * Optional semantic/type information (useful for post-processing and styling).
   * Kept optional so producers can stay lightweight.
   */
  relType?: string;
  linePattern?: 'solid' | 'dashed' | 'dotted';
  markerStart?: string;
  markerEnd?: string;
  pptxHeadEnd?: 'none' | 'arrow' | 'triangle' | 'diamond' | 'oval';
  pptxTailEnd?: 'none' | 'arrow' | 'triangle' | 'diamond' | 'oval';

  /** Optional label */
  label?: string;

  /** Optional metadata for post-processing / diagnostics */
  meta?: Record<string, unknown>;
};

export type PptxDiagramIR = {
  nodes: PptxNodeIR[];
  edges: PptxEdgeIR[];

  /** Optional diagram metadata */
  title?: string;
  meta?: Record<string, unknown>;
};
