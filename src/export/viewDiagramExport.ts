import type { Model } from '../domain';
import type { ExportBundle } from './contracts/ExportBundle';

import { createViewSvg } from '../components/diagram/exportSvg';
import { downloadTextFile, downloadBlobFile, sanitizeFileNameWithExtension } from '../store/download';
import { downloadPngFromSvgText } from './image/downloadPngFromSvgText';
import { generatePptxBlobV1 } from './pptx/generatePptxV1_pptxgenjs';
import { generatePptxBlobFromModelView } from './pptx/generatePptxFromModelView';

export type ViewExportNameOptions = {
  /** Optional override for base file name (without extension). */
  baseName?: string;
  /** Optional override for export bundle title. */
  title?: string;
};

export type ViewPngExportOptions = {
  /** Scale factor, e.g. 1, 2, 3. */
  scale?: number;
  /** Background fill. Default is 'white'. Use 'transparent' to keep alpha. */
  background?: 'white' | 'transparent';
};

/**
 * Create an ExportBundle representing a single model workspace view as an SVG image artifact.
 * This is the shared contract used by PPTX generation (and potentially other exporters).
 */
export function buildViewExportBundle(
  model: Model,
  viewId: string,
  opts: ViewExportNameOptions = {},
): ExportBundle {
  const view = model.views[viewId];
  const modelName = model.metadata?.name || 'Model';
  const viewName = view?.name || viewId;

  const title = (opts.title || `${modelName}-${viewName}`).trim() || 'Export';

  const svgText = createViewSvg(model, viewId);

  return {
    title,
    artifacts: [
      {
        type: 'image',
        name: 'Diagram',
        data: { kind: 'svg', data: svgText },
      },
    ],
  };
}

function buildBaseName(model: Model, viewId: string, opts: ViewExportNameOptions): string {
  if (opts.baseName && opts.baseName.trim()) return opts.baseName.trim();
  const view = model.views[viewId];
  const modelName = model.metadata?.name || 'Model';
  const viewName = view?.name || viewId;
  return `${modelName}-${viewName}`;
}

export function downloadViewSvg(model: Model, viewId: string, opts: ViewExportNameOptions = {}): void {
  const baseName = buildBaseName(model, viewId, opts);
  const fileName = sanitizeFileNameWithExtension(baseName, 'svg');
  const svgText = createViewSvg(model, viewId);
  downloadTextFile(fileName, svgText, 'image/svg+xml;charset=utf-8');
}

export async function downloadViewPng(
  model: Model,
  viewId: string,
  pngOpts: ViewPngExportOptions = {},
  nameOpts: ViewExportNameOptions = {},
): Promise<void> {
  const baseName = buildBaseName(model, viewId, nameOpts);
  const svgText = createViewSvg(model, viewId);

  await downloadPngFromSvgText(baseName, svgText, {
    scale: pngOpts.scale ?? 2,
    background: pngOpts.background ?? 'white',
  });
}

export async function downloadViewPptx(
  model: Model,
  viewId: string,
  pptxOptions: any,
  nameOpts: ViewExportNameOptions = {},
): Promise<void> {
  const baseName = buildBaseName(model, viewId, nameOpts);
  const fileName = sanitizeFileNameWithExtension(baseName, 'pptx');

  const bundle = buildViewExportBundle(model, viewId, { title: nameOpts.title || baseName });
  const mode = (pptxOptions?.diagramMode ?? 'image') as 'image' | 'shapes';
  const blob = mode === 'shapes'
    ? await generatePptxBlobFromModelView(model, viewId, pptxOptions)
    : await generatePptxBlobV1(bundle, pptxOptions);
  downloadBlobFile(fileName, blob);
}
