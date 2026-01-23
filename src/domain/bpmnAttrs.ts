/**
 * BPMN “Level 2” semantic attributes.
 *
 * These types are intentionally stored in the existing `attrs?: unknown` fields on
 * Elements / Relationships / View layouts, so the core model schema stays stable.
 *
 * The runtime guards below are deliberately lightweight: they validate shape enough
 * to safely read values in UI + validation, without turning into a heavy schema system.
 */

// ---- shared helpers ---------------------------------------------------------

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isString(x: unknown): x is string {
  return typeof x === 'string';
}

function isBoolean(x: unknown): x is boolean {
  return typeof x === 'boolean';
}

function isOneOf<const T extends readonly string[]>(x: unknown, allowed: T): x is T[number] {
  return isString(x) && (allowed as readonly string[]).includes(x);
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && (x as unknown[]).every((v) => isString(v));
}

// ---- Containers --------------------------------------------------------------

/** BPMN participant (pool) semantics. */
export interface BpmnPoolAttrs {
  /** Internal element id of the referenced process (rewritten during import). */
  processRef?: string;
}

export function isBpmnPoolAttrs(x: unknown): x is BpmnPoolAttrs {
  if (!isPlainObject(x)) return false;
  if (x.processRef !== undefined && !isString(x.processRef)) return false;
  return true;
}

/** Lightweight process container semantics. */
export interface BpmnProcessAttrs {
  isExecutable?: boolean;
}

export function isBpmnProcessAttrs(x: unknown): x is BpmnProcessAttrs {
  if (!isPlainObject(x)) return false;
  if (x.isExecutable !== undefined && !isBoolean(x.isExecutable)) return false;
  return true;
}

/** Lane semantic containment. */
export interface BpmnLaneAttrs {
  flowNodeRefs?: string[];
}

export function isBpmnLaneAttrs(x: unknown): x is BpmnLaneAttrs {
  if (!isPlainObject(x)) return false;
  if (x.flowNodeRefs !== undefined && !isStringArray(x.flowNodeRefs)) return false;
  return true;
}

// ---- Activities -------------------------------------------------------------

export const BPMN_LOOP_TYPES = ['none', 'standard', 'multiInstanceSequential', 'multiInstanceParallel'] as const;
export type BpmnLoopType = (typeof BPMN_LOOP_TYPES)[number];

export const BPMN_SUBPROCESS_TYPES = ['embedded', 'event', 'transaction', 'adHoc'] as const;
export type BpmnSubProcessType = (typeof BPMN_SUBPROCESS_TYPES)[number];

export interface BpmnActivityAttrs {
  /** Loop / multi-instance semantics (kept compact for UI friendliness). */
  loopType?: BpmnLoopType;
  /** Compensation marker semantics (BPMN isForCompensation or compensateEventDefinition). */
  isForCompensation?: boolean;
  /** For call activities (or tasks that represent calling behaviour). */
  isCall?: boolean;
  /** Sub-process flavour (only meaningful for subProcess/callActivity in UI). */
  subProcessType?: BpmnSubProcessType;
  /** Whether the sub-process is shown expanded in the diagram. */
  isExpanded?: boolean;
}

export function isBpmnActivityAttrs(x: unknown): x is BpmnActivityAttrs {
  if (!isPlainObject(x)) return false;
  if (x.loopType !== undefined && !isOneOf(x.loopType, BPMN_LOOP_TYPES)) return false;
  if (x.isForCompensation !== undefined && !isBoolean(x.isForCompensation)) return false;
  if (x.isCall !== undefined && !isBoolean(x.isCall)) return false;
  if (x.subProcessType !== undefined && !isOneOf(x.subProcessType, BPMN_SUBPROCESS_TYPES)) return false;
  if (x.isExpanded !== undefined && !isBoolean(x.isExpanded)) return false;
  return true;
}

// ---- Events -----------------------------------------------------------------

export const BPMN_EVENT_KINDS = ['start', 'end', 'intermediateCatch', 'intermediateThrow', 'boundary'] as const;
export type BpmnEventKind = (typeof BPMN_EVENT_KINDS)[number];

export const BPMN_EVENT_DEFINITION_KINDS = [
  'none',
  'timer',
  'message',
  'signal',
  'error',
  'escalation',
  'conditional',
  'link',
  'terminate',
] as const;
export type BpmnEventDefinitionKind = (typeof BPMN_EVENT_DEFINITION_KINDS)[number];

export type BpmnEventDefinition =
  | { kind: 'none' }
  | { kind: 'timer'; timeDate?: string; timeDuration?: string; timeCycle?: string }
  | { kind: 'message'; messageRef?: string }
  | { kind: 'signal'; signalRef?: string }
  | { kind: 'error'; errorRef?: string }
  | { kind: 'escalation'; escalationRef?: string }
  | { kind: 'conditional'; conditionExpression?: string }
  | { kind: 'link'; linkName?: string }
  | { kind: 'terminate' };

export interface BpmnEventAttrs {
  eventKind: BpmnEventKind;
  eventDefinition: BpmnEventDefinition;
  /** For boundary events: if true, host activity is interrupted ("interrupting" in BPMN UI terms). */
  cancelActivity?: boolean;
  /** For boundary events: element id of the host activity/task. */
  attachedToRef?: string;
}

export function isBpmnEventDefinition(x: unknown): x is BpmnEventDefinition {
  if (!isPlainObject(x)) return false;
  if (!isOneOf(x.kind, BPMN_EVENT_DEFINITION_KINDS)) return false;

  // Kind-specific optional fields (only type checks; we allow extra fields).
  switch (x.kind) {
    case 'none':
    case 'terminate':
      return true;
    case 'timer':
      return (
        (x.timeDate === undefined || isString(x.timeDate)) &&
        (x.timeDuration === undefined || isString(x.timeDuration)) &&
        (x.timeCycle === undefined || isString(x.timeCycle))
      );
    case 'message':
      return x.messageRef === undefined || isString(x.messageRef);
    case 'signal':
      return x.signalRef === undefined || isString(x.signalRef);
    case 'error':
      return x.errorRef === undefined || isString(x.errorRef);
    case 'escalation':
      return x.escalationRef === undefined || isString(x.escalationRef);
    case 'conditional':
      return x.conditionExpression === undefined || isString(x.conditionExpression);
    case 'link':
      return x.linkName === undefined || isString(x.linkName);
    default:
      return false;
  }
}

export function isBpmnEventAttrs(x: unknown): x is BpmnEventAttrs {
  if (!isPlainObject(x)) return false;
  if (!isOneOf(x.eventKind, BPMN_EVENT_KINDS)) return false;
  if (!isBpmnEventDefinition(x.eventDefinition)) return false;
  if (x.cancelActivity !== undefined && !isBoolean(x.cancelActivity)) return false;
  if (x.attachedToRef !== undefined && !isString(x.attachedToRef)) return false;
  return true;
}

// ---- Gateways ---------------------------------------------------------------

export const BPMN_GATEWAY_KINDS = ['exclusive', 'parallel', 'inclusive', 'eventBased'] as const;
export type BpmnGatewayKind = (typeof BPMN_GATEWAY_KINDS)[number];

export interface BpmnGatewayAttrs {
  gatewayKind: BpmnGatewayKind;
  defaultFlowRef?: string;
}

export function isBpmnGatewayAttrs(x: unknown): x is BpmnGatewayAttrs {
  if (!isPlainObject(x)) return false;
  if (!isOneOf(x.gatewayKind, BPMN_GATEWAY_KINDS)) return false;
  if (x.defaultFlowRef !== undefined && !isString(x.defaultFlowRef)) return false;
  return true;
}

// ---- Artifacts / Data ------------------------------------------------------

export interface BpmnTextAnnotationAttrs {
  text?: string;
}

export function isBpmnTextAnnotationAttrs(x: unknown): x is BpmnTextAnnotationAttrs {
  if (!isPlainObject(x)) return false;
  if (x.text !== undefined && !isString(x.text)) return false;
  return true;
}

export interface BpmnDataObjectReferenceAttrs {
  /** Internal element id of referenced global dataObject (rewritten during import). */
  dataObjectRef?: string;
}

export function isBpmnDataObjectReferenceAttrs(x: unknown): x is BpmnDataObjectReferenceAttrs {
  if (!isPlainObject(x)) return false;
  if (x.dataObjectRef !== undefined && !isString(x.dataObjectRef)) return false;
  return true;
}

export interface BpmnDataStoreReferenceAttrs {
  /** Internal element id of referenced global dataStore (rewritten during import). */
  dataStoreRef?: string;
}

export function isBpmnDataStoreReferenceAttrs(x: unknown): x is BpmnDataStoreReferenceAttrs {
  if (!isPlainObject(x)) return false;
  if (x.dataStoreRef !== undefined && !isString(x.dataStoreRef)) return false;
  return true;
}

// ---- Global definitions ----------------------------------------------------

export interface BpmnMessageAttrs {
  itemRef?: string;
}

export function isBpmnMessageAttrs(x: unknown): x is BpmnMessageAttrs {
  if (!isPlainObject(x)) return false;
  if (x.itemRef !== undefined && !isString(x.itemRef)) return false;
  return true;
}

export interface BpmnErrorAttrs {
  errorCode?: string;
  structureRef?: string;
}

export function isBpmnErrorAttrs(x: unknown): x is BpmnErrorAttrs {
  if (!isPlainObject(x)) return false;
  if (x.errorCode !== undefined && !isString(x.errorCode)) return false;
  if (x.structureRef !== undefined && !isString(x.structureRef)) return false;
  return true;
}

export interface BpmnEscalationAttrs {
  escalationCode?: string;
}

export function isBpmnEscalationAttrs(x: unknown): x is BpmnEscalationAttrs {
  if (!isPlainObject(x)) return false;
  if (x.escalationCode !== undefined && !isString(x.escalationCode)) return false;
  return true;
}

// ---- Relationships ----------------------------------------------------------

export interface BpmnSequenceFlowAttrs {
  conditionExpression?: string;
  isDefault?: boolean;
}

export function isBpmnSequenceFlowAttrs(x: unknown): x is BpmnSequenceFlowAttrs {
  if (!isPlainObject(x)) return false;
  if (x.conditionExpression !== undefined && !isString(x.conditionExpression)) return false;
  if (x.isDefault !== undefined && !isBoolean(x.isDefault)) return false;
  return true;
}

export interface BpmnMessageFlowAttrs {
  messageRef?: string;
}

export function isBpmnMessageFlowAttrs(x: unknown): x is BpmnMessageFlowAttrs {
  if (!isPlainObject(x)) return false;
  if (x.messageRef !== undefined && !isString(x.messageRef)) return false;
  return true;
}
