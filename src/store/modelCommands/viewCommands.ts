import type {
  Folder,
  ModelKind,
  Model,
  View,
  ViewFormatting,
  ViewNodeLayout,
  ViewObject,
  ViewObjectType,
  ViewConnectionRouteKind,
  ViewConnectionAnchorSide,
} from '../../domain';
import type { AlignMode, AutoLayoutOptions, DistributeMode, SameSizeMode } from '../../domain/layout/types';
import { createView, VIEWPOINTS } from '../../domain';
import { viewMutations, layoutMutations } from '../mutations';
import type { TaggedValueInput } from '../mutations/helpers';
import type { ModelStoreState } from '../modelStoreTypes';
import type { ModelStoreWiring } from '../modelStoreWiring';

export type ViewCommandsContext = {
  ops: ModelStoreWiring['ops'];
  getState: () => ModelStoreState;
  setState: (next: Partial<ModelStoreState>) => void;
  updateModel: (mutator: (model: Model) => void, markDirty?: boolean) => void;
  runInTransaction: <T>(fn: () => T) => T;
  runInTransactionAsync: <T>(fn: () => Promise<T>) => Promise<T>;
};

function collectElementIdsInFolder(model: Model, folderId: string): string[] {
const seen = new Set<string>();
const out: string[] = [];
const stack = [folderId];
while (stack.length) {
  const fid = stack.pop()!;
  if (seen.has(fid)) continue;
  seen.add(fid);
  const f = model.folders[fid];
  if (!f) continue;
  for (const id of f.elementIds ?? []) out.push(id);
  for (const childId of f.folderIds ?? []) stack.push(childId);
}
return out;
}

function inferKindFromElementIds(model: Model, elementIds: string[]): ModelKind {
// Heuristic:
// - If all element types are qualified and share a prefix, pick that notation.
// - Otherwise fall back to ArchiMate.
const types = elementIds
  .map((id) => model.elements[id]?.type)
  .filter(Boolean)
  .map((t) => String(t));
if (types.length === 0) return 'archimate';
const qualified = types.filter((t) => t.includes('.'));
if (qualified.length !== types.length) return 'archimate';
const allUml = qualified.every((t) => t.startsWith('uml.'));
if (allUml) return 'uml';
const allBpmn = qualified.every((t) => t.startsWith('bpmn.'));
if (allBpmn) return 'bpmn';
return 'archimate';
}

function defaultViewpointForKind(kind: ModelKind): string {
if (kind === 'uml') return VIEWPOINTS.find((v) => v.id === 'uml-class')?.id ?? 'uml-class';
if (kind === 'bpmn') return VIEWPOINTS.find((v) => v.id === 'bpmn-process')?.id ?? 'bpmn-process';
return VIEWPOINTS.find((v) => v.id === 'layered')?.id ?? 'layered';
}

function defaultAutoLayoutPresetForKind(kind: ModelKind): AutoLayoutOptions['preset'] {
if (kind === 'archimate') return 'flow_bands';
// BPMN/UML tend to look best with a simple layered flow.
return 'flow';
}

export function createViewCommands(ctx: ViewCommandsContext) {
  return {
    // -------------------------
    // Views
    // -------------------------

    addView: (view: View, folderId?: string): void => {
      ctx.runInTransaction(() => ctx.ops.viewOps.addView(view, folderId));
    },





    /**
     * Create a new view containing all elements within a folder (including subfolders),
     * then run auto layout to produce a reasonable initial diagram.
     */
    createViewFromFolderElements: async (
      folderId: string,
      options: {
        name?: string;
        kind?: ModelKind;
        viewpointId?: string;
        /** Where to place the created view. Defaults to the "Views" root folder when invoked from an elements folder. */
        targetFolderId?: string;
        autoLayout?: boolean;
        autoLayoutPreset?: AutoLayoutOptions['preset'];
      } = {}
    ): Promise<string> => {
      const model = ctx.getState().model;
      if (!model) throw new Error('No model loaded');
      const folder = model.folders[folderId];
      if (!folder) throw new Error(`Folder not found: ${folderId}`);

      const allElementIds = collectElementIdsInFolder(model, folderId);
      const kind = options.kind ?? inferKindFromElementIds(model, allElementIds);

      // Only include elements that match the view kind.
      const elementIds = allElementIds.filter((id) => {
        const t = String(model.elements[id]?.type ?? '');
        if (!t) return false;
        if (kind === 'archimate') return !t.includes('.');
        if (kind === 'uml') return t.startsWith('uml.');
        if (kind === 'bpmn') return t.startsWith('bpmn.');
        return true;
      });

      const baseName = (options.name ?? folder.name ?? 'Folder').trim() || 'Folder';
      const name = options.name?.trim() ? options.name.trim() : `View: ${baseName}`;
      const viewpointId = options.viewpointId ?? defaultViewpointForKind(kind);

      // Default placement: if invoked from a non-view folder (e.g. Elements), place the view under the "Views" root.
      const viewsRootId = (Object.values(model.folders) as Folder[]).find((f) => f.kind === 'views')?.id;
      const targetFolderId =
        options.targetFolderId ??
        (folder.kind === 'views' || folder.kind === 'custom' || folder.kind === 'root' ? folderId : (viewsRootId ?? folderId));

      const created = createView({ name, kind, viewpointId });

      ctx.updateModel((m) => {
        viewMutations.addView(m, created, targetFolderId);
        // Place all elements as nodes (fast bulk add) so auto layout has something to work with.
        layoutMutations.addElementsToView(m, created.id, elementIds);
      });

      const doLayout = options.autoLayout ?? true;
      if (doLayout) {
        const preset = options.autoLayoutPreset ?? defaultAutoLayoutPresetForKind(kind);
        await ctx.runInTransactionAsync(() => ctx.ops.layoutOps.autoLayoutView(created.id, { preset }));
      }

      return created.id;
    },


    /**
     * Add multiple elements (typically selected in the model navigator) to an existing view.
     * By default, triggers auto layout afterwards to make the diagram reasonable.
     */
    addElementsToViewFromNavigator: async (
      viewId: string,
      elementIds: string[],
      options: { autoLayout?: boolean; preset?: AutoLayoutOptions['preset'] } = {}
    ): Promise<void> => {
      const model = ctx.getState().model;
      if (!model) throw new Error('No model loaded');
      const view = model.views[viewId];
      if (!view) throw new Error(`View not found: ${viewId}`);

      const kind = view.kind as ModelKind;

      const filtered = (elementIds ?? []).filter((id) => {
        const t = String(model.elements[id]?.type ?? '');
        if (!t) return false;
        if (kind === 'archimate') return !t.includes('.');
        if (kind === 'uml') return t.startsWith('uml.');
        if (kind === 'bpmn') return t.startsWith('bpmn.');
        return true;
      });

      if (!filtered.length) return;

      ctx.updateModel((m) => {
        layoutMutations.addElementsToView(m, viewId, filtered);
      });

      // Ensure any newly-visible relationships/connectors are recomputed.
      ctx.runInTransaction(() => ctx.ops.viewOps.ensureViewConnections(viewId));

      const doLayout = options.autoLayout ?? true;
      if (doLayout) {
        const preset = options.preset ?? defaultAutoLayoutPresetForKind(kind);
        await ctx.runInTransactionAsync(() => ctx.ops.layoutOps.autoLayoutView(viewId, { preset }, filtered));
      }
    },

    updateView: (viewId: string, patch: Partial<Omit<View, 'id'>>): void => {
      ctx.runInTransaction(() => ctx.ops.viewOps.updateView(viewId, patch));
    },

    ensureViewConnections: (viewId: string): void => {
      ctx.runInTransaction(() => ctx.ops.viewOps.ensureViewConnections(viewId));
    },

    /**
     * If the target view uses explicit relationship visibility, include the given relationship id.
     * This is used to keep "explicit" views usable when creating relationships interactively.
     */
    includeRelationshipInView: (viewId: string, relationshipId: string): void => {
      ctx.runInTransaction(() => ctx.ops.viewOps.includeRelationshipInView(viewId, relationshipId));
    },

    /**
     * Hide a specific relationship in a view.
     *
     * If the view currently uses implicit relationship visibility, it will be
     * converted to explicit mode using the view's *current* visible relationships
     * as the starting allow-list.
     */
    hideRelationshipInView: (viewId: string, relationshipId: string): void => {
      ctx.runInTransaction(() => ctx.ops.viewOps.hideRelationshipInView(viewId, relationshipId));
    },

    /**
     * Show (include) a specific relationship in a view that uses explicit visibility.
     *
     * If the view currently uses implicit relationship visibility, it will be
     * converted to explicit mode using the view's *current* visible relationships
     * as the starting allow-list.
     */
    showRelationshipInView: (viewId: string, relationshipId: string): void => {
      ctx.runInTransaction(() => ctx.ops.viewOps.showRelationshipInView(viewId, relationshipId));
    },

    setViewConnectionRoute: (viewId: string, connectionId: string, kind: ViewConnectionRouteKind): void => {
      ctx.runInTransaction(() => ctx.ops.viewOps.setViewConnectionRoute(viewId, connectionId, kind));
    },

    setViewConnectionEndpointAnchors: (
      viewId: string,
      connectionId: string,
      patch: { sourceAnchor?: ViewConnectionAnchorSide; targetAnchor?: ViewConnectionAnchorSide }
    ): void => {
      ctx.runInTransaction(() => ctx.ops.viewOps.setViewConnectionEndpointAnchors(viewId, connectionId, patch));
    },

    upsertViewTaggedValue: (viewId: string, entry: TaggedValueInput): void => {
      ctx.runInTransaction(() => ctx.ops.viewOps.upsertViewTaggedValue(viewId, entry));
    },

    removeViewTaggedValue: (viewId: string, taggedValueId: string): void => {
      ctx.runInTransaction(() => ctx.ops.viewOps.removeViewTaggedValue(viewId, taggedValueId));
    },

    updateViewFormatting: (viewId: string, patch: Partial<ViewFormatting>): void => {
      ctx.runInTransaction(() => ctx.ops.viewOps.updateViewFormatting(viewId, patch));
    },

    /** Clone a view (including its layout) into the same folder as the original. Returns the new view id. */
    cloneView: (viewId: string): string | null => ctx.runInTransaction(() => ctx.ops.viewOps.cloneView(viewId)),

    deleteView: (viewId: string): void => {
      ctx.runInTransaction(() => ctx.ops.viewOps.deleteView(viewId));
    },

    // -------------------------
    // View-only (diagram) objects
    // -------------------------

    /** Add a view-local object to a view (and optionally a layout node). This does not touch the model element graph. */
    addViewObject: (viewId: string, obj: ViewObject, node?: ViewNodeLayout): void => {
      ctx.runInTransaction(() => ctx.ops.viewOps.addViewObject(viewId, obj, node));
    },

    /** Create a new view-local object and place it into the view at the given cursor position. Returns the object id. */
    createViewObjectInViewAt: (viewId: string, type: ViewObjectType, x: number, y: number): string =>
      ctx.runInTransaction(() => ctx.ops.viewOps.createViewObjectInViewAt(viewId, type, x, y)),

    updateViewObject: (viewId: string, objectId: string, patch: Partial<Omit<ViewObject, 'id'>>): void => {
      ctx.runInTransaction(() => ctx.ops.viewOps.updateViewObject(viewId, objectId, patch));
    },

    deleteViewObject: (viewId: string, objectId: string): void => {
      ctx.runInTransaction(() => ctx.ops.viewOps.deleteViewObject(viewId, objectId));
    },

    // -------------------------
    // Diagram layout (per view)
    // -------------------------

    updateViewNodeLayout: (viewId: string, elementId: string, patch: Partial<Omit<ViewNodeLayout, 'elementId'>>): void => {
      ctx.runInTransaction(() => ctx.ops.viewOps.updateViewNodeLayout(viewId, elementId, patch));
    },

    /** Adds an element to a view's layout as a positioned node (idempotent). */
    addElementToView: (viewId: string, elementId: string): string => ctx.runInTransaction(() => ctx.ops.viewOps.addElementToView(viewId, elementId)),

    addElementToViewAt: (viewId: string, elementId: string, x: number, y: number): string =>
      ctx.runInTransaction(() => ctx.ops.layoutOps.addElementToViewAt(viewId, elementId, x, y)),

    /** Adds a connector (junction) to a view at a specific position (idempotent). */
    addConnectorToViewAt: (viewId: string, connectorId: string, x: number, y: number): string =>
      ctx.runInTransaction(() => ctx.ops.layoutOps.addConnectorToViewAt(viewId, connectorId, x, y)),

    removeElementFromView: (viewId: string, elementId: string): void => {
      ctx.runInTransaction(() => ctx.ops.layoutOps.removeElementFromView(viewId, elementId));
    },

    updateViewNodePosition: (viewId: string, elementId: string, x: number, y: number): void => {
      ctx.runInTransaction(() => ctx.ops.layoutOps.updateViewNodePosition(viewId, elementId, x, y));
    },

    /** Updates position of an element-node, connector-node, or view-object node in a view. */
    updateViewNodePositionAny: (
      viewId: string,
      ref: { elementId?: string; connectorId?: string; objectId?: string },
      x: number,
      y: number
    ): void => {
      ctx.runInTransaction(() => ctx.ops.layoutOps.updateViewNodePositionAny(viewId, ref, x, y));
    },

    /**
     * Batch position update for multiple nodes (element/connector/object) in a view.
     *
     * This is primarily used for multi-select dragging, to avoid triggering a store update per node.
     */
    updateViewNodePositionsAny: (
      viewId: string,
      updates: Array<{ ref: { elementId?: string; connectorId?: string; objectId?: string }; x: number; y: number }>
    ): void => {
      ctx.runInTransaction(() => ctx.ops.layoutOps.updateViewNodePositionsAny(viewId, updates));
    },

    /** Updates layout properties on an element-node, connector-node, or view-object node in a view. */
    updateViewNodeLayoutAny: (
      viewId: string,
      ref: { elementId?: string; connectorId?: string; objectId?: string },
      patch: Partial<Omit<ViewNodeLayout, 'elementId' | 'connectorId' | 'objectId'>>
    ): void => {
      ctx.runInTransaction(() => ctx.ops.layoutOps.updateViewNodeLayoutAny(viewId, ref, patch));
    },

    /** Align element nodes in a view based on the current selection. */
    alignViewElements: (viewId: string, elementIds: string[], mode: AlignMode): void => {
      ctx.runInTransaction(() => ctx.ops.layoutOps.alignViewElements(viewId, elementIds, mode));
    },

    /** Distribute selected element nodes evenly within a view. */
    distributeViewElements: (viewId: string, elementIds: string[], mode: DistributeMode): void => {
      ctx.runInTransaction(() => ctx.ops.layoutOps.distributeViewElements(viewId, elementIds, mode));
    },

    /** Make selected element nodes the same size within a view. */
    sameSizeViewElements: (viewId: string, elementIds: string[], mode: SameSizeMode): void => {
      ctx.runInTransaction(() => ctx.ops.layoutOps.sameSizeViewElements(viewId, elementIds, mode));
    },

    /**
     * Resize selected ArchiMate element boxes so their visible text fits.
     *
     * Only applies to element-backed nodes in the given view.
     */
    fitViewElementsToText: (viewId: string, elementIds: string[]): void => {
      ctx.runInTransaction(() => ctx.ops.layoutOps.fitViewElementsToText(viewId, elementIds));
    },

    autoLayoutView: (viewId: string, options: AutoLayoutOptions = {}, selectionNodeIds?: string[]): Promise<void> =>
      ctx.runInTransactionAsync(() => ctx.ops.layoutOps.autoLayoutView(viewId, options, selectionNodeIds)),
  } satisfies Record<string, unknown>;
}

export type ViewCommands = ReturnType<typeof createViewCommands>;