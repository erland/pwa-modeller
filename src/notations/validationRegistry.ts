import type { Model, ModelKind } from '../domain/types';
import type { ValidationIssue } from '../domain/validation/types';

import { validateArchimateRelationshipRules } from '../domain/validation/archimate';
import { validateBpmnBasics } from '../domain/validation/bpmn';
import { validateUmlBasics } from '../domain/validation/uml';

/**
 * Lightweight notation registry for domain validation.
 *
 * IMPORTANT: This file must remain free of React/UI imports to avoid circular
 * dependencies (domain -> validation -> notations -> UI -> store -> domain).
 */

export type NotationValidator = {
  kind: ModelKind;
  validateNotation: (model: Model) => ValidationIssue[];
};

const archimateValidator: NotationValidator = {
  kind: 'archimate',
  validateNotation: (model) => validateArchimateRelationshipRules(model),
};

const umlValidator: NotationValidator = {
  kind: 'uml',
  validateNotation: (model) => validateUmlBasics(model),
};

const bpmnValidator: NotationValidator = {
  kind: 'bpmn',
  validateNotation: (model) => validateBpmnBasics(model),
};

const VALIDATORS: Record<ModelKind, NotationValidator> = {
  archimate: archimateValidator,
  uml: umlValidator,
  bpmn: bpmnValidator,
};

export function getNotationValidator(kind: ModelKind): NotationValidator {
  return VALIDATORS[kind];
}
