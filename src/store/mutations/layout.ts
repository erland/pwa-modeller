// Facade re-export for layout-related mutations.
// Split into smaller modules to keep responsibilities clear.

export { updateViewNodeLayout } from './layout/updateViewNodeLayout';
export {
  addElementToView,
  addElementToViewAt,
  addConnectorToViewAt,
  removeElementFromView,
  updateViewNodePosition
} from './layout/viewNodeOps';
export { updateViewNodePositionAny } from './layout/updateViewNodePositionAny';
export { updateViewNodeLayoutAny } from './layout/updateViewNodeLayoutAny';
