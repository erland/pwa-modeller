// Facade re-export for layout-related mutations.
// Split into smaller modules to keep responsibilities clear.

export { updateViewNodeLayout } from './layout/updateViewNodeLayout';
export {
  addElementToView,
  addElementsToView,
  addElementToViewAt,
  addConnectorToViewAt,
  removeElementFromView,
  updateViewNodePosition
} from './layout/viewNodeOps';
export { updateViewNodePositionAny } from './layout/updateViewNodePositionAny';
export { updateViewNodePositionsAny } from './layout/updateViewNodePositionsAny';
export { updateViewNodeLayoutAny } from './layout/updateViewNodeLayoutAny';
