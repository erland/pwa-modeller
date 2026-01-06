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

// NOTE: This is a pragmatic subset to start with. Add more as needed.
export type ElementType =
  // Strategy / Motivation
  | 'Capability'
  | 'CourseOfAction'
  | 'Resource'
  | 'Outcome'
  | 'Goal'
  | 'Requirement'
  // Business
  | 'BusinessActor'
  | 'BusinessRole'
  | 'BusinessProcess'
  | 'BusinessFunction'
  | 'BusinessService'
  | 'Product'
  // Application
  | 'ApplicationComponent'
  | 'ApplicationFunction'
  | 'ApplicationService'
  | 'DataObject'
  // Technology / Physical
  | 'Node'
  | 'Device'
  | 'SystemSoftware'
  | 'TechnologyService'
  | 'Artifact'
  | 'Facility'
  | 'Equipment'
  // Implementation & Migration
  | 'WorkPackage'
  | 'Deliverable'
  | 'Plateau'
  | 'Gap';

// NOTE: Also a pragmatic subset for the MVP foundation.
export type RelationshipType =
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

export interface Element {
  id: string;
  name: string;
  description?: string;
  layer: ArchimateLayer;
  type: ElementType;
  documentation?: string;
}

export interface Relationship {
  id: string;
  sourceElementId: string;
  targetElementId: string;
  type: RelationshipType;
  name?: string;
  description?: string;
}

export interface Viewpoint {
  /** Stable identifier (e.g. "layered", "capability-map"). */
  id: string;
  name: string;
  description?: string;
  allowedElementTypes: ElementType[];
  allowedRelationshipTypes: RelationshipType[];
}

// Diagram placeholders (layout for nodes and connections; we keep it intentionally simple for now)
export interface ViewNodeLayout {
  elementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** View-specific emphasis flag (does not change the underlying element). */
  highlighted?: boolean;
  /** View-specific style tag badge (does not change the underlying element). */
  styleTag?: string;
  /** Optional label offset (relative to default position) for the node's text. */
  label?: LabelOffset;
  /** Optional stacking order (higher renders on top). */
  zIndex?: number;
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

export interface View {
  id: string;
  name: string;
  viewpointId: string;
  description?: string;
  documentation?: string;
  stakeholders?: string[];
  formatting?: ViewFormatting;

  /** If set, the view is nested under (and conceptually centered around) this element in the navigator. */
  centerElementId?: string;

  layout?: ViewLayout;
}

export interface ModelMetadata {
  name: string;
  description?: string;
  version?: string;
  owner?: string;
}

export type FolderKind = 'root' | 'elements' | 'views' | 'custom';

export interface Folder {
  id: string;
  name: string;
  kind: FolderKind;
  parentId?: string;
  folderIds: string[];
  elementIds: string[];
  relationshipIds: string[];
  viewIds: string[];
}

export interface Model {
  id: string;
  metadata: ModelMetadata;
  elements: Record<string, Element>;
  relationships: Record<string, Relationship>;
  views: Record<string, View>;
  folders: Record<string, Folder>;
  /** Optional schema version for migrations in the future. */
  schemaVersion?: number;
}
