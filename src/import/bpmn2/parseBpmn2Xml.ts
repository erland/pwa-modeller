import type { ImportIR } from '../framework/importer';

import { localName, parseXml, q } from './xml';

export type ParseBpmn2Result = {
  importIR: ImportIR;
  warnings: string[];
};

/**
 * Parse BPMN 2.0 XML into the app's ImportIR.
 *
 * Step 1 skeleton: validates that the document contains a <definitions> root.
 * Later steps will populate elements, relationships, views and geometry.
 */
export function parseBpmn2Xml(xmlText: string): ParseBpmn2Result {
  const warnings: string[] = [];
  const doc = parseXml(xmlText);

  const defs = q(doc, 'definitions');
  if (!defs || localName(defs) !== 'definitions') {
    throw new Error('Not a BPMN 2.0 XML document: missing <definitions> element.');
  }

  const ir: ImportIR = {
    folders: [],
    elements: [],
    relationships: [],
    views: [],
    meta: {
      format: 'bpmn2'
    }
  };

  return { importIR: ir, warnings };
}
