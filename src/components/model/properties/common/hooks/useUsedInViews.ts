import { useMemo } from 'react';
import type { Model, View, ViewNodeLayout } from '../../../../../domain';

export type UsedInView = { id: string; name: string; count: number };

export function useUsedInViews(model: Model, elementId: string, hasElement: boolean): UsedInView[] {
  return useMemo(() => {
    return (Object.values(model.views) as View[])
      .filter(
        (v) =>
          hasElement &&
          Boolean(v.layout) &&
          v.layout!.nodes.some((n: ViewNodeLayout) => n.elementId === elementId),
      )
      .map((v) => {
        const count = v.layout && hasElement ? v.layout.nodes.filter((n: ViewNodeLayout) => n.elementId === elementId).length : 0;
        return { id: v.id, name: v.name, count };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [model, hasElement, elementId]);
}
