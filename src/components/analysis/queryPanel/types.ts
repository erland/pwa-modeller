// Shared types for AnalysisQueryPanel and query panel subcomponents.
// Kept in a React-free module to avoid cyclic dependencies within queryPanel.

export type AnalysisMode =
  | 'related'
  | 'paths'
  | 'traceability'
  | 'matrix'
  | 'portfolio'
  | 'sandbox';
