import type { ImportReport } from '../importReport';
import { createImportReport } from '../importReport';
import type { IRModel } from '../framework/ir';

import type { ModelMetadata } from '../../domain';
import { modelStore } from '../../store';

import type { ApplyImportContext, ApplyImportMappings, ApplyImportOptions, ApplyImportResult } from './applyImportTypes';
import { inferModelKind, getRootFolderId } from './applyImportHelpers';
import { applyFolders } from './steps/applyFolders';
import { applyElements } from './steps/applyElements';
import { applyRelationships } from './steps/applyRelationships';
import { applyViews } from './steps/applyViews';
import { scanAndMergeUnknownTypes } from './steps/scanUnknownTypes';

export type { ApplyImportContext, ApplyImportMappings, ApplyImportOptions, ApplyImportResult, UnknownTypePolicy } from './applyImportTypes';

/**
 * Apply an import IR to the model store.
 *
 * This function:
 * - creates a new model
 * - creates folders/elements/relationships/views
 * - preserves source identifiers via externalIds
 * - returns a merged ImportReport (including unknown-type scanning)
 */
export function applyImportIR(ir: IRModel, baseReport?: ImportReport, options?: ApplyImportOptions): ApplyImportResult {
  const sourceSystem = (options?.sourceSystem ?? baseReport?.source ?? ir.meta?.sourceSystem ?? 'import').toString();
  const unknownTypePolicy = options?.unknownTypePolicy ?? 'import-as-unknown';

  const report: ImportReport = baseReport
    ? { ...baseReport, warnings: [...baseReport.warnings] }
    : createImportReport(sourceSystem);

  const nameFromIr =
    typeof ir.meta?.modelName === 'string'
      ? ir.meta.modelName
      : typeof ir.meta?.name === 'string'
        ? ir.meta.name
        : undefined;

  const metadata: ModelMetadata = {
    name: (options?.metadata?.name ?? nameFromIr ?? options?.defaultModelName ?? 'Imported model').toString(),
    description: options?.metadata?.description,
    version: options?.metadata?.version,
    owner: options?.metadata?.owner
  };

  // Use importer-provided format hints to create views with the correct notation.
  const inferredViewKind = inferModelKind(ir, sourceSystem);

  // 1) Create a new model
  modelStore.newModel(metadata);

  const state = modelStore.getState();
  const model = state.model;
  if (!model) throw new Error('applyImportIR: modelStore.newModel did not create a model');

  const mappings: ApplyImportMappings = {
    folders: {},
    elements: {},
    relationships: {},
    views: {},
    viewNodes: {}
  };

  const rootFolderId = getRootFolderId(model);

  const ctx: ApplyImportContext = {
    ir,
    sourceSystem,
    unknownTypePolicy,
    report,
    inferredViewKind,
    rootFolderId,
    mappings
  };

  // 2) Apply the IR in ordered stages
  applyFolders(ctx);
  applyElements(ctx);
  applyRelationships(ctx);
  applyViews(ctx);

  // 3) Scan for unknown types (format-agnostic)
  scanAndMergeUnknownTypes(ctx);

  return {
    modelId: modelStore.getState().model?.id ?? model.id,
    mappings,
    report
  };
}
