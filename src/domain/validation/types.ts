export type ValidationIssueSeverity = 'error' | 'warning';

export type ValidationIssueTarget =
  | { kind: 'model' }
  | { kind: 'folder'; folderId: string }
  | { kind: 'element'; elementId: string }
  | { kind: 'connector'; connectorId: string }
  | { kind: 'relationship'; relationshipId: string }
  | { kind: 'view'; viewId: string }
  | { kind: 'viewNode'; viewId: string; elementId: string };

export type ValidationIssue = {
  /** Stable-ish id for rendering in React lists. */
  id: string;
  severity: ValidationIssueSeverity;
  message: string;
  target: ValidationIssueTarget;
};
