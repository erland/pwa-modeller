import type { Element, Model } from '../../../../domain';

import type { Selection } from '../../selection';
import type { ModelActions } from '../actions';
import { PropertyRow } from '../editors/PropertyRow';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function trimId(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s.length ? s : undefined;
}

type Props = {
  model: Model;
  element: Element;
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
};

/**
 * AssociationClass support: show the model-level linkage between the class box and its association line.
 * Editing the link is intentionally out-of-scope for v1.
 */
export function UmlAssociationClassLinkSection({ model, element: el, onSelect }: Props) {
  if (el.type !== 'uml.associationClass') return null;

  const attrs = isRecord(el.attrs) ? el.attrs : {};
  const relId = trimId((attrs as any).associationRelationshipId);
  const rel = relId ? model.relationships[relId] : undefined;

  const srcId = rel ? (rel.sourceElementId ?? rel.sourceConnectorId) : undefined;
  const tgtId = rel ? (rel.targetElementId ?? rel.targetConnectorId) : undefined;

  const srcEl = srcId ? model.elements[srcId] : undefined;
  const tgtEl = tgtId ? model.elements[tgtId] : undefined;

  const srcConn = srcId && !srcEl ? model.connectors?.[srcId] : undefined;
  const tgtConn = tgtId && !tgtEl ? model.connectors?.[tgtId] : undefined;

  const srcLabel = srcEl
    ? `${srcEl.name || '(unnamed)'} (${srcEl.type})`
    : srcConn
      ? `${srcConn.name || '(unnamed)'} (${srcConn.type})`
      : srcId || '';

  const tgtLabel = tgtEl
    ? `${tgtEl.name || '(unnamed)'} (${tgtEl.type})`
    : tgtConn
      ? `${tgtConn.name || '(unnamed)'} (${tgtConn.type})`
      : tgtId || '';

  return (
    <>
      <p className="panelHint">Association link</p>
      <div className="propertiesGrid">
        <PropertyRow label="Linked relationship">
          {relId ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12 }}>
                <span style={{ opacity: 0.75 }}>ID:</span> {relId}
                {rel ? <span style={{ opacity: 0.75 }}> · {rel.type}</span> : <span style={{ opacity: 0.75 }}> · (missing)</span>}
              </div>
              {onSelect ? (
                <button
                  type="button"
                  className="shellButton"
                  disabled={!rel}
                  title={!rel ? 'Linked relationship not found in model' : undefined}
                  onClick={() => {
                    if (!rel) return;
                    onSelect({ kind: 'relationship', relationshipId: relId });
                  }}
                >
                  Select relationship
                </button>
              ) : null}
            </div>
          ) : (
            <span style={{ opacity: 0.75 }}>No linked association relationship recorded.</span>
          )}
        </PropertyRow>

        {rel ? (
          <PropertyRow label="Endpoints">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12 }}>
                <div>
                  <span style={{ opacity: 0.75 }}>Source:</span> {srcLabel}
                </div>
                <div>
                  <span style={{ opacity: 0.75 }}>Target:</span> {tgtLabel}
                </div>
              </div>
              {onSelect ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="shellButton"
                    disabled={!srcEl && !srcConn}
                    title={!srcEl && !srcConn ? 'Endpoint not found' : undefined}
                    onClick={() => {
                      if (srcEl) onSelect({ kind: 'element', elementId: srcEl.id });
                      else if (srcConn) onSelect({ kind: 'connector', connectorId: srcConn.id });
                    }}
                  >
                    Select source
                  </button>
                  <button
                    type="button"
                    className="shellButton"
                    disabled={!tgtEl && !tgtConn}
                    title={!tgtEl && !tgtConn ? 'Endpoint not found' : undefined}
                    onClick={() => {
                      if (tgtEl) onSelect({ kind: 'element', elementId: tgtEl.id });
                      else if (tgtConn) onSelect({ kind: 'connector', connectorId: tgtConn.id });
                    }}
                  >
                    Select target
                  </button>
                </div>
              ) : null}
            </div>
          </PropertyRow>
        ) : null}
      </div>
    </>
  );
}
