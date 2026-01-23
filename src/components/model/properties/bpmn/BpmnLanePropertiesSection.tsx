import type { Element, Model } from '../../../../domain';

import type { ModelActions } from '../actions';
import { PropertyRow } from '../editors/PropertyRow';

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
};

/**
 * Lane properties.
 *
 * We surface `flowNodeRefs[]` (lane.flowNodeRefs → internal element ids).
 */
export function BpmnLanePropertiesSection({ model, element: el, actions }: Props) {
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
                {c.name || c.id}
              </option>
            ))}
          </select>
        </PropertyRow>

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
          Holds <b>{flowNodeRefs.length}</b> flow node reference{flowNodeRefs.length === 1 ? '' : 's'}.
        </div>
      </div>
    </>
  );
}
