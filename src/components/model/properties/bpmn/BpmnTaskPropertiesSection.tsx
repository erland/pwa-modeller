import type { Element, ElementType, Model } from '../../../../domain';
import { getElementTypeLabel } from '../../../../domain';
import { BPMN_LOOP_TYPES, BPMN_SUBPROCESS_TYPES, isBpmnActivityAttrs } from '../../../../domain/bpmnAttrs';

import type { Selection } from '../../selection';
import type { ModelActions } from '../actions';
import { PropertyRow } from '../editors/PropertyRow';

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

const ACTIVITY_TYPES: ElementType[] = [
  'bpmn.task',
  'bpmn.userTask',
  'bpmn.serviceTask',
  'bpmn.scriptTask',
  'bpmn.manualTask',
  'bpmn.callActivity',
  'bpmn.subProcess',
];

function labelForActivityType(t: ElementType): string {
  return getElementTypeLabel(t) || t;
}

type Props = {
  model: Model;
  element: Element;
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
};

/**
 * BPMN activity semantics: task subtypes + lightweight loop/subprocess attributes.
 */
export function BpmnTaskPropertiesSection({ model, element: el, actions, onSelect }: Props) {
  void onSelect;
  void model; // Reserved for future context-aware rules (participants/containment).
  if (typeof el.type !== 'string' || !String(el.type).startsWith('bpmn.')) return null;
  if (!(ACTIVITY_TYPES as unknown as string[]).includes(String(el.type))) return null;

  const raw = el.attrs;
  const base: Record<string, unknown> = isRecord(raw) ? { ...raw } : {};
  const parsed = isBpmnActivityAttrs(base) ? base : {};

  const loopType = typeof parsed.loopType === 'string' ? parsed.loopType : 'none';
  const subProcessType = typeof parsed.subProcessType === 'string' ? parsed.subProcessType : 'embedded';
  const isExpanded = typeof parsed.isExpanded === 'boolean' ? parsed.isExpanded : true;

  const commit = (patch: Record<string, unknown>) => {
    actions.updateElement(el.id, { attrs: pruneAttrs({ ...base, ...patch }) });
  };

  const activityType = el.type as ElementType;
  const isSubProcessLike = activityType === 'bpmn.subProcess' || activityType === 'bpmn.callActivity';

  return (
    <>
      <p className="panelHint">BPMN</p>
      <div className="propertiesGrid">
        <PropertyRow label="Activity type">
          <select
            className="selectInput"
            aria-label="BPMN activity type"
            value={activityType}
            onChange={(e) => actions.updateElement(el.id, { type: e.target.value as ElementType })}
          >
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {labelForActivityType(t)}
              </option>
            ))}
          </select>
        </PropertyRow>

        <PropertyRow label="Loop">
          <select
            className="selectInput"
            aria-label="BPMN activity loop type"
            value={loopType}
            onChange={(e) => commit({ loopType: e.target.value === 'none' ? undefined : e.target.value })}
          >
            {BPMN_LOOP_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === 'none'
                  ? 'None'
                  : t === 'standard'
                    ? 'Standard loop'
                    : t === 'multiInstanceSequential'
                      ? 'Multi-instance (sequential)'
                      : 'Multi-instance (parallel)'}
              </option>
            ))}
          </select>
        </PropertyRow>

        {isSubProcessLike ? (
          <>
            <PropertyRow label="Sub-process type">
              <select
                className="selectInput"
                aria-label="BPMN sub-process type"
                value={subProcessType}
                onChange={(e) => commit({ subProcessType: e.target.value })}
              >
                {BPMN_SUBPROCESS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === 'embedded' ? 'Embedded' : t === 'event' ? 'Event' : t === 'transaction' ? 'Transaction' : 'Ad-hoc'}
                  </option>
                ))}
              </select>
            </PropertyRow>

            <div className="propertiesRow">
              <div className="propertiesKey">Expanded</div>
              <div className="propertiesValue" style={{ fontWeight: 400 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.85 }}>
                  <input
                    type="checkbox"
                    aria-label="BPMN sub-process expanded"
                    checked={!!isExpanded}
                    onChange={(e) => commit({ isExpanded: e.target.checked ? true : false })}
                  />
                  Show expanded
                </label>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                  Stored as semantic attrs (rendering tweaks can be added later).
                </div>
              </div>
            </div>

            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
              Participants/lanes are modeled via Pool/Lane containers in the view; activity containment is validated separately.
            </div>
          </>
        ) : null}

        {!isBpmnActivityAttrs(base) && raw ? (
          <div className="panelHint" style={{ color: '#ffb3b3', opacity: 0.95 }}>
            Existing BPMN activity attrs could not be fully interpreted. Editing will merge with raw attrs.
          </div>
        ) : null}

        {/* Optional: show where this activity is used (helpful when choosing default flows later) */}
        {activityType === 'bpmn.callActivity' ? (
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
            Tip: use Documentation or tagged values to reference the called process.
          </div>
        ) : null}
      </div>
    </>
  );
}
