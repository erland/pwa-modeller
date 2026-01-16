import { useMemo } from 'react';
import type { Model } from '../../../../../domain';
import { computeRelationshipTrace } from '../../../../../domain';

export type TraceDirection = 'outgoing' | 'incoming' | 'both';

export function useRelationshipTrace(model: Model, elementId: string, direction: TraceDirection, depth: number) {
  return useMemo(() => {
    return computeRelationshipTrace(model, elementId, direction, depth);
  }, [model, elementId, direction, depth]);
}
