import type { ExportArtifact, ExportBundle, ImageRef } from '../contracts/ExportBundle';
import type { PptxOptions } from '../contracts/ExportOptions';

import { svgTextToPngBytes } from './svgToPngBytes';
import PptxGenJS from 'pptxgenjs';

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

function layoutToPptxGen(layout: PptxOptions['layout']): string {
  return layout === 'standard' ? 'LAYOUT_4X3' : 'LAYOUT_WIDE';
}

/**
 * PPTX generation v1 (image-based slides) using PptxGenJS.
 *
 * This replaces the earlier hand-rolled OOXML approach, which some PowerPoint
 * builds rejected as invalid. PptxGenJS produces PowerPoint-compatible output.
 */
export async function generatePptxBlobV1(bundle: ExportBundle, options: PptxOptions): Promise<Blob> {  const pptx = new (PptxGenJS as any)();
  pptx.layout = layoutToPptxGen(options.layout);
  pptx.author = 'EA Modeller PWA';
  pptx.company = 'EA Modeller PWA';
  pptx.subject = bundle.title;
  pptx.title = bundle.title;

  const images = pickImageArtifacts(bundle);
  if (images.length === 0) {
    // Always produce a valid PPTX.
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

  // PptxGenJS uses inches for coordinates.
  // Standard (4:3) is 10" × 7.5". Wide is 13.33" × 7.5".
  const pageW = options.layout === 'standard' ? 10 : 13.333;
  const pageH = 7.5;

  const footerText = (options.footerText ?? '').trim();
  const includeFooter = footerText.length > 0;

  for (const art of images) {
    const slide = pptx.addSlide();

    // Ensure we always embed PNG data (even if the artifact is SVG markup).
    let pngDataUrl: string | undefined;
    if (art.data.kind === 'png') {
      // Already a data URL.
      pngDataUrl = art.data.data.startsWith('data:') ? art.data.data : `data:image/png;base64,${art.data.data}`;
    } else if (art.data.kind === 'svg') {
      const pngBytes = await svgTextToPngBytes(art.data.data, { scale: 2, background: '#ffffff' });
      pngDataUrl = `data:image/png;base64,${bytesToBase64(pngBytes)}`;
    }

    if (!pngDataUrl) {
      slide.addText('Missing image content.', { x: 0.5, y: 0.5, w: pageW - 1, h: 1, fontSize: 18 });
      continue;
    }

    // Full-bleed placement.
    slide.addImage({
      data: pngDataUrl,
      x: 0,
      y: 0,
      w: pageW,
      h: pageH,
    });

    if (includeFooter) {
      // Small footer strip at bottom.
      slide.addText(footerText, {
        x: 0.3,
        y: pageH - 0.35,
        w: pageW - 0.6,
        h: 0.3,
        fontSize: 10,
        color: '555555',
      });
    }
  }

  const out = await pptx.write({ outputType: 'blob', compression: false });
  if (out instanceof Blob) return out;
  return new Blob([out as any], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}
