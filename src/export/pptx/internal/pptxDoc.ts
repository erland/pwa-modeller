import type { ExportBundle } from '../../contracts/ExportBundle';
import type { PptxOptions } from '../../contracts/ExportOptions';

import PptxGenJS from 'pptxgenjs';

function layoutToPptxGen(layout: PptxOptions['layout']): string {
  return layout === 'standard' ? 'LAYOUT_4X3' : 'LAYOUT_WIDE';
}

export type PptxStageEnv = {
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

export function createPptxDocument(bundle: ExportBundle, options: PptxOptions): PptxGenJS {
  const pptx = new PptxGenJS();
  pptx.layout = layoutToPptxGen(options.layout);
  pptx.author = 'EA Modeller PWA';
  pptx.company = 'EA Modeller PWA';
  pptx.subject = bundle.title;
  pptx.title = bundle.title;
  return pptx;
}

export function addEmptyExportSlide(pptx: PptxGenJS): void {
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

export function addFullBleedImage(
  slide: import('pptxgenjs').Slide,
  pngDataUrl: string,
  env: { pageW: number; pageH: number }
): void {
  slide.addImage({
    data: pngDataUrl,
    x: 0,
    y: 0,
    w: env.pageW,
    h: env.pageH,
  });
}

export function addFooter(slide: import('pptxgenjs').Slide, env: PptxStageEnv): void {
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
