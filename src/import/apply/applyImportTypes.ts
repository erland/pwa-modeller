import type { ImportReport } from '../importReport';
import type { IRId, IRModel } from '../framework/ir';
import type { ModelKind, ModelMetadata } from '../../domain';

export type UnknownTypePolicy = 'import-as-unknown' | 'skip';

export type ApplyImportOptions = {
  /** Overrides metadata; at minimum a name will be ensured. */
  metadata?: Partial<ModelMetadata>;
  /** A default model name if metadata.name is not provided. */
  defaultModelName?: string;

  /** Used for external id namespaces + unknown type info. */
  sourceSystem?: string;

  /**
   * What to do when an element/relationship type doesn't match the app's known enums.
   * - 'import-as-unknown': create domain objects with type 'Unknown' and preserve the original type name.
   * - 'skip': skip the item and add a warning.
   */
  unknownTypePolicy?: UnknownTypePolicy;
};

export type ApplyImportMappings = {
  folders: Record<IRId, string>;
  elements: Record<IRId, string>;
  relationships: Record<IRId, string>;
  views: Record<IRId, string>;
  viewNodes: Record<IRId, { kind: 'element'; elementId: string } | { kind: 'object'; objectId: string }>;
};

export type ApplyImportResult = {
  modelId: string;
  mappings: ApplyImportMappings;
  report: ImportReport;
};

export type ApplyImportContext = {
  ir: IRModel;
  sourceSystem: string;
  unknownTypePolicy: UnknownTypePolicy;
  report: ImportReport;
  inferredViewKind: ModelKind;
  rootFolderId: string;
  mappings: ApplyImportMappings;
};
