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

/** DataStoreReference properties (attrs.dataStoreRef). */
export function BpmnDataStoreReferencePropertiesSection({ model, element: el, actions, onSelect }: Props) {
  if (String(el.type) !== 'bpmn.dataStoreReference') return null;

  const attrs = isRecord(el.attrs) ? (el.attrs as Record<string, unknown>) : {};
  const dataStoreRef = typeof attrs.dataStoreRef === 'string' ? attrs.dataStoreRef : '';

  const options = Object.values(model.elements)
    .filter(Boolean)
    .filter((e) => String(e.type) === 'bpmn.dataStore')
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' }));

  const selectedName = dataStoreRef ? model.elements[dataStoreRef]?.name ?? dataStoreRef : undefined;

  return (
    <>
      <p className="panelHint">BPMN</p>
      <div className="propertiesGrid">
        <PropertyRow label="Data store">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              className="selectInput"
              aria-label="BPMN data store reference"
              value={dataStoreRef || ''}
              onChange={(e) => actions.setBpmnDataStoreReferenceRef(el.id, e.target.value ? e.target.value : null)}
              style={{ flex: 1, minWidth: 0 }}
            >
              <option value="">(none)</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {bpmnElementOptionLabel(o)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="miniButton"
              aria-label="Go to referenced data store"
              disabled={!dataStoreRef || !model.elements[dataStoreRef]}
              onClick={() => dataStoreRef && model.elements[dataStoreRef] && onSelect?.({ kind: 'element', elementId: dataStoreRef })}
            >
              Go
            </button>
          </div>
        </PropertyRow>

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
          dataStoreRef{selectedName ? <> → <b>{selectedName}</b></> : ' is not set.'}
        </div>
      </div>
    </>
  );
}
