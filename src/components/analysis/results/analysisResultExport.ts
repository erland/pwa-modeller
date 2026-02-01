import type { AnalysisPath, PathsBetweenResult, RelatedElementsResult } from '../../../domain';
import { sanitizeFileNameWithExtension, downloadTextFile } from '../../../store';

import { escapeCsvValue } from './analysisResultHelpers';

export type AnalysisResultExportFormatters = {
  nodeLabel: (id: string) => string;
  nodeType: (id: string) => string;
  nodeLayer: (id: string) => string;
  pathTitle: (p: AnalysisPath) => string;
};

export function exportRelatedCsv(args: {
  modelName: string;
  relatedResult: RelatedElementsResult | null;
  formatters: Pick<AnalysisResultExportFormatters, 'nodeLabel' | 'nodeType' | 'nodeLayer'>;
}): void {
  const hits = args.relatedResult?.hits ?? [];
  if (hits.length === 0) return;

  const { modelName, relatedResult, formatters } = args;
  const startId = relatedResult?.startElementId ?? '';
  const fileBase = `${modelName}-analysis-related${startId ? `-${formatters.nodeLabel(startId)}` : ''}`;

  const lines: string[] = [];
  lines.push(['distance', 'elementId', 'name', 'type', 'layer'].map(escapeCsvValue).join(','));

  for (const h of hits) {
    lines.push(
      [h.distance, h.elementId, formatters.nodeLabel(h.elementId), formatters.nodeType(h.elementId), formatters.nodeLayer(h.elementId)]
        .map(escapeCsvValue)
        .join(',')
    );
  }

  downloadTextFile(sanitizeFileNameWithExtension(fileBase, 'csv'), lines.join('\n'), 'text/csv');
}

export function exportPathsCsv(args: {
  modelName: string;
  pathsResult: PathsBetweenResult | null;
  formatters: Pick<AnalysisResultExportFormatters, 'nodeLabel' | 'pathTitle'>;
}): void {
  const paths = args.pathsResult?.paths ?? [];
  if (paths.length === 0) return;

  const { modelName, formatters } = args;
  const fileBase = `${modelName}-analysis-paths`;

  const lines: string[] = [];
  lines.push(
    ['pathIndex', 'hopIndex', 'fromId', 'fromName', 'relationshipId', 'relationshipType', 'toId', 'toName']
      .map(escapeCsvValue)
      .join(',')
  );

  for (let pi = 0; pi < paths.length; pi++) {
    const p = paths[pi];
    for (let hi = 0; hi < p.steps.length; hi++) {
      const s = p.steps[hi];
      lines.push(
        [
          pi + 1,
          hi + 1,
          s.fromId,
          formatters.nodeLabel(s.fromId),
          s.relationshipId,
          s.relationshipType,
          s.toId,
          formatters.nodeLabel(s.toId)
        ]
          .map(escapeCsvValue)
          .join(',')
      );
    }
  }

  downloadTextFile(sanitizeFileNameWithExtension(fileBase, 'csv'), lines.join('\n'), 'text/csv');
}
