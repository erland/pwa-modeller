import type { Element, ElementType, Model, Relationship } from '../../../../domain';
import { isBpmnGatewayAttrs } from '../../../../domain/bpmnAttrs';

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

const GATEWAY_TYPES: ElementType[] = [
  'bpmn.gatewayExclusive',
  'bpmn.gatewayParallel',
  'bpmn.gatewayInclusive',
  'bpmn.gatewayEventBased',
];

function gatewayKindFromType(t: string): 'exclusive' | 'parallel' | 'inclusive' | 'eventBased' {
  switch (t) {
    case 'bpmn.gatewayParallel':
      return 'parallel';
    case 'bpmn.gatewayInclusive':
      return 'inclusive';
    case 'bpmn.gatewayEventBased':
      return 'eventBased';
    default:
      return 'exclusive';
  }
}

function gatewayTypeFromKind(k: string): ElementType {
  switch (k) {
    case 'parallel':
      return 'bpmn.gatewayParallel';
    case 'inclusive':
      return 'bpmn.gatewayInclusive';
    case 'eventBased':
      return 'bpmn.gatewayEventBased';
    default:
      return 'bpmn.gatewayExclusive';
  }
}

type Props = {
  model: Model;
  element: Element;
  actions: ModelActions;
};

/**
 * BPMN gateway semantics: gateway kind + default flow selector.
 */
export function BpmnGatewayPropertiesSection({ model, element: el, actions }: Props) {
  if (typeof el.type !== 'string' || !String(el.type).startsWith('bpmn.')) return null;
  if (!(GATEWAY_TYPES as unknown as string[]).includes(String(el.type))) return null;

  const raw = el.attrs;
  const base: Record<string, unknown> = isRecord(raw) ? { ...raw } : {};
  const derivedKind = gatewayKindFromType(String(el.type));

  const parsed = isBpmnGatewayAttrs(base) ? base : { gatewayKind: derivedKind };
  const defaultFlowRef = typeof (parsed as any).defaultFlowRef === 'string' ? ((parsed as any).defaultFlowRef as string) : undefined;

  const outgoingSequenceFlows: Relationship[] = Object.values(model.relationships)
    .filter(Boolean)
    .filter((r) => r.type === 'bpmn.sequenceFlow' && r.sourceElementId === el.id);

  const commit = (patch: Record<string, unknown>) => {
    const next = pruneAttrs({ ...base, ...patch, gatewayKind: derivedKind });
    actions.updateElement(el.id, { attrs: next });
  };

  const setGatewayKind = (kind: string) => {
    const nextType = gatewayTypeFromKind(kind);
    actions.updateElement(el.id, { type: nextType as ElementType, attrs: pruneAttrs({ ...base, gatewayKind: kind }) });
  };

  const optionLabel = (r: Relationship): string => {
    const targetName = r.targetElementId ? model.elements[r.targetElementId]?.name ?? r.targetElementId : '—';
    const relName = r.name?.trim() ? r.name.trim() : r.id;
    return `${relName} → ${targetName}`;
  };

  return (
    <>
      <p className="panelHint">BPMN</p>
      <div className="propertiesGrid">
        <PropertyRow label="Gateway kind">
          <select
            className="selectInput"
            aria-label="BPMN gateway kind"
            value={derivedKind}
            onChange={(e) => setGatewayKind(e.target.value)}
          >
            <option value="exclusive">Exclusive</option>
            <option value="parallel">Parallel</option>
            <option value="inclusive">Inclusive</option>
            <option value="eventBased">Event-based</option>
          </select>
        </PropertyRow>

        <PropertyRow label="Default flow">
          <select
            className="selectInput"
            aria-label="BPMN gateway default flow"
            value={defaultFlowRef ?? ''}
            onChange={(e) => commit({ defaultFlowRef: e.target.value ? e.target.value : undefined })}
            disabled={!outgoingSequenceFlows.length}
          >
            <option value="">(none)</option>
            {outgoingSequenceFlows.map((r) => (
              <option key={r.id} value={r.id}>
                {optionLabel(r)}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
            {outgoingSequenceFlows.length
              ? 'Pick which outgoing Sequence Flow is the default.'
              : 'Create outgoing Sequence Flows to choose a default.'}
          </div>
        </PropertyRow>

        {!isBpmnGatewayAttrs(base) && raw ? (
          <div className="panelHint" style={{ color: '#ffb3b3', opacity: 0.95 }}>
            Existing BPMN gateway attrs could not be fully interpreted. Editing will merge with raw attrs.
          </div>
        ) : null}
      </div>
    </>
  );
}
