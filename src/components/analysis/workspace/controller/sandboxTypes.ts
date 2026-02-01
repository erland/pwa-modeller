// Shared Sandbox state & action types.
// Kept separate from the hook implementation to improve separation of concerns.

export type SandboxNode = {
  elementId: string;
  x: number;
  y: number;
  pinned?: boolean;
};

export type SandboxRelationshipVisibilityMode = 'all' | 'types' | 'explicit';

export type SandboxAddRelatedDirection = 'both' | 'outgoing' | 'incoming';

export type SandboxInsertIntermediatesMode = 'shortest' | 'topk';

export type SandboxInsertIntermediatesOptions = {
  mode: SandboxInsertIntermediatesMode;
  k: number;
  maxHops: number;
  direction: SandboxAddRelatedDirection;

  /**
   * Optional allow-list of element ids to insert (typically chosen in a preview dialog).
   * When omitted, all computed intermediate elements are inserted.
   */
  allowedElementIds?: string[];
};

export type SandboxRelationshipsState = {
  show: boolean;
  mode: SandboxRelationshipVisibilityMode;
  /**
   * Enabled relationship type strings when mode === 'types'.
   * When empty, no relationships are shown.
   */
  enabledTypes: string[];

  /**
   * When mode === 'explicit', only relationship ids in this list are shown
   * (in addition to the global `show` toggle).
   */
  explicitIds: string[];
};

export type SandboxUiState = {
  /**
   * User-facing warning banner text (best-effort). Cleared on model change.
   */
  warning: string | null;
  /**
   * Hard cap to avoid UI freezes.
   */
  maxNodes: number;
  /**
   * Rendering cap for relationships (applied in the view layer).
   */
  maxEdges: number;
  /**
   * Optional sessionStorage persistence.
   */
  persistEnabled: boolean;

  /**
   * How relationships are rendered in the sandbox view.
   * This is purely visual and does not affect the model.
   */
  edgeRouting: 'straight' | 'orthogonal';

  /**
   * Element ids inserted by the most recent insert/add action (newly added only).
   * Used for one-click undo. Not persisted.
   */
  lastInsertedElementIds: string[];
};

export type SandboxState = {
  nodes: SandboxNode[];
  relationships: SandboxRelationshipsState;
  addRelated: {
    depth: number;
    direction: SandboxAddRelatedDirection;
    /**
     * Enabled relationship types used for traversal when adding related elements.
     * When empty, no related elements are added.
     */
    enabledTypes: string[];
  };
  ui: SandboxUiState;
};

export type SandboxActions = {
  setNodePosition: (elementId: string, x: number, y: number) => void;
  addIfMissing: (elementId: string, x?: number, y?: number) => void;
  addManyIfMissing: (elementIds: string[], baseX?: number, baseY?: number) => void;
  removeMany: (elementIds: string[]) => void;
  clear: () => void;

  /**
   * Removes the nodes added by the most recent insert/add action.
   */
  undoLastInsert: () => void;

  seedFromView: (viewId: string) => void;

  /**
   * Sandbox-only auto layout. Does not mutate the model.
   */
  autoLayout: () => void;

  setPersistEnabled: (enabled: boolean) => void;
  setEdgeRouting: (routing: 'straight' | 'orthogonal') => void;
  clearWarning: () => void;


  /**
   * Replace sandbox contents from an arbitrary element set (used by Step 8: open sandbox from analysis results).
   */
  seedFromElements: (args: {
    elementIds: string[];
    relationshipIds?: string[];
    relationshipTypes?: string[];
    layout?: {
      mode: 'grid' | 'distance' | 'levels';
      levelById?: Record<string, number>;
      orderById?: Record<string, number>;
    };
  }) => void;


  setShowRelationships: (show: boolean) => void;
  setRelationshipMode: (mode: SandboxRelationshipVisibilityMode) => void;
  setEnabledRelationshipTypes: (types: string[]) => void;
  setExplicitRelationshipIds: (relationshipIds: string[]) => void;
  toggleEnabledRelationshipType: (type: string) => void;

  setAddRelatedDepth: (depth: number) => void;
  setAddRelatedDirection: (direction: SandboxAddRelatedDirection) => void;
  setAddRelatedEnabledTypes: (types: string[]) => void;
  toggleAddRelatedEnabledType: (type: string) => void;
  /**
   * Adds related elements around the given anchor sandbox nodes.
   * When `allowedElementIds` is provided, no traversal is performed; the caller supplies the element set.
   */
  addRelatedFromSelection: (anchorElementIds: string[], allowedElementIds?: string[]) => void;

  insertIntermediatesBetween: (
    sourceElementId: string,
    targetElementId: string,
    options: SandboxInsertIntermediatesOptions
  ) => void;
};
