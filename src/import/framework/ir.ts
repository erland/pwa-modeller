/**
 * Canonical Intermediate Representation (IR) for imports.
 *
 * All importers (MEFF, XMI, JSON, etc.) should translate their source format into this
 * format-agnostic shape. A later step will apply this IR to the app's domain/store.
 *
 * Design goals:
 * - Keep it broadly compatible across formats.
 * - Preserve source identifiers via `externalIds` to enable future merge/sync.
 * - Allow partial fidelity (e.g. some formats may not include `views` or geometry).
 */

export type IRId = string;

export type IRExternalId = {
  /**
   * Optional system identifier, e.g. "sparx-ea", "archi", "bizzdesign", "xmi".
   * Keep stable if possible; used for future merges.
   */
  system?: string;
  /** The external identifier value in that system. */
  id: string;
  /**
   * Optional discriminator for what the id refers to in the source system
   * (e.g. "element", "relationship", "diagram", "package").
   */
  kind?: string;
};

export type IRTaggedValue = {
  key: string;
  value: string;
};

/**
 * Small geometry primitives used by views.
 */
export type IRPoint = { x: number; y: number };

export type IRBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg?: number;
};

/**
 * Folder / package / group organization.
 * Use `parentId` to form a tree (null/undefined means root).
 */
export type IRFolder = {
  id: IRId;
  name: string;
  parentId?: IRId | null;

  /** Optional documentation/notes. */
  documentation?: string;

  /** Arbitrary properties from the source (stringly typed to keep IR simple). */
  properties?: Record<string, string>;

  taggedValues?: IRTaggedValue[];
  externalIds?: IRExternalId[];

  /** Free-form metadata; avoid putting large blobs here. */
  meta?: Record<string, unknown>;
};

/**
 * A model element (concept).
 * `type` is intentionally stringly typed to allow multiple modelling languages.
 * Importers should store the most specific source type string they have.
 */
export type IRElement = {
  id: IRId;

  /** Source or canonical type string (e.g. "BusinessActor", "ApplicationComponent"). */
  type: string;

  name: string;
  documentation?: string;

  /**
   * Optional folder reference for organization.
   * If omitted, element is considered at model root.
   */
  folderId?: IRId | null;

  /**
   * Optional semantic containment reference (element-in-element).
   * If present, this indicates the element is owned/contained by another element.
   * Importers should only set this when the source format has a clear
   * containment/ownership concept (e.g. BPMN SubProcess containing flow nodes).
   */
  parentElementId?: IRId | null;

  properties?: Record<string, string>;
  taggedValues?: IRTaggedValue[];
  externalIds?: IRExternalId[];

  /**
   * Optional element-specific attributes.
   * Used by some importers (e.g. BPMN semantic attributes, UML ownership hints).
   */
  attrs?: unknown;
  meta?: Record<string, unknown>;
};

/**
 * A relationship/connector between elements.
 * `type` is stringly typed for the same reason as elements.
 */
export type IRRelationship = {
  id: IRId;

  /** Source or canonical type string (e.g. "Assignment", "Flow"). */
  type: string;

  name?: string;
  documentation?: string;

  sourceId: IRId;
  targetId: IRId;

  properties?: Record<string, string>;
  taggedValues?: IRTaggedValue[];
  externalIds?: IRExternalId[];

  /**
   * Optional relationship-specific attributes.
   * Used by some importers (e.g. UML association end attributes).
   */
  attrs?: unknown;
  meta?: Record<string, unknown>;
};

/**
 * A view (diagram).
 * Many formats store diagram-specific nodes/edges with geometry, styles, and labels.
 * If a format has no view concept, `views` may be omitted entirely.
 */
export type IRView = {
  id: IRId;
  name: string;
  documentation?: string;

  folderId?: IRId | null;

  /**
   * Optional viewpoint / diagram type label (e.g. "Layered", "Application", "Motivation").
   * Keep stringly typed to avoid locking to a specific viewpoint taxonomy.
   */
  viewpoint?: string;

  nodes: IRViewNode[];
  connections: IRViewConnection[];

  properties?: Record<string, string>;
  taggedValues?: IRTaggedValue[];
  externalIds?: IRExternalId[];
  meta?: Record<string, unknown>;
};

export type IRViewNodeKind =
  | 'element'
  | 'group'
  | 'note'
  | 'image'
  | 'shape'
  | 'other';

/**
 * Diagram node / view object.
 * If it represents a model element, `elementId` should be set.
 */
export type IRViewNode = {
  id: IRId;
  kind: IRViewNodeKind;

  /** Optional reference to a model element. */
  elementId?: IRId;

  /** Optional parent node for grouping / nesting. */
  parentNodeId?: IRId | null;

  /** Optional label override. */
  label?: string;

  bounds?: IRBounds;

  /**
   * Optional diagram-specific style properties (stringly typed).
   * Example: { "fill": "#fff", "stroke": "#000", "fontSize": "12" }
   */
  style?: Record<string, string>;

  properties?: Record<string, string>;
  taggedValues?: IRTaggedValue[];
  externalIds?: IRExternalId[];
  meta?: Record<string, unknown>;
};

/**
 * Diagram connection. If it represents a model relationship, set `relationshipId`.
 * If the source format doesn't provide explicit node ids, importers may reference
 * element ids and the apply step can resolve node endpoints.
 */
export type IRViewConnection = {
  id: IRId;

  relationshipId?: IRId;

  /** Node endpoints when available. */
  sourceNodeId?: IRId;
  targetNodeId?: IRId;

  /** Alternative endpoints if the format only references elements. */
  sourceElementId?: IRId;
  targetElementId?: IRId;

  label?: string;

  /** Optional routing points (bendpoints). */
  points?: IRPoint[];

  style?: Record<string, string>;

  properties?: Record<string, string>;
  taggedValues?: IRTaggedValue[];
  externalIds?: IRExternalId[];
  meta?: Record<string, unknown>;
};

/**
 * Top-level IR container.
 * `views` is optional; importers that don't support views can omit it.
 */
export type IRModel = {
  folders: IRFolder[];
  elements: IRElement[];
  relationships: IRRelationship[];
  views?: IRView[];

  meta?: {
    /** Format label (e.g. "archimate-meff", "xmi"). */
    format?: string;
    /** Exporting tool label (e.g. "Sparx EA"). */
    tool?: string;
    toolVersion?: string;
    exportedAtIso?: string;
    importedAtIso?: string;
    [key: string]: unknown;
  };
};
