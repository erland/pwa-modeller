import { useMemo } from 'react';
import type { ElementType } from '../../../../../domain';
import { getNotation } from '../../../../../notations/registry';

export function useElementTypeOptions(
  kind: 'archimate' | 'uml' | 'bpmn',
  currentType: ElementType,
): {
  elementTypeOptions: ElementType[];
  kindTypeLabelById: Map<unknown, string>;
} {
  const kindTypeOptions = useMemo(() => getNotation(kind).getElementTypeOptions(), [kind]);
  const kindTypeIds = useMemo<ElementType[]>(() => kindTypeOptions.map((o) => o.id as ElementType), [kindTypeOptions]);
  const kindTypeLabelById = useMemo(() => new Map(kindTypeOptions.map((o) => [o.id, o.label] as const)), [kindTypeOptions]);

  const elementTypeOptions = useMemo<ElementType[]>(() => {
    const base = kindTypeIds;
    const withUnknown = currentType === 'Unknown' ? (['Unknown', ...base] as ElementType[]) : base;

    // Keep current value visible even if it is out-of-sync (e.g., imported data).
    return withUnknown.includes(currentType) ? withUnknown : ([currentType, ...withUnknown] as ElementType[]);
  }, [kindTypeIds, currentType]);

  return { elementTypeOptions, kindTypeLabelById };
}
