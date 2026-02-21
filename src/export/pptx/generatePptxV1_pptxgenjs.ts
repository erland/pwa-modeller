import type { ExportArtifact, ExportBundle, ImageRef } from '../contracts/ExportBundle';
import type { PptxOptions } from '../contracts/ExportOptions';

import { svgTextToPngBytes } from './svgToPngBytes';
import PptxGenJS from 'pptxgenjs';
import { postProcessPptxWithJsZip } from './postProcessPptxWithJsZip';
import { PptxPostProcessMeta } from './pptxPostProcessMeta';
import { sandboxSvgToPptxDiagramIR } from './adapters/fromSandboxSvg';
import { renderPptxDiagramIR } from './writer';

function isImageArtifact(a: ExportArtifact): a is { type: 'image'; name: string; data: ImageRef } {
  return a.type === 'image';
}

function pickImageArtifacts(bundle: ExportBundle): Array<{ type: 'image'; name: string; data: ImageRef }> {
  return bundle.artifacts.filter(isImageArtifact);
}

function bytesToBase64(bytes: Uint8Array): string {
  // Avoid call-stack issues for large arrays.
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}


// (Sandbox SVG parsing + mapping moved to ./adapters/fromSandboxSvg.ts)

function layoutToPptxGen(layout: PptxOptions['layout']): string {
  return layout === 'standard' ? 'LAYOUT_4X3' : 'LAYOUT_WIDE';
}

/**
 * PPTX generation v1 (image-based slides) using PptxGenJS.
 *
 * This replaces the earlier hand-rolled OOXML approach, which some PowerPoint
 * builds rejected as invalid. PptxGenJS produces PowerPoint-compatible output.
 */

type PptxStageEnv = {
  pptx: PptxGenJS;
  pageW: number;
  pageH: number;
  includeFooter: boolean;
  footerText: string;
};

export function getPptxPageSize(layout: PptxOptions['layout']): { pageW: number; pageH: number } {
  // PptxGenJS uses inches for coordinates.
  // Standard (4:3) is 10" × 7.5". Wide is 13.33" × 7.5".
  const pageW = layout === 'standard' ? 10 : 13.333;
  const pageH = 7.5;
  return { pageW, pageH };
}

function createPptxDocument(bundle: ExportBundle, options: PptxOptions): PptxGenJS {
  const pptx = new PptxGenJS();
  pptx.layout = layoutToPptxGen(options.layout);
  pptx.author = 'EA Modeller PWA';
  pptx.company = 'EA Modeller PWA';
  pptx.subject = bundle.title;
  pptx.title = bundle.title;
  return pptx;
}

function addEmptyExportSlide(pptx: PptxGenJS): void {
  // Always produce a valid PPTX even if there are no images.
  const slide = pptx.addSlide();
  slide.addText('No image artifacts available for export.', {
    x: 0.5,
    y: 0.5,
    w: 9,
    h: 1,
    fontSize: 18,
    color: '333333',
  });
}

async function artifactToPngDataUrl(art: { type: 'image'; name: string; data: ImageRef }): Promise<string | undefined> {
  // Ensure we always embed PNG data (even if the artifact is SVG markup).
  if (art.data.kind === 'png') {
    return art.data.data.startsWith('data:') ? art.data.data : `data:image/png;base64,${art.data.data}`;
  }
  if (art.data.kind === 'svg') {
    const pngBytes = await svgTextToPngBytes(art.data.data, { scale: 2, background: '#ffffff' });
    return `data:image/png;base64,${bytesToBase64(pngBytes)}`;
  }
  return undefined;
}

type SandboxRenderResult = { handled: boolean; meta?: PptxPostProcessMeta };

function tryRenderSandboxSvgAsShapes(
  slide: import('pptxgenjs').Slide,
  svgText: string,
  env: { pageW: number; pageH: number }
): SandboxRenderResult {
  // Render Sandbox nodes/edges as shapes so the diagram remains editable in PowerPoint.
  // Step 3: Route through the PPTX diagram IR + writer.
  const res = sandboxSvgToPptxDiagramIR(svgText, env);
  if (!res.handled || !res.diagram) return { handled: false };
  renderPptxDiagramIR(slide as any, res.diagram, env);
  return { handled: true, meta: res.meta };
}

function addFullBleedImage(slide: import('pptxgenjs').Slide, pngDataUrl: string, env: { pageW: number; pageH: number }): void {
  slide.addImage({
    data: pngDataUrl,
    x: 0,
    y: 0,
    w: env.pageW,
    h: env.pageH,
  });
}

function addFooter(slide: import('pptxgenjs').Slide, env: PptxStageEnv): void {
  if (!env.includeFooter) return;
  slide.addText(env.footerText, {
    x: 0.3,
    y: env.pageH - 0.35,
    w: env.pageW - 0.6,
    h: 0.3,
    fontSize: 10,
    color: '555555',
  });
}

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  // Browser
  if (typeof atob === 'function') {
    const bin = atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node/test
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B: any = (globalThis as any).Buffer;
  if (B?.from) {
    return new Uint8Array(B.from(base64, 'base64'));
  }
  throw new Error('Base64 decode not supported on this platform');
}

// PptxGenJS has multiple output modes depending on platform/bundler.
// Some browser builds throw for 'nodebuffer' ("nodebuffer is not supported by this platform").
async function writePptxBytes(pptx: PptxGenJS): Promise<Uint8Array | ArrayBuffer> {
  try {
    // Works in Node and in some browser bundles.
    return await pptx.write('nodebuffer');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[PPTX] pptx.write("nodebuffer") failed; trying browser fallbacks.', e);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyPptx: any = pptx as any;

  try {
    // Common browser mode.
    const ab = await anyPptx.write('arraybuffer');
    // Some versions return ArrayBuffer, some return Uint8Array.
    return ab instanceof Uint8Array ? ab : (ab as ArrayBuffer);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[PPTX] pptx.write("arraybuffer") failed; trying base64 fallback.', e);
  }

  const b64 = await anyPptx.write('base64');
  if (typeof b64 !== 'string') {
    throw new Error('PPTX write failed: unsupported output type');
  }
  // Some implementations include data URL prefix.
  const clean = b64.startsWith('data:') ? b64.slice(b64.indexOf(',') + 1) : b64;
  return decodeBase64ToUint8Array(clean);
}

async function writePptxBlob(pptx: PptxGenJS, meta: PptxPostProcessMeta | undefined): Promise<Blob> {
  const raw = await writePptxBytes(pptx);
  const processed = await postProcessPptxWithJsZip(raw, meta);
  const safeProcessed = processed instanceof Uint8Array ? processed : new Uint8Array(processed);
  // Ensure we pass an ArrayBuffer (not SharedArrayBuffer) to Blob for TS/dom compatibility.
  const ab = new ArrayBuffer(safeProcessed.byteLength);
  new Uint8Array(ab).set(safeProcessed);
  return new Blob([ab], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

export async function generatePptxBlobV1(bundle: ExportBundle, options: PptxOptions): Promise<Blob> {
  const pptx = createPptxDocument(bundle, options);
  const { pageW, pageH } = getPptxPageSize(options.layout);

  const footerText = (options.footerText ?? '').trim();
  const includeFooter = footerText.length > 0;

  const env: PptxStageEnv = { pptx, pageW, pageH, includeFooter, footerText };

  const images = pickImageArtifacts(bundle);
  if (images.length === 0) {
    addEmptyExportSlide(pptx);
    return writePptxBlob(pptx, undefined);
  }

  let meta: PptxPostProcessMeta | undefined;

  for (const art of images) {
    const slide = pptx.addSlide();

    // Stage 1: Try sandbox-as-shapes for SVG artifacts.
    if (art.data.kind === 'svg') {
      const res = tryRenderSandboxSvgAsShapes(slide, art.data.data, { pageW, pageH });
      if (res.handled) {
        meta = res.meta;
        addFooter(slide, env);
        continue;
      }
    }

    // Stage 2: Image path (PNG or SVG->PNG).
    const pngDataUrl = await artifactToPngDataUrl(art);
    if (!pngDataUrl) {
      slide.addText('Missing image content.', { x: 0.5, y: 0.5, w: pageW - 1, h: 1, fontSize: 18 });
      addFooter(slide, env);
      continue;
    }

    addFullBleedImage(slide, pngDataUrl, { pageW, pageH });
    addFooter(slide, env);
  }

  return writePptxBlob(pptx, meta);
}



/**
 * Generate a PPTX from a pre-built diagram IR. Used by model workspace export (editable shapes/connectors).
 *
 * This reuses the same document metadata, footer handling and post-processing pipeline as generatePptxBlobV1.
 */
export async function generatePptxBlobFromDiagramIR(
  title: string,
  diagram: import('./ir/types').PptxDiagramIR,
  options: PptxOptions,
  meta?: PptxPostProcessMeta,
): Promise<Blob> {
  const bundle: ExportBundle = { title, artifacts: [] };
  const pptx = createPptxDocument(bundle, options);
  const { pageW, pageH } = getPptxPageSize(options.layout);

  const footerText = (options.footerText ?? '').trim();
  const includeFooter = footerText.length > 0;
  const env: PptxStageEnv = { pptx, pageW, pageH, includeFooter, footerText };

  const slide = pptx.addSlide();
  renderPptxDiagramIR(slide, diagram, { pageW, pageH });
  addFooter(slide, env);

  return writePptxBlob(pptx, meta);
}
