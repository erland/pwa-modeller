import type * as React from 'react';

import type { Element, Model, ModelKind, RelationshipValidationMode, ViewNodeLayout } from '../domain';
import type { ValidationIssue } from '../domain/validation/types';
import type { RelationshipStyle } from '../diagram/relationships/style';

import type { ModelActions } from '../components/model/properties/actions';
import type { PropertiesSection } from '../components/model/properties/common/PropertiesPanelHost';
import type { Selection } from '../components/model/selection';

export type GuardResult = { allowed: true } | { allowed: false; reason?: string };

export type TypeOption = { id: string; label: string };

/**
 * Notation-specific behavior registry.
 *
 * v1 contract goal: centralize catalogs, rules, properties UI hooks and notation validation,
 * so adding UML/BPMN doesn't turn into scattered kind checks.
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

  // ------------------------------
  // Notation plugin contract v1
  // ------------------------------

  /** Catalog of element types used for palette/type pickers. */
  getElementTypeOptions: () => TypeOption[];

  /** Catalog of relationship types used for palette/type pickers. */
  getRelationshipTypeOptions: () => TypeOption[];

  /** Provide notation-specific sections to be inserted into the element properties panel. */
  getElementPropertySections: (args: {
    model: Model;
    element: Element;
    actions: ModelActions;
    onSelect?: (selection: Selection) => void;
  }) => PropertiesSection[];

  /** Render the relationship properties panel for relationships of this notation. */
  renderRelationshipProperties: (args: {
    model: Model;
    relationshipId: string;
    viewId?: string;
    actions: ModelActions;
    onSelect?: (selection: Selection) => void;
  }) => React.ReactNode;

  /** Notation-specific validations. Should only emit issues relevant to this notation. */
  validateNotation: (args: {
    model: Model;
    relationshipValidationMode: RelationshipValidationMode;
  }) => ValidationIssue[];
};
