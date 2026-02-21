import type { Model } from '../../domain';
import type { PptxOptions } from '../contracts/ExportOptions';

import { modelViewToPptxDiagramIR } from './adapters/fromModelView';
import { generatePptxBlobFromDiagramIR } from './generatePptxV1_pptxgenjs';
import { getPptxPageSize } from './generatePptxV1_pptxgenjs';

/**
 * Generate an editable PPTX from a model workspace view (nodes + connections).
 *
 * Note: This uses the post-process connector rebuild pipeline, so output is still
 * "lines replaced with connectors" rather than native connectors emitted by PptxGenJS.
 */
export async function generatePptxBlobFromModelView(
  model: Model,
  viewId: string,
  options: PptxOptions,
): Promise<Blob> {
  const view = model.views[viewId];
  const title = `${model.metadata?.name ?? 'Model'}-${view?.name ?? viewId}`;

  const { pageW, pageH } = getPptxPageSize(options.layout);
  const res = modelViewToPptxDiagramIR(model, viewId, { pageW, pageH });
  if (!res.handled || !res.diagram) {
    throw new Error(res.note ?? 'Could not build diagram for PPTX.');
  }
  return generatePptxBlobFromDiagramIR(title, res.diagram, options, res.meta);
}
