import { useEffect, useMemo, useState } from 'react';

import type { Model } from '../../../domain';
import { ARCHIMATE_LAYERS, ELEMENT_TYPES, computeRelationshipTrace } from '../../../domain';
import type { FolderOption } from '../../../domain';

import type { Selection } from '../selection';
import type { ModelActions } from './actions';
import { findFolderContaining, getElementLabel, splitRelationshipsForElement } from './utils';
import { CreateRelationshipDialog } from '../navigator/dialogs/CreateRelationshipDialog';

type TraceDirection = 'outgoing' | 'incoming' | 'both';

type Props = {
  model: Model;
  elementId: string;
  actions: ModelActions;
  elementFolders: FolderOption[];
  onSelect?: (selection: Selection) => void;
};

export function ElementProperties({ model, elementId, actions, elementFolders, onSelect }: Props) {
  const el = model.elements[elementId];
  if (!el) return <p className="panelHint">Element not found.</p>;

  const [createRelationshipOpen, setCreateRelationshipOpen] = useState(false);

  const [traceDirection, setTraceDirection] = useState<TraceDirection>('both');
  const [traceDepth, setTraceDepth] = useState<number>(1);

  useEffect(() => {
    setTraceDirection('both');
    setTraceDepth(1);
  }, [elementId]);

  const currentFolderId = findFolderContaining(model, 'element', el.id);

  const relatedForElement = useMemo(() => {
    return splitRelationshipsForElement(model, elementId);
  }, [model, elementId]);

  const traceSteps = useMemo(() => {
    return computeRelationshipTrace(model, elementId, traceDirection, traceDepth);
  }, [model, elementId, traceDirection, traceDepth]);

  const incoming = relatedForElement.incoming;
  const outgoing = relatedForElement.outgoing;

  const usedInViews = useMemo(() => {
    return Object.values(model.views)
      .filter((v) => v.layout && v.layout.nodes.some((n) => n.elementId === el.id))
      .map((v) => {
        const count = v.layout ? v.layout.nodes.filter((n) => n.elementId === el.id).length : 0;
        return { id: v.id, name: v.name, count };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [model, el.id]);

  const canCreateRelationship = Object.keys(model.elements).length >= 2;
  const onSelectSafe = onSelect ?? (() => undefined);

  return (
    <div>
      <p className="panelHint">Element</p>
      <div className="propertiesGrid">
        <div className="propertiesRow">
          <div className="propertiesKey">Name</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <input
              className="textInput"
              aria-label="Element property name"
              value={el.name}
              onChange={(e) => actions.updateElement(el.id, { name: e.target.value })}
            />
          </div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Type</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <select
              className="selectInput"
              aria-label="Element property type"
              value={el.type}
              onChange={(e) => actions.updateElement(el.id, { type: e.target.value as any })}
            >
              {ELEMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Layer</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <select
              className="selectInput"
              aria-label="Element property layer"
              value={el.layer}
              onChange={(e) => actions.updateElement(el.id, { layer: e.target.value as any })}
            >
              {ARCHIMATE_LAYERS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Description</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <textarea
              className="textArea"
              aria-label="Element property description"
              value={el.description ?? ''}
              onChange={(e) => actions.updateElement(el.id, { description: e.target.value || undefined })}
            />
          </div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Docs</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <textarea
              className="textArea"
              aria-label="Element property documentation"
              value={el.documentation ?? ''}
              onChange={(e) => actions.updateElement(el.id, { documentation: e.target.value || undefined })}
            />
          </div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Folder</div>
          <div className="propertiesValue">
            <select
              className="selectInput"
              value={currentFolderId ?? ''}
              onChange={(e) => {
                const targetId = e.target.value;
                if (targetId) actions.moveElementToFolder(el.id, targetId);
              }}
            >
              {elementFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <p className="panelHint" style={{ margin: 0 }}>
            Relationships
          </p>
          <button
            type="button"
            className="miniButton"
            disabled={!canCreateRelationship}
            title={canCreateRelationship ? 'Create relationship' : 'Create at least two elements first'}
            onClick={() => setCreateRelationshipOpen(true)}
          >
            New relationship…
          </button>
        </div>
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Used in views</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              {usedInViews.length === 0 ? (
                <span style={{ opacity: 0.7 }}>None</span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {usedInViews.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className="miniButton"
                      aria-label={`Select view ${v.name}`}
                      onClick={() => onSelect?.({ kind: 'viewNode', viewId: v.id, elementId: el.id })}
                    >
                      {v.name}
                      {v.count > 1 ? ` (${v.count})` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Outgoing</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              {outgoing.length === 0 ? (
                <span style={{ opacity: 0.7 }}>None</span>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {outgoing.map((r) => {
                    const targetName = getElementLabel(model, r.targetElementId);
                    const relLabel = `${r.type}${r.name ? ` — ${r.name}` : ''}`;
                    return (
                      <div key={r.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        <button
                          type="button"
                          className="miniButton"
                          aria-label={`Select relationship ${relLabel}`}
                          onClick={() => onSelect?.({ kind: 'relationship', relationshipId: r.id })}
                        >
                          {relLabel}
                        </button>
                        <span style={{ opacity: 0.7 }}>→</span>
                        <button
                          type="button"
                          className="miniButton"
                          aria-label={`Select target element ${targetName}`}
                          onClick={() => onSelect?.({ kind: 'element', elementId: r.targetElementId })}
                        >
                          {targetName}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Incoming</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              {incoming.length === 0 ? (
                <span style={{ opacity: 0.7 }}>None</span>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {incoming.map((r) => {
                    const sourceName = getElementLabel(model, r.sourceElementId);
                    const relLabel = `${r.type}${r.name ? ` — ${r.name}` : ''}`;
                    return (
                      <div key={r.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        <button
                          type="button"
                          className="miniButton"
                          aria-label={`Select source element ${sourceName}`}
                          onClick={() => onSelect?.({ kind: 'element', elementId: r.sourceElementId })}
                        >
                          {sourceName}
                        </button>
                        <span style={{ opacity: 0.7 }}>→</span>
                        <button
                          type="button"
                          className="miniButton"
                          aria-label={`Select relationship ${relLabel}`}
                          onClick={() => onSelect?.({ kind: 'relationship', relationshipId: r.id })}
                        >
                          {relLabel}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <p className="panelHint">Trace</p>
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Direction</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Trace direction"
                value={traceDirection}
                onChange={(e) => setTraceDirection(e.target.value as TraceDirection)}
              >
                <option value="both">Both</option>
                <option value="outgoing">Outgoing</option>
                <option value="incoming">Incoming</option>
              </select>
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Depth</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Trace depth"
                value={String(traceDepth)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setTraceDepth(Number.isFinite(n) && n >= 1 && n <= 5 ? n : 1);
                }}
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
          {traceSteps.length === 0 ? (
            <div style={{ opacity: 0.7 }}>No trace results.</div>
          ) : (
            traceSteps.map((s, idx) => {
              const relLabel = `${s.relationship.type}${s.relationship.name ? ` — ${s.relationship.name}` : ''}`;
              const fromName = getElementLabel(model, s.fromId);
              const toName = getElementLabel(model, s.toId);
              return (
                <div
                  key={`${s.relationship.id}_${idx}`}
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}
                >
                  <span style={{ opacity: 0.7 }}>d{s.depth}</span>
                  <button
                    type="button"
                    className="miniButton"
                    aria-label={`Select relationship ${relLabel}`}
                    onClick={() => onSelect?.({ kind: 'relationship', relationshipId: s.relationship.id })}
                  >
                    {relLabel}
                  </button>
                  <span style={{ opacity: 0.7 }}>:</span>
                  <button
                    type="button"
                    className="miniButton"
                    aria-label={`Select element ${fromName}`}
                    onClick={() => onSelect?.({ kind: 'element', elementId: s.fromId })}
                  >
                    {fromName}
                  </button>
                  <span style={{ opacity: 0.7 }}>→</span>
                  <button
                    type="button"
                    className="miniButton"
                    aria-label={`Select element ${toName}`}
                    onClick={() => onSelect?.({ kind: 'element', elementId: s.toId })}
                  >
                    {toName}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            const ok = window.confirm('Delete this element? Relationships referencing it will also be removed.');
            if (!ok) return;
            actions.deleteElement(el.id);
          }}
        >
          Delete element
        </button>
      </div>

      <CreateRelationshipDialog
        model={model}
        isOpen={createRelationshipOpen}
        prefillSourceElementId={el.id}
        onClose={() => setCreateRelationshipOpen(false)}
        onSelect={onSelectSafe}
      />
    </div>
  );
}
