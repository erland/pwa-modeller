import type { AnalysisRequest } from '../../../domain/analysis';
import type { AnalysisViewState, AnalysisViewKind } from '../contracts/analysisViewState';
import type { RelationshipMatrixResult } from '../../../domain/analysis/relationshipMatrix';
import type { Model, ModelKind, PathsBetweenResult, RelatedElementsResult } from '../../../domain';

import type { ExportDialogActionButton } from './ExportDialogView';

import { ExportDialogView } from './ExportDialogView';
import { type ExportFormat } from './exportDialogUtils';
import { useExportDialogController } from './useExportDialogController';

type Props = {
  isOpen: boolean;
  onClose: () => void;

  kind: AnalysisViewKind;
  analysisRequest: AnalysisRequest;
  analysisViewState: AnalysisViewState;

  // Optional computed data for fast-win exports
  modelName: string;
  matrix?: { result: RelationshipMatrixResult | null; cellValues?: number[][] };

  // Optional context for building tables for related/paths/portfolio
  model?: Model | null;
  modelKind?: ModelKind | null;
  relatedResult?: RelatedElementsResult | null;
  pathsResult?: PathsBetweenResult | null;
  portfolioTable?: import('../../../export').TabularData | null;
};

export function ExportDialog({
  isOpen,
  onClose,
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
}: Props) {
  const {
    exportOptions,
    exportBundle,
    availableFormats,
    format,
    setFormat,
    busy,
    status,
    reportCount,
    canSvg,
    canPng,
    canPptx,
    canXlsx,
    canTsv,
    canCsv,
    canCopyImage,
    actions,
  } = useExportDialogController({
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
  });

  const actionsByFormat: Record<ExportFormat, ExportDialogActionButton[]> = {
    svg: [
      {
        key: 'svg-copy',
        label: 'Copy',
        onClick: actions.copySvg,
        disabled: !canSvg || busy,
        title: !canSvg ? 'Not supported for this view yet' : 'Copy SVG markup to clipboard',
      },
      {
        key: 'svg-download',
        label: 'Download',
        onClick: actions.downloadSvg,
        disabled: !canSvg || busy,
        title: !canSvg ? 'Not supported for this view yet' : 'Download SVG',
      },
    ],
    png: [
      {
        key: 'png-copy',
        label: 'Copy',
        onClick: actions.copyPng,
        disabled: !canPng || busy || !canCopyImage,
        title: !canPng
          ? 'Not supported for this view yet'
          : !canCopyImage
            ? 'Browser does not support copying images to clipboard (use Download)'
            : 'Copy as PNG',
      },
      {
        key: 'png-download',
        label: 'Download',
        onClick: actions.downloadPng,
        disabled: !canPng || busy,
        title: !canPng ? 'Not supported for this view yet' : 'Download PNG',
      },
    ],
    pptx: [
      {
        key: 'pptx-download',
        label: 'Download',
        onClick: actions.downloadPptx,
        disabled: !canPptx || busy,
        title: !canPptx ? 'Not supported for this view yet' : 'Download PPTX',
      },
    ],
    xlsx: [
      {
        key: 'xlsx-download',
        label: 'Download',
        onClick: actions.downloadXlsx,
        disabled: !canXlsx || busy,
        title: !canXlsx ? 'Not supported for this view yet' : 'Download XLSX',
      },
    ],
    tsv: [
      {
        key: 'tsv-copy',
        label: 'Copy',
        onClick: actions.copyTableTsv,
        disabled: !canTsv || busy,
        title: !canTsv ? 'Not supported for this view yet' : 'Copy as TSV',
      },
    ],
    csv: [
      {
        key: 'csv-download',
        label: 'Download',
        onClick: actions.downloadCsv,
        disabled: !canCsv || busy,
        title: !canCsv ? 'Not supported for this view yet' : 'Download CSV',
      },
    ],
  };

  return (
    <ExportDialogView
      isOpen={isOpen}
      onClose={onClose}
      kind={kind}
      modelName={modelName}
      analysisRequest={analysisRequest}
      analysisViewState={analysisViewState}
      exportOptions={exportOptions}
      exportBundle={exportBundle}
      availableFormats={availableFormats}
      format={format}
      onFormatChange={setFormat}
      actionButtons={actionsByFormat[format]}
      status={status}
      busy={busy}
      reportCount={reportCount}
      reportCanAdd={exportBundle.artifacts.length > 0}
      onAddToReport={actions.addToReport}
      onDownloadReportJson={actions.downloadReportJson}
      onClearReport={actions.clearReport}
    />
  );
}