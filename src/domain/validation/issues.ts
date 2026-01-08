import type { ValidationIssue, ValidationIssueSeverity, ValidationIssueTarget } from './types';

export function makeIssue(
  severity: ValidationIssueSeverity,
  message: string,
  target: ValidationIssueTarget,
  suffix: string
): ValidationIssue {
  return {
    id: `${severity}:${target.kind}:${suffix}`,
    severity,
    message,
    target
  };
}
