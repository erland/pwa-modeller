import type { ApplyImportContext } from '../applyImportTypes';
import { scanModelForUnknownTypes } from '../../importReport';
import { modelStore } from '../../../store';
import { pushWarning } from '../applyImportHelpers';

export function scanAndMergeUnknownTypes(ctx: ApplyImportContext): void {
  const { report } = ctx;

  const finalModel = modelStore.getState().model;
  if (!finalModel) return;

  const scan = scanModelForUnknownTypes(finalModel, report.source);
  if (!scan) return;

  report.unknownElementTypes = scan.unknownElementTypes;
  report.unknownRelationshipTypes = scan.unknownRelationshipTypes;

  // Keep warnings from both sides
  for (const w of scan.warnings) pushWarning(report, w);
}
