import type { ViewLayout } from '../types';
import { findDuplicateIds } from '../validation';

export function listDuplicatesInLayout(layout: ViewLayout | undefined): {
  nodeElementIds: string[];
  nodeConnectorIds: string[];
  nodeObjectIds: string[];
  relationshipIds: string[];
} {
  if (!layout) return { nodeElementIds: [], nodeConnectorIds: [], nodeObjectIds: [], relationshipIds: [] };
  const nodeElementIds = layout.nodes.flatMap((n) => (n.elementId ? [n.elementId] : []));
  const nodeConnectorIds = layout.nodes.flatMap((n) => (n.connectorId ? [n.connectorId] : []));
  const nodeObjectIds = layout.nodes.flatMap((n) => (n.objectId ? [n.objectId] : []));
  const relIds = layout.relationships.map((r) => r.relationshipId);
  return {
    nodeElementIds: findDuplicateIds(nodeElementIds),
    nodeConnectorIds: findDuplicateIds(nodeConnectorIds),
    nodeObjectIds: findDuplicateIds(nodeObjectIds),
    relationshipIds: findDuplicateIds(relIds)
  };
}
