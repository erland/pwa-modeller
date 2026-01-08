import type { ExternalIdRef } from '../../../../domain';
import { ExternalIdsSummary } from '../ExternalIdsSummary';

export type ExternalIdsSectionProps = {
  externalIds?: ExternalIdRef[];
  title?: string;
  maxInline?: number;
};

export function ExternalIdsSection({ externalIds, title, maxInline }: ExternalIdsSectionProps) {
  return <ExternalIdsSummary externalIds={externalIds} title={title} maxInline={maxInline} />;
}
