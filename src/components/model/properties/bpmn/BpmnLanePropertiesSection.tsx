import type { Element, Model } from '../../../../domain';

import type { Selection } from '../../selection';
import type { ModelActions } from '../actions';
import { PropertyRow } from '../editors/PropertyRow';
import { bpmnElementOptionLabel } from './bpmnOptionLabel';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isLaneMemberCandidateType(t: unknown): boolean {
  const s = String(t);
  if (!s.startsWith('bpmn.')) return false;
  // Containers and global defs are not lane members.
  if (s === 'bpmn.pool' || s === 'bpmn.lane') return false;
  if (s === 'bpmn.process') return false;
  if (s === 'bpmn.message' || s === 'bpmn.signal' || s === 'bpmn.error' || s === 'bpmn.escalation') return false;
  if (s === 'bpmn.dataObject' || s === 'bpmn.dataStore') return false;
  // Artifacts / references
  if (s === 'bpmn.textAnnotation' || s === 'bpmn.group' || s === 'bpmn.dataObjectReference' || s === 'bpmn.dataStoreReference') return false;
  return true;
}

type Props = {
  model: Model;
  element: Element;
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
};

/**
 * Lane properties.
 *
 * We surface `flowNodeRefs[]` (lane.flowNodeRefs → internal element ids).
 */
export function BpmnLanePropertiesSection({ model, element: el, actions, onSelect }: Props) {
  if (String(el.type) !== 'bpmn.lane') return null;

  const attrs = isRecord(el.attrs) ? (el.attrs as Record<string, unknown>) : {};
  const flowNodeRefs = Array.isArray(attrs.flowNodeRefs) ? (attrs.flowNodeRefs as unknown[]).map(String) : [];
  const selected = new Set(flowNodeRefs);

  const candidates = Object.values(model.elements)
    .filter(Boolean)
    .filter((e) => isLaneMemberCandidateType(e.type))
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' }));

  return (
    <>
      <p className="panelHint">BPMN</p>
      <div className="propertiesGrid">
        <PropertyRow label="Flow nodes">
          <select
            className="selectInput"
            aria-label="BPMN lane flow node refs"
            multiple
            size={Math.min(8, Math.max(4, candidates.length))}
            value={Array.from(selected)}
            onChange={(e) => {
              const next: string[] = [];
              for (const opt of Array.from(e.target.selectedOptions)) {
                if (opt.value) next.push(opt.value);
              }
              actions.setBpmnLaneFlowNodeRefs(el.id, next);
            }}
          >
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {bpmnElementOptionLabel(c)}
              </option>
            ))}
          </select>
        </PropertyRow>

        {flowNodeRefs.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {flowNodeRefs
              .map((id) => model.elements[id])
              .filter(Boolean)
              .slice(0, 12)
              .map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="miniButton"
                  onClick={() => onSelect?.({ kind: 'element', elementId: e.id })}
                  title="Select element"
                >
                  Go: {bpmnElementOptionLabel(e)}
                </button>
              ))}
            {flowNodeRefs.length > 12 ? (
              <span style={{ fontSize: 12, opacity: 0.75, alignSelf: 'center' }}>+{flowNodeRefs.length - 12} more…</span>
            ) : null}
          </div>
        ) : null}

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
          Holds <b>{flowNodeRefs.length}</b> flow node reference{flowNodeRefs.length === 1 ? '' : 's'}.
        </div>
      </div>
    </>
  );
}
