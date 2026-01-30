/**
 * Core domain model types for the EA modeling tool (ArchiMate 3.2 oriented).
 *
 * This is intentionally a *foundation* that can be extended later (rules, viewpoint constraints,
 * diagram layout details, etc.).
 */

export type ArchimateLayer =
  | 'Strategy'
  | 'Business'
  | 'Application'
  | 'Technology'
  | 'Physical'
  | 'ImplementationMigration'
  | 'Motivation';

/**
 * Notation / modeling language used in a view.
 *
 * Today the app is ArchiMate-centric, but we keep this extensible so the
 * model can later include UML/BPMN views as separate diagram kinds.
 */
export type ModelKind = 'archimate' | 'uml' | 'bpmn';

/**
 * Qualified type ids for non-ArchiMate notations.
 *
 * We keep ArchiMate as plain type names (e.g. "ApplicationComponent") for backward compatibility,
 * while allowing UML/BPMN to use qualified ids like "uml.class" or "bpmn.task".
 */
export type QualifiedNotation = Exclude<ModelKind, 'archimate'>;
export type QualifiedElementType = `${QualifiedNotation}.${string}`;
export type QualifiedRelationshipType = `${QualifiedNotation}.${string}`;

/**
 * A reference to an object that lives in a view/model of a given notation.
 * Used for cross-diagram drill-down and traceability (e.g. ArchiMate element -> UML/BPMN view).
 */
export type Ref = { kind: ModelKind; id: string };

export interface UnknownTypeInfo {
  /** e.g. "archimate-exchange", "ea-xmi", "custom" */
  ns?: string;
  /** original type name from imported file */
  name: string;
}


// NOTE: This is a pragmatic subset to start with. Add more as needed.
export type KnownElementType =
  // Strategy
  | 'Capability'
  | 'CourseOfAction'
  | 'Resource'
  | 'Outcome'
  | 'ValueStream'
  // Motivation
  | 'Stakeholder'
  | 'Driver'
  | 'Assessment'
  | 'Constraint'
  | 'Principle'
  | 'Value'
  | 'Meaning'
  | 'Goal'
  | 'Requirement'
  // Business
  | 'BusinessActor'
  | 'BusinessRole'
  | 'BusinessCollaboration'
  | 'BusinessInterface'
  | 'BusinessProcess'
  | 'BusinessFunction'
  | 'BusinessInteraction'
  | 'BusinessEvent'
  | 'BusinessService'
  | 'BusinessObject'
  | 'Contract'
  | 'Representation'
  | 'Product'
  // Application
  | 'ApplicationComponent'
  | 'ApplicationCollaboration'
  | 'ApplicationInterface'
  | 'ApplicationProcess'
  | 'ApplicationFunction'
  | 'ApplicationInteraction'
  | 'ApplicationEvent'
  | 'ApplicationService'
  | 'DataObject'
  // Technology
  | 'Node'
  | 'Device'
  | 'SystemSoftware'
  | 'TechnologyCollaboration'
  | 'TechnologyInterface'
  | 'TechnologyProcess'
  | 'TechnologyFunction'
  | 'TechnologyInteraction'
  | 'TechnologyEvent'
  | 'TechnologyService'
  | 'Path'
  | 'CommunicationNetwork'
  | 'Artifact'
  // Physical
  | 'Facility'
  | 'Equipment'
  | 'DistributionNetwork'
  | 'Material'
  // Implementation & Migration
  | 'WorkPackage'
  | 'ImplementationEvent'
  | 'Deliverable'
  | 'Plateau'
  | 'Gap'
  // Composite (cross-layer)
  | 'Location'
  | 'Grouping';

export type ElementType = KnownElementType | 'Unknown' | QualifiedElementType;


// NOTE: Also a pragmatic subset for the MVP foundation.
export type KnownRelationshipType =
  | 'Association'
  | 'Realization'
  | 'Serving'
  | 'Flow'
  | 'Composition'
  | 'Aggregation'
  | 'Assignment'
  | 'Access'
  | 'Influence'
  | 'Triggering'
  | 'Specialization';

export type RelationshipType = KnownRelationshipType | 'Unknown' | QualifiedRelationshipType;



export type AccessType = 'Access' | 'Read' | 'Write' | 'ReadWrite';

export interface RelationshipAttributes {
  /** Only meaningful when relationship.type === 'Access'. */
  accessType?: AccessType;

  /** Only meaningful when relationship.type === 'Association'. */
  isDirected?: boolean;

  /** Only meaningful when relationship.type === 'Influence'. */
  influenceStrength?: string;
}


export type LabelOffset = {
  dx: number;
  dy: number;
};

/** Label placement along a relationship polyline (t in [0..1]) plus pixel offset. */
export type RelationshipLabelPlacement = {
  t: number;
  dx: number;
  dy: number;
};

/**
 * Generic tagged values / properties bag.
 *
 * - Designed for lossless import/export (e.g. tool/vendor extensions, extra attributes).
 * - Stored as an ordered array to preserve user intent and reduce JSON diff noise.
 * - Values are stored as strings for simple persistence; `type` guides UI/validation.
 */
export type TaggedValueType = 'string' | 'number' | 'boolean' | 'json';

export interface TaggedValue {
  /** Stable id for UI operations (edit/delete/reorder). */
  id: string;

  /** Optional namespace to avoid collisions across sources/tools. */
  ns?: string;

  /** Key/name of the property. */
  key: string;

  /** Declared type for UI rendering + optional validation. */
  type?: TaggedValueType;

  /**
   * Canonical string value.
   * - type=number: "123.45"
   * - type=boolean: "true" | "false"
   * - type=json: JSON string
   */
  value: string;
}

export interface HasTaggedValues {
  taggedValues?: TaggedValue[];
}

/**
 * External identifier mapping used for stable import/export round-trips and merges.
 *
 * - `system` identifies the source format/tool (e.g. "archimate-exchange", "ea-xmi").
 * - `scope` is an optional discriminator (e.g. model/package/file id) to avoid collisions.
 */
export interface ExternalIdRef {
  /** Format/tool namespace, e.g. "archimate-exchange", "ea-xmi". */
  system: string;
  /** Identifier inside that system (XML id, UUID, xmi:id, etc.). */
  id: string;
  /** Optional discriminator to avoid collisions across different sources. */
  scope?: string;
}

export interface HasExternalIds {
  externalIds?: ExternalIdRef[];
}

export type ConnectorType = 'AndJunction' | 'OrJunction';

export interface RelationshipConnector extends HasTaggedValues, HasExternalIds {
  id: string;
  type: ConnectorType;
  /** Optional label; usually empty for junctions. */
  name?: string;
  documentation?: string;
}

// ------------------------------------
// View-only (diagram) objects
// ------------------------------------

/**
 * View-local objects used only for diagram presentation.
 *
 * These are NOT ArchiMate model concepts and should not appear in `model.elements`.
 * They live inside a `View`.
 */
export type ViewObjectType = 'Note' | 'Label' | 'GroupBox' | 'Divider';

export type ViewObjectTextAlign = 'left' | 'center' | 'right';

export interface ViewObjectStyle {
  fill?: string;
  stroke?: string;
  textAlign?: ViewObjectTextAlign;
}

export interface ViewObject {
  id: string;
  type: ViewObjectType;
  /** Optional title/name (useful for GroupBox). */
  name?: string;
  /** Primary text content (used by Note/Label). */
  text?: string;
  /** Optional view-local styling. Keep intentionally small for now. */
  style?: ViewObjectStyle;
}

export interface Element extends HasTaggedValues, HasExternalIds {
  id: string;
  /** Optional semantic kind; if omitted, inferred from `type` (defaults to 'archimate'). */
  kind?: ModelKind;
  name: string;
  /** ArchiMate-only. For UML/BPMN elements this is typically undefined. */
  layer?: ArchimateLayer;
  type: ElementType;
  /** Present only when type === 'Unknown'. */
  unknownType?: UnknownTypeInfo;
  /** Notation-specific attributes (notation-defined shape, e.g. UML members). */
  attrs?: unknown;
  documentation?: string;
}

export interface Relationship extends HasTaggedValues, HasExternalIds {
  id: string;
  /** Optional semantic kind; if omitted, inferred from `type` (defaults to 'archimate'). */
  kind?: ModelKind;
  /** Exactly one of sourceElementId / sourceConnectorId must be set. */
  sourceElementId?: string;
  sourceConnectorId?: string;
  /** Exactly one of targetElementId / targetConnectorId must be set. */
  targetElementId?: string;
  targetConnectorId?: string;
  type: RelationshipType;
  /** Present only when type === 'Unknown'. */
  unknownType?: UnknownTypeInfo;
  name?: string;
  documentation?: string;
  /** Notation-specific attributes (ArchiMate uses RelationshipAttributes). */
  attrs?: unknown;
}

export interface Viewpoint {
  /** Stable identifier (e.g. "layered", "capability-map"). */
  id: string;
  name: string;
  /** Optional summary shown in viewpoint pickers. */
  description?: string;
  allowedElementTypes: ElementType[];
  allowedRelationshipTypes: RelationshipType[];
}

// Diagram placeholders (layout for nodes and connections; we keep it intentionally simple for now)
export interface ViewNodeLayout {
  /** Exactly one of elementId / connectorId / objectId must be set. */
  elementId?: string;
  connectorId?: string;
  /** View-local diagram object id (e.g. Note/Label/GroupBox). */
  objectId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** View-specific emphasis flag (does not change the underlying element). */
  highlighted?: boolean;
  /** View-specific style tag badge (does not change the underlying element). */
  styleTag?: string;
  /** If true, this node is locked/pinned in the view and should not move during auto-layout. */
  locked?: boolean;
  /** Optional label offset (relative to default position) for the node's text. */
  label?: LabelOffset;
  /** Optional stacking order (higher renders on top). */
  zIndex?: number;

  /**
   * Optional notation-specific attributes for this node *instance in the view*.
   *
   * Example: UML view-local presentation flags (collapsed/show compartments) can live here.
   */
  attrs?: unknown;
}

export interface ViewRelationshipLayout {
  relationshipId: string;
  /** Optional polyline points for routing. */
  points?: Array<{ x: number; y: number }>;

  /** Optional label placement for the relationship. */
  label?: RelationshipLabelPlacement;
  /** Optional stacking order (higher renders on top). */
  zIndex?: number;
}

// ------------------------------------
// ViewConnections (per-view relationship instances)
// ------------------------------------

export type ViewConnectionRouteKind = 'orthogonal' | 'straight';

/** View-only hint for how the auto-router should attach a connection to a node. */
export type ViewConnectionAnchorSide = 'auto' | 'left' | 'right' | 'top' | 'bottom';

export interface ViewConnectionRoute {
  kind: ViewConnectionRouteKind;
}

export type ViewConnectionEndpointKind = 'element' | 'connector';

/**
 * A reference to what a connection endpoint attaches to *in this view*.
 *
 * Note: This is intentionally view-oriented (not semantic-relationship oriented) to
 * support future features like duplicate element nodes per view.
 */
export interface ViewConnectionEndpointRef {
  kind: ViewConnectionEndpointKind;
  /** Element id or connector id depending on kind. */
  id: string;
}

/**
 * A view-specific instance of a semantic `Relationship`.
 *
 * This is where we store diagram presentation details for the relationship, such as
 * routing style (straight/orthogonal/curved), bendpoints, label placement, etc.
 */
export interface ViewConnection {
  id: string;
  /** Owning view id (redundant if stored inside the view, but helpful for indexing/debugging). */
  viewId: string;
  /** Semantic relationship id in the model. */
  relationshipId: string;

  source: ViewConnectionEndpointRef;
  target: ViewConnectionEndpointRef;

  route: ViewConnectionRoute;

  /** Optional endpoint anchoring hints for the auto-router (view-only). */
  sourceAnchor?: ViewConnectionAnchorSide;
  targetAnchor?: ViewConnectionAnchorSide;

  /** Optional polyline points for routing (future: user-edited bendpoints). */
  points?: Array<{ x: number; y: number }>;

  /** Optional label placement for the connection. */
  label?: RelationshipLabelPlacement;

  /** Optional stacking order (higher renders on top). */
  zIndex?: number;
}

export interface ViewFormatting {
  /** Optional per-layer default styling (e.g. tag badge). */
  layerStyleTags?: Partial<Record<ArchimateLayer, string>>;
  /** When moving nodes, snap to grid. */
  snapToGrid?: boolean;
  /** Grid size in pixels for snapping. */
  gridSize?: number;
}

export interface ViewLayout {
  nodes: ViewNodeLayout[];
  relationships: ViewRelationshipLayout[];
}

export interface View extends HasTaggedValues, HasExternalIds {
  id: string;
  name: string;
  /** Diagram notation / language for this view (e.g. ArchiMate, UML, BPMN). */
  kind: ModelKind;

  /**
   * Optional relationship visibility mode for this view.
   *
   * - implicit (default): render all model relationships whose endpoints exist as nodes in the view
   * - explicit: render only the relationship ids explicitly listed
   */
  relationshipVisibility?:
    | {
        mode: 'implicit';
      }
    | {
        mode: 'explicit';
        relationshipIds: string[];
      };
  /**
   * Optional cross-diagram reference describing what this view is a drill-down/detail view for.
   * Example: A BPMN view may have ownerRef pointing to an ArchiMate Business Process.
   */
  ownerRef?: Ref;
  viewpointId: string;
  documentation?: string;
  stakeholders?: string[];
  formatting?: ViewFormatting;

  /**
   * View-specific relationship instances (routing, bendpoints, label placement, etc.).
   *
   * v8+: always present (default empty array).
   */
  connections: ViewConnection[];

  /** View-local diagram objects (notes/labels/group boxes, etc.). */
  objects?: Record<string, ViewObject>;

  layout?: ViewLayout;
}

export interface ModelMetadata {
  name: string;
  description?: string;
  version?: string;
  owner?: string;
}

export type FolderKind = 'root' | 'elements' | 'views' | 'custom';

export interface Folder extends HasTaggedValues, HasExternalIds {
  id: string;
  name: string;
  kind: FolderKind;
  parentId?: string;
  folderIds: string[];
  elementIds: string[];
  relationshipIds: string[];
  viewIds: string[];
}

export interface Model extends HasTaggedValues, HasExternalIds {
  id: string;
  metadata: ModelMetadata;
  elements: Record<string, Element>;
  relationships: Record<string, Relationship>;
  connectors?: Record<string, RelationshipConnector>;
  views: Record<string, View>;
  folders: Record<string, Folder>;
  /** Optional schema version for migrations in the future. */
  schemaVersion?: number;
}
