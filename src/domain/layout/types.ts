export type LayoutDirection = 'RIGHT' | 'DOWN';

export type EdgeRoutingStyle = 'POLYLINE' | 'ORTHOGONAL';

export type AutoLayoutScope = 'all' | 'selection';

// High-level layout style presets (wiring to algorithms happens in later steps).
export type LayoutPreset = 'flow' | 'tree' | 'network' | 'radial' | 'flow_bands';

// Arrange / alignment utilities.
export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export type DistributeMode = 'horizontal' | 'vertical';

export type SameSizeMode = 'width' | 'height' | 'both';

export interface AutoLayoutOptions {
  /**
   * High-level preset for auto layout.
   * Step 1 introduces the API + UI selector; later steps wire this to different ELK algorithms.
   */
  preset?: LayoutPreset;

  /**
   * Layout direction for layered layouts.
   * - RIGHT: left-to-right
   * - DOWN: top-to-bottom
   */
  direction?: LayoutDirection;

  /**
   * Desired minimum spacing between nodes (in view coordinates/pixels).
   * Implementation may use this as a hint.
   */
  spacing?: number;

  /**
   * Preferred edge routing style. (Your diagram router can still re-route after layout.)
   */
  edgeRouting?: EdgeRoutingStyle;

  /**
   * Scope of auto layout. If 'selection' is requested but the caller does not supply
   * selection context, implementations may treat it as 'all'.
   */
  scope?: AutoLayoutScope;

  /**
   * If true, nodes marked as locked/pinned should not be moved by the layout engine.
   */
  respectLocked?: boolean;

  /**
   * If true and the caller provides selection context, selected nodes will be treated
   * as locked for this layout run (without permanently mutating the view).
   */
  lockSelection?: boolean;
}

/**
 * Notation-agnostic layout input model.
 *
 * This is intentionally richer than what we currently feed into ELK so we can
 * evolve toward full BPMN/UML support (containers, ports/anchors, etc.) without
 * changing the pipeline API again.
 */

export type LayoutPortSide = 'N' | 'E' | 'S' | 'W';

export interface LayoutPortHint {
  /** Stable port id within the node (notation-specific). */
  id: string;
  /** Preferred side for routing/anchors. */
  side?: LayoutPortSide;
}

export interface LayoutNode {
  id: string;
  width: number;
  height: number;

  /**
   * If true, the node should be treated as fixed (not moved) by the layout algorithm.
   * We currently enforce this in a post-pass (respectLocked).
   */
  locked?: boolean;

  /** Optional parent container id (e.g., BPMN lane/pool, UML package). */
  parentId?: string;

  /** Optional label/debug metadata (not used by ELK adapter today). */
  label?: string;

  /**
   * Optional grouping key (e.g., swimlane, package, layer group).
   * This is currently used by ArchiMate to group by layer.
   */
  groupId?: string;

  /**
   * Optional hint for layered/grouped layouts (e.g., 'Business'|'Application'|'Technology').
   * This is currently used by ArchiMate.
   */
  layerHint?: string;

  /** Optional notation-specific node kind (e.g., 'bpmn.task', 'uml.class'). */
  kind?: string;

  /** Optional ports/anchor hints for edge routing quality. */
  ports?: LayoutPortHint[];
}

export interface LayoutEdge {
  id: string;
  sourceId: string;
  targetId: string;

  /** Optional port ids on the source/target node. */
  sourcePortId?: string;
  targetPortId?: string;

  /** Optional weight/priority (higher means "more important" for the layout). */
  weight?: number;

  /** Optional notation-specific edge kind (e.g., 'bpmn.sequenceFlow', 'uml.generalization'). */
  kind?: string;
}

export interface LayoutGroup {
  /**
   * Group/container id.
   * For hierarchical layouts, groups can be represented via LayoutNode.parentId as well.
   */
  id: string;
  parentId?: string;
  padding?: number;
  direction?: LayoutDirection;
}

export interface LayoutGraphInput {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  /** Optional group metadata (not consumed by ELK adapter yet). */
  groups?: LayoutGroup[];
}

export interface LayoutGraphOutput {
  positions: Record<string, { x: number; y: number }>;
  /** Optional edge routing/bend points for future use. */
  edgeRoutes?: Record<string, { points: Array<{ x: number; y: number }> }>;
}

// Back-compat aliases (older code uses the *Input names).
export type LayoutNodeInput = LayoutNode;
export type LayoutEdgeInput = LayoutEdge;
export type LayoutInput = LayoutGraphInput;
export type LayoutOutput = LayoutGraphOutput;
