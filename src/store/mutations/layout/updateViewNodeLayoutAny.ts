import type { Model, ViewNodeLayout } from '../../../domain';
import { getView } from '../helpers';

export function updateViewNodeLayoutAny(
  model: Model,
  viewId: string,
  ref: { elementId?: string; connectorId?: string; objectId?: string },
  patch: Partial<Omit<ViewNodeLayout, 'elementId' | 'connectorId' | 'objectId'>>
): void {
  const view = getView(model, viewId);
  if (!view.layout) return;

  const layout = view.layout;
  const nextNodes = layout.nodes.map((n) => {
    const matchesElement = ref.elementId && n.elementId === ref.elementId;
    const matchesConnector = ref.connectorId && n.connectorId === ref.connectorId;
    const matchesObject = ref.objectId && n.objectId === ref.objectId;
    if (!matchesElement && !matchesConnector && !matchesObject) return n;

    // Preserve whichever identity field this node uses.
    const idFields: Pick<ViewNodeLayout, 'elementId' | 'connectorId' | 'objectId'> = {
      elementId: n.elementId,
      connectorId: n.connectorId,
      objectId: n.objectId
    };

    return { ...n, ...patch, ...idFields };
  });

  model.views[viewId] = { ...view, layout: { nodes: nextNodes, relationships: layout.relationships } };
}
