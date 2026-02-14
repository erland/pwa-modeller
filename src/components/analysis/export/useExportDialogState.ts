import { useEffect, useMemo, useState } from 'react';

import type { AnalysisRequest } from '../../../domain/analysis';
import type { AnalysisViewKind, AnalysisViewState } from '../contracts/analysisViewState';
import type { RelationshipMatrixResult } from '../../../domain/analysis/relationshipMatrix';
import type { Model, ModelKind, PathsBetweenResult, RelatedElementsResult } from '../../../domain';

import { getAnalysisAdapter } from '../../../analysis/adapters/registry';
import { createAnalysisResultFormatters } from '../results/analysisResultFormatters';

import { buildExportBundle, canWriteImageToClipboard, deriveDefaultExportOptions } from '../../../export';

import {
  findSandboxSvgText,
  getAvailableFormats,
  getExportCapabilities,
  type ExportFormat,
} from './exportDialogUtils';

export type ExportDialogControllerArgs = {
  isOpen: boolean;
  kind: AnalysisViewKind;
  analysisRequest: AnalysisRequest;
  analysisViewState: AnalysisViewState;
  modelName: string;
  matrix?: { result: RelationshipMatrixResult | null; cellValues?: number[][] };
  model?: Model | null;
  modelKind?: ModelKind | null;
  relatedResult?: RelatedElementsResult | null;
  pathsResult?: PathsBetweenResult | null;
  portfolioTable?: import('../../../export').TabularData | null;
};

export type ExportDialogState = {
  // Inputs/derived
  kind: AnalysisViewKind;
  modelName: string;
  analysisRequest: AnalysisRequest;
  analysisViewState: AnalysisViewState;
  isOpen: boolean;

  exportOptions: ReturnType<typeof deriveDefaultExportOptions>;
  exportBundle: ReturnType<typeof buildExportBundle>;
  sandboxSvgText: string | null;

  // UI state
  availableFormats: ExportFormat[];
  format: ExportFormat;
  setFormat: (f: ExportFormat) => void;

  busy: boolean;
  status: string | null;
  setStatus: (s: string | null) => void;
  reportCount: number;
  setReportCount: (n: number) => void;

  // Capabilities
  canSvg: boolean;
  canPng: boolean;
  canPptx: boolean;
  canXlsx: boolean;
  canTsv: boolean;
  canCsv: boolean;
  canCopyImage: boolean;

  // Helper
  runAction: (label: string, fn: () => Promise<void> | void) => Promise<void>;
};

export function useExportDialogState(args: ExportDialogControllerArgs): ExportDialogState {
  const {
    isOpen,
    kind,
    analysisRequest,
    analysisViewState,
    modelName,
    matrix,
    model,
    modelKind,
    relatedResult,
    pathsResult,
    portfolioTable,
  } = args;

  const exportOptions = useMemo(() => deriveDefaultExportOptions(kind), [kind]);

  const fmt = useMemo(() => {
    if (!model || !modelKind) return null;
    const adapter = getAnalysisAdapter(modelKind);
    const f = createAnalysisResultFormatters(adapter, model);
    return { nodeLabel: f.nodeLabel, nodeType: f.nodeType, nodeLayer: f.nodeLayer };
  }, [model, modelKind]);

  const exportBundle = useMemo(() => {
    return buildExportBundle({
      kind,
      modelName,
      analysisRequest,
      analysisViewState,
      exportOptions,
      matrix,
      portfolioTable,
      relatedResult,
      pathsResult,
      formatters: fmt ?? undefined,
      document: typeof document !== 'undefined' ? document : undefined,
    });
  }, [analysisRequest, analysisViewState, exportOptions, fmt, kind, matrix, modelName, pathsResult, portfolioTable, relatedResult]);

  const sandboxSvgText = useMemo(() => findSandboxSvgText(exportBundle.artifacts), [exportBundle.artifacts]);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [reportCount, setReportCount] = useState(0);

  const availableFormats: ExportFormat[] = useMemo(() => getAvailableFormats(kind), [kind]);
  const [format, setFormat] = useState<ExportFormat>(() => availableFormats[0] ?? 'svg');

  useEffect(() => setFormat(availableFormats[0] ?? 'svg'), [availableFormats]);
  useEffect(() => setStatus(null), [format, kind, isOpen]);

  // Keep "refresh count when opened" behavior without importing report logic into the controller.
  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      const { loadExportReport } = await import('../../../export');
      setReportCount(loadExportReport().length);
    })();
  }, [isOpen]);

  const { canSvg, canPng, canPptx, canXlsx, canTsv, canCsv } = useMemo(
    () =>
      getExportCapabilities({
        kind,
        sandboxSvgText,
        artifacts: exportBundle.artifacts,
      }),
    [exportBundle.artifacts, kind, sandboxSvgText]
  );

  const canCopyImage = useMemo(() => canWriteImageToClipboard(), []);

  async function runAction(label: string, fn: () => Promise<void> | void) {
    setStatus(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setStatus((e as Error).message || `${label} failed.`);
    } finally {
      setBusy(false);
    }
  }

  return {
    kind,
    modelName,
    analysisRequest,
    analysisViewState,
    isOpen,
    exportOptions,
    exportBundle,
    sandboxSvgText,
    availableFormats,
    format,
    setFormat,
    busy,
    status,
    setStatus,
    reportCount,
    setReportCount,
    canSvg,
    canPng,
    canPptx,
    canXlsx,
    canTsv,
    canCsv,
    canCopyImage,
    runAction,
  };
}
