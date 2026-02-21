import type { ExportBundle } from '../contracts/ExportBundle';
import type { PptxOptions } from '../contracts/ExportOptions';

import { PptxPostProcessMeta } from './pptxPostProcessMeta';
import { sandboxSvgToPptxDiagramIR } from './adapters/fromSandboxSvg';
import { renderPptxDiagramIR } from './writer';
import { artifactToPngDataUrl, pickImageArtifacts } from './internal/imageArtifacts';
import {
  addEmptyExportSlide,
  addFooter,
  addFullBleedImage,
  createPptxDocument,
  getPptxPageSize,
  type PptxStageEnv,
} from './internal/pptxDoc';
import { writePptxBlob } from './internal/pptxWrite';

// Public re-export (keeps existing import paths stable).
export { getPptxPageSize } from './internal/pptxDoc';

// (Sandbox SVG parsing + mapping moved to ./adapters/fromSandboxSvg.ts)

/**
 * PPTX generation v1 (image-based slides) using PptxGenJS.
 *
 * This replaces the earlier hand-rolled OOXML approach, which some PowerPoint
 * builds rejected as invalid. PptxGenJS produces PowerPoint-compatible output.
 */

// Shared PPTX document setup + writing lives in ./internal/*.

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

// Note: writing bytes + JSZip post-processing moved to ./internal/pptxWrite.ts

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
