import type { ViewNodeLayout } from '../../../domain';
import { layoutMutations } from '../../mutations';
import type { LayoutOpsDeps } from './layoutOpsTypes';

type AnyNodeRef = { elementId?: string; connectorId?: string; objectId?: string };

export type LayoutCrudOps = {
  addElementToViewAt: (viewId: string, elementId: string, x: number, y: number) => string;
  addConnectorToViewAt: (viewId: string, connectorId: string, x: number, y: number) => string;
  removeElementFromView: (viewId: string, elementId: string) => void;
  updateViewNodePosition: (viewId: string, elementId: string, x: number, y: number) => void;
  updateViewNodePositionAny: (viewId: string, ref: AnyNodeRef, x: number, y: number) => void;
  updateViewNodePositionsAny: (
    viewId: string,
    updates: Array<{ ref: AnyNodeRef; x: number; y: number }>
  ) => void;
  updateViewNodeLayoutAny: (
    viewId: string,
    ref: AnyNodeRef,
    patch: Partial<Omit<ViewNodeLayout, 'elementId' | 'connectorId' | 'objectId'>>
  ) => void;
};

/**
 * Basic CRUD operations for view layout nodes.
 *
 * This module intentionally contains no layout algorithms — it is a thin wrapper over mutations.
 */
export const createLayoutCrudOps = (deps: Pick<LayoutOpsDeps, 'updateModel'>): LayoutCrudOps => {
  const { updateModel } = deps;

  const addElementToViewAt = (viewId: string, elementId: string, x: number, y: number): string => {
    let result = elementId;
    updateModel((model) => {
      result = layoutMutations.addElementToViewAt(model, viewId, elementId, x, y);
    });
    return result;
  };

  const addConnectorToViewAt = (viewId: string, connectorId: string, x: number, y: number): string => {
    let result = connectorId;
    updateModel((model) => {
      result = layoutMutations.addConnectorToViewAt(model, viewId, connectorId, x, y);
    });
    return result;
  };

  const removeElementFromView = (viewId: string, elementId: string): void => {
    updateModel((model) => layoutMutations.removeElementFromView(model, viewId, elementId));
  };

  const updateViewNodePosition = (viewId: string, elementId: string, x: number, y: number): void => {
    updateModel((model) => layoutMutations.updateViewNodePosition(model, viewId, elementId, x, y));
  };

  const updateViewNodePositionAny = (viewId: string, ref: AnyNodeRef, x: number, y: number): void => {
    updateModel((model) => layoutMutations.updateViewNodePositionAny(model, viewId, ref, x, y));
  };

  const updateViewNodePositionsAny = (
    viewId: string,
    updates: Array<{ ref: AnyNodeRef; x: number; y: number }>
  ): void => {
    updateModel((model) => layoutMutations.updateViewNodePositionsAny(model, viewId, updates));
  };

  const updateViewNodeLayoutAny = (
    viewId: string,
    ref: AnyNodeRef,
    patch: Partial<Omit<ViewNodeLayout, 'elementId' | 'connectorId' | 'objectId'>>
  ): void => {
    updateModel((model) => layoutMutations.updateViewNodeLayoutAny(model, viewId, ref, patch));
  };

  return {
    addElementToViewAt,
    addConnectorToViewAt,
    removeElementFromView,
    updateViewNodePosition,
    updateViewNodePositionAny,
    updateViewNodePositionsAny,
    updateViewNodeLayoutAny,
  };
};
