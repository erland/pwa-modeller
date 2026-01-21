import type { Model } from '../../../domain';
import { materializeViewConnectionsForView } from '../../../domain';

export function syncViewConnections(model: Model, viewId: string): void {
  const v = model.views[viewId];
  if (!v) return;
  const next = materializeViewConnectionsForView(model, v);
  // Reduce churn when nothing changes.
  if (next !== v.connections) {
    model.views[viewId] = { ...v, connections: next };
  }
}

