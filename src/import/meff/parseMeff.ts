import { addWarning, createImportReport } from '../importReport';
import type { ImportReport } from '../importReport';
import type { IRModel } from '../framework/ir';
import { parseXmlLenient } from '../framework/xml';

import { parseOrganizations } from './parser/organizations';
import { parseViews } from './parser/views';
import { parseMeffElements } from './parser/elements';
import { parseMeffRelationships } from './parser/relationships';

export type ParseMeffResult = {
  ir: IRModel;
  report: ImportReport;
};

/**
 * Parse ArchiMate Model Exchange File (MEFF) into the canonical IR.
 * MEFF import: elements + relationships + organization/folders + (optional) views/diagrams.
 */
export function parseMeffXml(xmlText: string, fileNameForMessages = 'model.xml'): ParseMeffResult {
  const report = createImportReport('archimate-meff');

  const { doc, parserError } = parseXmlLenient(xmlText);

  if (parserError) {
    addWarning(report, 'MEFF: XML parser reported an error while reading "' + fileNameForMessages + '": ' + parserError);
  }

  const { folders, refToFolder } = parseOrganizations(doc, report);
  const views = parseViews(doc, report, refToFolder);

  const elements = parseMeffElements(doc, report, refToFolder);
  const relationships = parseMeffRelationships(doc, report);

  const ir: IRModel = {
    folders,
    elements,
    relationships,
    views,
    meta: {
      format: 'archimate-meff',
      importedAtIso: new Date().toISOString()
    }
  };

  return { ir, report };
}
