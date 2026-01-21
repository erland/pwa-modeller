import type { ImportIR } from '../framework/importer';

import { createParseContext } from './parser/context';
import { parseElements } from './parser/elements';
import { parseRelationships } from './parser/relationships';
import { parseViews, addFallbackAutoLayoutView } from './parser/views';

export type ParseBpmn2Result = {
  importIR: ImportIR;
  warnings: string[];
};

/**
 * Parse BPMN 2.0 XML into the app's ImportIR.
 */
export function parseBpmn2Xml(xmlText: string): ParseBpmn2Result {
  const ctx = createParseContext(xmlText);

  parseElements(ctx);
  parseRelationships(ctx);
  parseViews(ctx);

  if (ctx.views.length === 0) {
    addFallbackAutoLayoutView(ctx);
  }

  const ir: ImportIR = {
    folders: [],
    elements: ctx.elements,
    relationships: ctx.relationships,
    views: ctx.views,
    meta: {
      format: 'bpmn2'
    }
  };

  return { importIR: ir, warnings: ctx.warnings };
}
