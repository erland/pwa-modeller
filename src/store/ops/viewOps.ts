import type { ViewOpsDeps } from './view/viewOpsTypes';
import { createViewCrudOps } from './view/viewCrudOps';
import { createViewConnectionsOps } from './view/viewConnectionsOps';
import { createViewRelationshipVisibilityOps } from './view/viewRelationshipVisibilityOps';
import { createViewObjectsOps } from './view/viewObjectsOps';
import { createViewLayoutBridgeOps } from './view/viewLayoutBridgeOps';

export type { ViewOpsDeps } from './view/viewOpsTypes';

export const createViewOps = (deps: ViewOpsDeps) => {
  const crud = createViewCrudOps(deps);
  const connections = createViewConnectionsOps(deps);
  const visibility = createViewRelationshipVisibilityOps(deps);
  const objects = createViewObjectsOps(deps);
  const layout = createViewLayoutBridgeOps(deps);

  return {
    ...crud,
    ...connections,
    ...visibility,
    ...objects,
    ...layout,
  };
};
