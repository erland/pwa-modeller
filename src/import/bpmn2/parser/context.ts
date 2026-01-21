import type { IRElement, IRRelationship, IRView } from '../../framework/ir';

import { localName, parseXml, q } from '../xml';

export type ParseContext = {
  doc: Document;
  defs: Element;

  warnings: string[];

  elements: IRElement[];
  relationships: IRRelationship[];
  views: IRView[];

  idIndex: Set<string>;
  elementById: Map<string, IRElement>;
  relById: Map<string, IRRelationship>;
  unsupportedNodeTypes: Set<string>;
};

export function createParseContext(xmlText: string): ParseContext {
  const warnings: string[] = [];
  const doc = parseXml(xmlText);

  const defs = q(doc, 'definitions');
  if (!defs || localName(defs) !== 'definitions') {
    throw new Error('Not a BPMN 2.0 XML document: missing <definitions> element.');
  }

  return {
    doc,
    defs,
    warnings,
    elements: [],
    relationships: [],
    views: [],
    idIndex: new Set<string>(),
    elementById: new Map<string, IRElement>(),
    relById: new Map<string, IRRelationship>(),
    unsupportedNodeTypes: new Set<string>()
  };
}
