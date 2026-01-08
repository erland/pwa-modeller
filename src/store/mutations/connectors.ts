import type { Model, RelationshipConnector } from '../../domain';
import { tidyExternalIds } from '../../domain';
import { deleteRelationshipInModel, getView } from './helpers';

export function addConnector(model: Model, connector: RelationshipConnector): void {
  // Ensure the container exists (older models may have been normalized already, but be defensive).
  const nextConnectors = model.connectors ?? {};
  nextConnectors[connector.id] = connector;
  model.connectors = nextConnectors;
}

export function updateConnector(model: Model, connectorId: string, patch: Partial<Omit<RelationshipConnector, 'id'>>): void {
  const current = model.connectors?.[connectorId];
  if (!current) throw new Error(`Connector not found: ${connectorId}`);
  const merged: RelationshipConnector = { ...current, ...patch, id: current.id };
  merged.externalIds = tidyExternalIds(merged.externalIds);
  model.connectors = { ...(model.connectors ?? {}), [connectorId]: merged };
}

export function deleteConnector(model: Model, connectorId: string): void {
  if (!model.connectors?.[connectorId]) return;

  // Delete any relationships connected to this connector.
  const relIdsToDelete = Object.keys(model.relationships).filter((relId) => {
    const rel = model.relationships[relId];
    return rel.sourceConnectorId === connectorId || rel.targetConnectorId === connectorId;
  });
  for (const relId of relIdsToDelete) {
    deleteRelationshipInModel(model, relId);
  }

  // Remove connector nodes from all views.
  for (const viewId of Object.keys(model.views)) {
    const view = getView(model, viewId);
    if (!view.layout) continue;
    const nextNodes = view.layout.nodes.filter((n) => n.connectorId !== connectorId);
    if (nextNodes.length !== view.layout.nodes.length) {
      model.views[viewId] = { ...view, layout: { ...view.layout, nodes: nextNodes } };
    }
  }

  // Finally remove the connector itself.
  const next = { ...(model.connectors ?? {}) };
  delete next[connectorId];
  model.connectors = next;
}
