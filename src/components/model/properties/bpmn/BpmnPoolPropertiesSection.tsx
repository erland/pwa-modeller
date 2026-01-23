import type { Element, Model } from '../../../../domain';

import type { Selection } from '../../selection';
import type { ModelActions } from '../actions';
import { PropertyRow } from '../editors/PropertyRow';
import { bpmnElementOptionLabel } from './bpmnOptionLabel';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

type Props = {
  model: Model;
  element: Element;
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
};

/**
 * Pool (Participant) properties.
 *
 * Today we only surface the semantic `processRef` (participant.processRef → internal process element id).
 */
export function BpmnPoolPropertiesSection({ model, element: el, actions, onSelect }: Props) {
  if (String(el.type) !== 'bpmn.pool') return null;

  const attrs = isRecord(el.attrs) ? (el.attrs as Record<string, unknown>) : {};
  const processRef = typeof attrs.processRef === 'string' ? attrs.processRef : '';

  const processOptions = Object.values(model.elements)
    .filter(Boolean)
    .filter((e) => String(e.type) === 'bpmn.process')
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' }));

  const selectedName = processRef ? model.elements[processRef]?.name ?? processRef : undefined;
  const canGo = !!processRef && !!model.elements[processRef];

  return (
    <>
      <p className="panelHint">BPMN</p>
      <div className="propertiesGrid">
        <PropertyRow label="Process">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              className="selectInput"
              aria-label="BPMN pool process"
              value={processRef || ''}
              onChange={(e) => actions.setBpmnPoolProcessRef(el.id, e.target.value ? e.target.value : null)}
              style={{ flex: 1, minWidth: 0 }}
            >
              <option value="">(none)</option>
              {processOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {bpmnElementOptionLabel(p)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="miniButton"
              aria-label="Go to referenced process"
              disabled={!canGo}
              onClick={() => canGo && onSelect?.({ kind: 'element', elementId: processRef })}
            >
              Go
            </button>
          </div>
        </PropertyRow>

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
          Participant <span style={{ opacity: 0.9 }}>processRef</span>
          {selectedName ? <> → <b>{selectedName}</b></> : ' is not set.'}
        </div>
      </div>
    </>
  );
}
