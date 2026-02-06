declare module 'pptxgenjs' {
  export type PptxLayout = string;

  export type ShapeType = string;

  export interface ShapeLineProps {
    color?: string;
    width?: number;
    beginArrowType?: string;
    endArrowType?: string;
    dash?: string;
  }

  export interface ShapeFillProps {
    color?: string;
    transparency?: number;
  }

  export interface TextRun {
    text: string;
    options?: Record<string, unknown>;
  }

  export interface TextOptions {
    x: number;
    y: number;
    w: number;
    h: number;
    fontFace?: string;
    fontSize?: number;
    color?: string;
    align?: 'left' | 'center' | 'right' | 'justify';
    valign?: 'top' | 'mid' | 'bottom';
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
  }

  export interface ShapeOptions {
    x: number;
    y: number;
    w: number;
    h: number;
    fill?: ShapeFillProps;
    line?: ShapeLineProps;
    rotate?: number;
    radius?: number;
    transparency?: number;
  }

  export interface ImageOptions {
    data: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }

  export interface Slide {
    addShape(shapeType: ShapeType, options: ShapeOptions | (Record<string, unknown> & { x: number; y: number; w: number; h: number })): unknown;
    addText(text: string | TextRun[], options: TextOptions | (Record<string, unknown> & { x: number; y: number; w: number; h: number })): unknown;
    addImage(options: ImageOptions | (Record<string, unknown> & { x: number; y: number; w: number; h: number })): unknown;
  }

  export default class PptxGenJS {
    layout: PptxLayout;
    author?: string;
    company?: string;
    subject?: string;
    title?: string;

    addSlide(): Slide;

    // In browser builds, many setups use 'nodebuffer' to request a Uint8Array.
    write(type?: string): Promise<Uint8Array>;
  }
}
