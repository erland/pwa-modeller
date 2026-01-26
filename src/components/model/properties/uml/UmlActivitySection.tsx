import type { Element, Model } from '../../../../domain';
import { isUmlActivityContainerTypeId, isUmlActivityNodeTypeId } from '../../../../domain/uml/typeGroups';

import type { Selection } from '../../selection';
import type { ModelActions } from '../actions';
import { PropertyRow } from '../editors/PropertyRow';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asTrimmedOrUndef(v: string): string | undefined {
  const s = v.trim();
  return s.length ? s : undefined;
}

type Props = {
  model: Model;
  element: Element;
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
};

export function UmlActivitySection({ model, element: el, actions, onSelect }: Props) {
  if (typeof el.type !== 'string' || !el.type.startsWith('uml.')) return null;

  const isActivityContainer = isUmlActivityContainerTypeId(el.type);
  const isActivityNode = isUmlActivityNodeTypeId(el.type);
  const isAction = el.type === 'uml.action';

  if (!isActivityContainer && !isActivityNode) return null;

  const raw = el.attrs;
  const base: Record<string, unknown> = isRecord(raw) ? { ...raw } : {};

  const commit = (patch: Record<string, unknown>) => {
    const next: Record<string, unknown> = { ...base, ...patch };
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined) delete next[k];
    }
    actions.updateElement(el.id, { attrs: Object.keys(next).length ? next : undefined });
  };

  const ownerActivityId = typeof base.activityId === 'string' ? base.activityId : undefined;

  const activityOptions = Object.values(model.elements)
    .filter((e) => e.type === 'uml.activity')
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    .map((a) => ({ id: a.id, name: a.name || a.id }));

  const actionKind = typeof base.actionKind === 'string' ? base.actionKind : '';

  const ownedRefs = Array.isArray(base.ownedNodeRefs) ? (base.ownedNodeRefs as unknown[]) : [];
  const ownedNodeIds = ownedRefs.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);

  return (
    <>
      <p className="panelHint">UML Activity</p>
      <div className="propertiesGrid">
        {isAction ? (
          <PropertyRow label="Action kind">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <select
                className="selectInput"
                aria-label="UML action kind"
                value={actionKind}
                onChange={(e) => commit({ actionKind: asTrimmedOrUndef(e.target.value) })}
              >
                <option value="">(default)</option>
                <option value="OpaqueAction">OpaqueAction</option>
                <option value="CallBehaviorAction">CallBehaviorAction</option>
                <option value="CallOperationAction">CallOperationAction</option>
              </select>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Best-effort hint from import. Editing is optional and may not roundtrip to XMI yet.
              </div>
            </div>
          </PropertyRow>
        ) : null}

        {isActivityNode ? (
          <PropertyRow label="Owner activity">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <select
                className="selectInput"
                aria-label="UML activity owner"
                value={ownerActivityId ?? ''}
                onChange={(e) => commit({ activityId: asTrimmedOrUndef(e.target.value) })}
              >
                <option value="">(none)</option>
                {activityOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>

              {ownerActivityId && onSelect ? (
                <button
                  type="button"
                  className="shellButton"
                  onClick={() => onSelect({ kind: 'element', elementId: ownerActivityId })}
                >
                  Select activity
                </button>
              ) : null}
            </div>
          </PropertyRow>
        ) : null}

        {isActivityContainer ? (
          <PropertyRow label="Owned nodes">
            {ownedNodeIds.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ownedNodeIds.map((id) => {
                  const n = model.elements[id];
                  const label = n ? `${n.name || '(unnamed)'} (${n.type})` : id;
                  return (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12 }}>{label}</span>
                      {onSelect && n ? (
                        <button
                          type="button"
                          className="shellButton"
                          onClick={() => onSelect({ kind: 'element', elementId: id })}
                        >
                          Select
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <span style={{ opacity: 0.75 }}>No owned nodes recorded.</span>
            )}
          </PropertyRow>
        ) : null}
      </div>
    </>
  );
}
