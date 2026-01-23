import type { Element, ElementType, Model } from '../../../../domain';
import { BPMN_EVENT_DEFINITION_KINDS, isBpmnEventAttrs } from '../../../../domain/bpmnAttrs';
import type { BpmnEventAttrs, BpmnEventDefinition } from '../../../../domain/bpmnAttrs';

import type { Selection } from '../../selection';
import type { ModelActions } from '../actions';
import { PropertyRow } from '../editors/PropertyRow';
import { TextAreaRow } from '../editors/TextAreaRow';
import { TextInputRow } from '../editors/TextInputRow';

import { bpmnElementOptionLabel } from './bpmnOptionLabel';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pruneAttrs(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    next[k] = v;
  }
  return Object.keys(next).length ? next : undefined;
}

const EVENT_TYPES: ElementType[] = [
  'bpmn.startEvent',
  'bpmn.endEvent',
  'bpmn.intermediateCatchEvent',
  'bpmn.intermediateThrowEvent',
  'bpmn.boundaryEvent',
];

function eventKindFromType(t: string): 'start' | 'end' | 'intermediateCatch' | 'intermediateThrow' | 'boundary' {
  switch (t) {
    case 'bpmn.startEvent':
      return 'start';
    case 'bpmn.endEvent':
      return 'end';
    case 'bpmn.intermediateThrowEvent':
      return 'intermediateThrow';
    case 'bpmn.boundaryEvent':
      return 'boundary';
    default:
      return 'intermediateCatch';
  }
}

function isBpmnActivityType(t: unknown): boolean {
  const s = String(t);
  if (!s.startsWith('bpmn.')) return false;
  if (s === 'bpmn.pool' || s === 'bpmn.lane') return false;
  if (s === 'bpmn.textAnnotation') return false;
  if (
    s === 'bpmn.startEvent' ||
    s === 'bpmn.endEvent' ||
    s === 'bpmn.intermediateCatchEvent' ||
    s === 'bpmn.intermediateThrowEvent' ||
    s === 'bpmn.boundaryEvent'
  )
    return false;
  if (s === 'bpmn.gatewayExclusive' || s === 'bpmn.gatewayParallel' || s === 'bpmn.gatewayInclusive' || s === 'bpmn.gatewayEventBased')
    return false;
  return true;
}

type Props = {
  model: Model;
  element: Element;
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
};

/**
 * BPMN event semantics: event definition kind + a few optional definition fields.
 *
 * Boundary attachment supports host selection; boundary nodes follow their host in a view.
 */
export function BpmnEventPropertiesSection({ model, element: el, actions, onSelect }: Props) {
  if (typeof el.type !== 'string' || !String(el.type).startsWith('bpmn.')) return null;
  if (!(EVENT_TYPES as unknown as string[]).includes(String(el.type))) return null;

  const raw = el.attrs;
  const base: Record<string, unknown> = isRecord(raw) ? { ...raw } : {};

  const derivedKind = eventKindFromType(String(el.type));

  const parsed: BpmnEventAttrs = isBpmnEventAttrs(base)
    ? base
    : {
        eventKind: derivedKind,
        eventDefinition: { kind: 'none' },
        cancelActivity: derivedKind === 'boundary' ? true : undefined,
      };

  const eventDefinition: BpmnEventDefinition = parsed.eventDefinition;
  const eventDefKind = eventDefinition.kind;
  const cancelActivity = typeof parsed.cancelActivity === 'boolean' ? parsed.cancelActivity : true;
  const attachedToRef = typeof parsed.attachedToRef === 'string' ? parsed.attachedToRef : undefined;
  const commit = (patch: Record<string, unknown>) => {
    // Ensure the required fields exist and match the element type.
    const next = pruneAttrs({
      ...base,
      ...patch,
      eventKind: derivedKind,
      eventDefinition: (patch.eventDefinition as unknown) ?? (base.eventDefinition as unknown) ?? { kind: 'none' },
    });
    actions.updateElement(el.id, { attrs: next });
  };

  const setEventDefinitionKind = (kind: string) => {
    // Preserve existing fields when switching between definitions of the same kind.
    const prev = isRecord(base.eventDefinition) ? (base.eventDefinition as Record<string, unknown>) : {};
    const nextDef: Record<string, unknown> = { kind };
    if (prev.kind === kind) {
      for (const [k, v] of Object.entries(prev)) {
        if (k === 'kind') continue;
        nextDef[k] = v;
      }
    }
    commit({ eventDefinition: nextDef });
  };

  const isBoundary = String(el.type) === 'bpmn.boundaryEvent';
  const hostName = attachedToRef ? model.elements[attachedToRef]?.name ?? attachedToRef : undefined;

  const activityOptions = Object.values(model.elements)
    .filter(Boolean)
    .filter((e) => isBpmnActivityType(e.type))
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' }));

  const globalOptions = (t: string) =>
    Object.values(model.elements)
      .filter(Boolean)
      .filter((e) => String(e.type) === t)
      .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' }));

  const messageOptions = globalOptions('bpmn.message');
  const signalOptions = globalOptions('bpmn.signal');
  const errorOptions = globalOptions('bpmn.error');
  const escalationOptions = globalOptions('bpmn.escalation');

  // A tiny selection of optional fields to make definitions actually useful.
  const timer = isRecord(eventDefinition) && eventDefKind === 'timer' ? eventDefinition : null;
  const message = isRecord(eventDefinition) && eventDefKind === 'message' ? eventDefinition : null;
  const signal = isRecord(eventDefinition) && eventDefKind === 'signal' ? eventDefinition : null;
  const error = isRecord(eventDefinition) && eventDefKind === 'error' ? eventDefinition : null;
  const escalation = isRecord(eventDefinition) && eventDefKind === 'escalation' ? eventDefinition : null;
  const conditional = isRecord(eventDefinition) && eventDefKind === 'conditional' ? eventDefinition : null;
  const link = isRecord(eventDefinition) && eventDefKind === 'link' ? eventDefinition : null;

  return (
    <>
      <p className="panelHint">BPMN</p>
      <div className="propertiesGrid">
        <PropertyRow label="Event definition">
          <select
            className="selectInput"
            aria-label="BPMN event definition kind"
            value={eventDefKind}
            onChange={(e) => setEventDefinitionKind(e.target.value)}
          >
            {BPMN_EVENT_DEFINITION_KINDS.map((k) => (
              <option key={k} value={k}>
                {k === 'none'
                  ? 'None'
                  : k === 'timer'
                    ? 'Timer'
                    : k === 'message'
                      ? 'Message'
                      : k === 'signal'
                        ? 'Signal'
                        : k === 'error'
                          ? 'Error'
                          : k === 'escalation'
                            ? 'Escalation'
                            : k === 'conditional'
                              ? 'Conditional'
                              : k === 'link'
                                ? 'Link'
                                : 'Terminate'}
              </option>
            ))}
          </select>
        </PropertyRow>

        {timer ? (
          <>
            <TextInputRow
              label="Time date"
              ariaLabel="BPMN timer time date"
              value={typeof timer.timeDate === 'string' ? timer.timeDate : ''}
              onChange={(v) => commit({ eventDefinition: pruneAttrs({ ...timer, kind: 'timer', timeDate: v || undefined }) })}
              placeholder="e.g. 2026-01-18T09:00"
            />
            <TextInputRow
              label="Time duration"
              ariaLabel="BPMN timer time duration"
              value={typeof timer.timeDuration === 'string' ? timer.timeDuration : ''}
              onChange={(v) => commit({ eventDefinition: pruneAttrs({ ...timer, kind: 'timer', timeDuration: v || undefined }) })}
              placeholder="e.g. PT5M"
            />
            <TextInputRow
              label="Time cycle"
              ariaLabel="BPMN timer time cycle"
              value={typeof timer.timeCycle === 'string' ? timer.timeCycle : ''}
              onChange={(v) => commit({ eventDefinition: pruneAttrs({ ...timer, kind: 'timer', timeCycle: v || undefined }) })}
              placeholder="e.g. R3/PT10M"
            />
          </>
        ) : null}

        {message ? (
          <PropertyRow label="Message">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                className="selectInput"
                aria-label="BPMN message event ref"
                value={typeof message.messageRef === 'string' ? message.messageRef : ''}
                onChange={(e) =>
                  commit({
                    eventDefinition: pruneAttrs({ ...message, kind: 'message', messageRef: e.target.value || undefined }),
                  })
                }
                style={{ flex: 1, minWidth: 0 }}
              >
                <option value="">(none)</option>
                {messageOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {bpmnElementOptionLabel(o)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="miniButton"
                aria-label="Go to referenced message"
                disabled={!(typeof message.messageRef === 'string' && message.messageRef && model.elements[message.messageRef])}
                onClick={() =>
                  typeof message.messageRef === 'string' && message.messageRef && model.elements[message.messageRef]
                    ? onSelect?.({ kind: 'element', elementId: message.messageRef })
                    : undefined
                }
              >
                Go
              </button>
            </div>
          </PropertyRow>
        ) : null}

        {signal ? (
          <PropertyRow label="Signal">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                className="selectInput"
                aria-label="BPMN signal event ref"
                value={typeof signal.signalRef === 'string' ? signal.signalRef : ''}
                onChange={(e) =>
                  commit({
                    eventDefinition: pruneAttrs({ ...signal, kind: 'signal', signalRef: e.target.value || undefined }),
                  })
                }
                style={{ flex: 1, minWidth: 0 }}
              >
                <option value="">(none)</option>
                {signalOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {bpmnElementOptionLabel(o)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="miniButton"
                aria-label="Go to referenced signal"
                disabled={!(typeof signal.signalRef === 'string' && signal.signalRef && model.elements[signal.signalRef])}
                onClick={() =>
                  typeof signal.signalRef === 'string' && signal.signalRef && model.elements[signal.signalRef]
                    ? onSelect?.({ kind: 'element', elementId: signal.signalRef })
                    : undefined
                }
              >
                Go
              </button>
            </div>
          </PropertyRow>
        ) : null}

        {error ? (
          <PropertyRow label="Error">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                className="selectInput"
                aria-label="BPMN error event ref"
                value={typeof error.errorRef === 'string' ? error.errorRef : ''}
                onChange={(e) =>
                  commit({
                    eventDefinition: pruneAttrs({ ...error, kind: 'error', errorRef: e.target.value || undefined }),
                  })
                }
                style={{ flex: 1, minWidth: 0 }}
              >
                <option value="">(none)</option>
                {errorOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {bpmnElementOptionLabel(o)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="miniButton"
                aria-label="Go to referenced error"
                disabled={!(typeof error.errorRef === 'string' && error.errorRef && model.elements[error.errorRef])}
                onClick={() =>
                  typeof error.errorRef === 'string' && error.errorRef && model.elements[error.errorRef]
                    ? onSelect?.({ kind: 'element', elementId: error.errorRef })
                    : undefined
                }
              >
                Go
              </button>
            </div>
          </PropertyRow>
        ) : null}

        {escalation ? (
          <PropertyRow label="Escalation">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                className="selectInput"
                aria-label="BPMN escalation event ref"
                value={typeof escalation.escalationRef === 'string' ? escalation.escalationRef : ''}
                onChange={(e) =>
                  commit({
                    eventDefinition: pruneAttrs({ ...escalation, kind: 'escalation', escalationRef: e.target.value || undefined }),
                  })
                }
                style={{ flex: 1, minWidth: 0 }}
              >
                <option value="">(none)</option>
                {escalationOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {bpmnElementOptionLabel(o)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="miniButton"
                aria-label="Go to referenced escalation"
                disabled={!(typeof escalation.escalationRef === 'string' && escalation.escalationRef && model.elements[escalation.escalationRef])}
                onClick={() =>
                  typeof escalation.escalationRef === 'string' && escalation.escalationRef && model.elements[escalation.escalationRef]
                    ? onSelect?.({ kind: 'element', elementId: escalation.escalationRef })
                    : undefined
                }
              >
                Go
              </button>
            </div>
          </PropertyRow>
        ) : null}

        {conditional ? (
          <TextAreaRow
            label="Condition"
            ariaLabel="BPMN conditional event expression"
            value={typeof conditional.conditionExpression === 'string' ? conditional.conditionExpression : ''}
            onChange={(v) => commit({ eventDefinition: pruneAttrs({ ...conditional, kind: 'conditional', conditionExpression: v || undefined }) })}
            placeholder="(optional)"
          />
        ) : null}

        {link ? (
          <TextInputRow
            label="Link name"
            ariaLabel="BPMN link event name"
            value={typeof link.linkName === 'string' ? link.linkName : ''}
            onChange={(v) => commit({ eventDefinition: pruneAttrs({ ...link, kind: 'link', linkName: v || undefined }) })}
            placeholder="(optional)"
          />
        ) : null}

        {isBoundary ? (
          <div className="propertiesRow">
            <div className="propertiesKey">Interrupting</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.85 }}>
                <input
                  type="checkbox"
                  aria-label="BPMN boundary cancel activity"
                  checked={!!cancelActivity}
                  onChange={(e) => commit({ cancelActivity: e.target.checked ? true : false })}
                />
                Cancel activity
              </label>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                Non-interrupting boundary events can be supported later.
              </div>
            </div>
          </div>
        ) : null}

        {isBoundary ? (
          <PropertyRow label="Attached to">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                className="selectInput"
                aria-label="BPMN boundary attached to"
                value={attachedToRef ?? ''}
                onChange={(e) => actions.attachBoundaryEvent(el.id, e.target.value ? e.target.value : null)}
                disabled={!activityOptions.length}
                style={{ flex: 1, minWidth: 0 }}
              >
                <option value="">(none)</option>
                {activityOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {bpmnElementOptionLabel(a)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="miniButton"
                aria-label="Go to attached activity"
                disabled={!attachedToRef || !model.elements[attachedToRef]}
                onClick={() =>
                  attachedToRef && model.elements[attachedToRef] && onSelect?.({ kind: 'element', elementId: attachedToRef })
                }
              >
                Go
              </button>
            </div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
              {activityOptions.length
                ? hostName
                  ? 'Boundary follows the selected activity when it moves in a view.'
                  : 'Pick an activity to attach this boundary event.'
                : 'No BPMN activities found in the model.'}
            </div>
          </PropertyRow>
        ) : null}

        {!isBpmnEventAttrs(base) && raw ? (
          <div className="panelHint" style={{ color: '#ffb3b3', opacity: 0.95 }}>
            Existing BPMN event attrs could not be fully interpreted. Editing will merge with raw attrs.
          </div>
        ) : null}
      </div>
    </>
  );
}
