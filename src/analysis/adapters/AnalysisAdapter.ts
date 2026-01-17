import type { AnalysisEdge } from '../../domain/analysis/graph';
import type { Element, Model, ModelKind } from '../../domain/types';

export type AnalysisFacetValue = string | string[] | null | undefined;

export type AnalysisFacetDefinition = {
  /** Stable identifier (used as key in filter state). */
  id: string;
  /** Human label for UI. */
  label: string;
  /** How the UI should treat the value(s). */
  kind: 'single' | 'multi';
};

export type AnalysisFacetValues = Record<string, AnalysisFacetValue>;

/**
 * Notation-aware adapter for the Analysis workspace.
 *
 * The intent is to keep analysis graph building + algorithms notation-agnostic,
 * while letting each notation provide:
 * - labels
 * - directedness semantics
 * - facet (filter) definitions + value derivation
 */
export type AnalysisAdapter = {
  id: ModelKind;

  getNodeLabel: (node: Element, model: Model) => string;
  getEdgeLabel: (edge: AnalysisEdge, model: Model) => string;
  isEdgeDirected: (edge: AnalysisEdge, model: Model) => boolean;

  getFacetDefinitions: (model: Model) => AnalysisFacetDefinition[];
  getNodeFacetValues: (node: Element, model: Model) => AnalysisFacetValues;
};
