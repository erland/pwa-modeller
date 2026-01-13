import type * as React from 'react';
import type { Element, ModelKind, RelationshipValidationMode, ViewNodeLayout } from '../domain';
import type { RelationshipStyle } from '../diagram/relationships/style';

export type GuardResult = { allowed: true } | { allowed: false; reason?: string };

/**
 * Notation-specific behavior registry.
 */
export type Notation = {
  kind: ModelKind;

  /**
   * UI helper: determine which background CSS variable to use for a given node type.
   *
   * The node type is a string so each notation (ArchiMate/UML/BPMN) can define its own type IDs.
   */
  getElementBgVar: (nodeType: string) => string;

  /** Render a small notation-specific node symbol (e.g. ArchiMate icon, UML stereotype marker). */
  renderNodeSymbol: (args: { nodeType: string; title: string }) => React.ReactNode;

  /**
   * Optional: render the *full* inner content of a node.
   *
   * When provided, DiagramNode will use this instead of its default (ArchiMate-oriented) header/meta layout.
   * This is useful for UML/BPMN where node shapes have their own internal structure (e.g. compartments).
   */
  renderNodeContent?: (args: { element: Element; node: ViewNodeLayout }) => React.ReactNode;

  /**
   * Relationship visual styling (markers, dash patterns, optional mid labels).
   * Returned style is selection-agnostic; renderers can apply selected variants.
   */
  getRelationshipStyle: (rel: { type: string; attrs?: unknown }) => RelationshipStyle;

  /** Guard: whether a node of the given type can be placed/created in this notation. */
  canCreateNode: (args: { nodeType: string }) => boolean;

  /** Guard: whether a relationship of the given type can be created between two semantic types. */
  canCreateRelationship: (args: {
    relationshipType: string;
    sourceType?: string;
    targetType?: string;
    mode?: RelationshipValidationMode;
  }) => GuardResult;
};
