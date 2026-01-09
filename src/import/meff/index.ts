import { createImportReport } from '../importReport';
import type { ImportResult, Importer } from '../framework/importer';
import type { IRModel } from '../framework/ir';
import { parseMeffXml } from './parseMeff';
import { sniffMeff } from './sniffMeff';

export const meffImporter: Importer<IRModel> = {
  id: 'meff',
  format: 'archimate-meff',
  displayName: 'ArchiMate Model Exchange File (MEFF)',
  priority: 100,
  extensions: ['xml'],
  sniff: sniffMeff,
  async import(file, ctx): Promise<ImportResult<IRModel>> {
    const text = await file.text();

    const { ir, report } = parseMeffXml(text, ctx.fileName);

    // Ensure report has correct source.
    if (!report.source) report.source = 'archimate-meff';

    // If parsing produced no elements/relationships at all, add a hint.
    if (ir.elements.length === 0 && ir.relationships.length === 0) {
      report.warnings.push(
        'MEFF: Parsed 0 elements and 0 relationships. Verify that the file is an ArchiMate Model Exchange export (not XMI or another XML format).'
      );
    }

    return {
      format: 'archimate-meff',
      importerId: 'meff',
      ir,
      report: report ?? createImportReport('archimate-meff')
    };
  }
};
