import { useMemo } from 'react';
import type { Model, Relationship } from '../../../../../domain';
import { splitRelationshipsForElement } from '../../utils';

export function useElementRelationships(model: Model, elementId: string): { incoming: Relationship[]; outgoing: Relationship[] } {
  return useMemo(() => splitRelationshipsForElement(model, elementId), [model, elementId]);
}
