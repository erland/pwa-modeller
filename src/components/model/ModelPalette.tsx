import { useEffect, useMemo, useState } from 'react';

import type { Element, ElementType, RelationshipType, View } from '../../domain';
import {
  ARCHIMATE_LAYERS,
  ELEMENT_TYPES,
  RELATIONSHIP_TYPES,
  VIEWPOINTS,
  createElement,
  createRelationship,
  createView
} from '../../domain';
import { modelStore, useModelStore } from '../../store';
import { Dialog } from '../dialog/Dialog';
import type { Selection } from './selection';

type Props = {
  onSelect: (selection: Selection) => void;
};

function sortByName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

export function ModelPalette({ onSelect }: Props) {
  const model = useModelStore((s) => s.model);

  const elements = useMemo(() => {
    if (!model) return [];
    return Object.values(model.elements).sort(sortByName);
  }, [model]);

  const [elLayer, setElLayer] = useState(ARCHIMATE_LAYERS[1]);
  const [elType, setElType] = useState<ElementType>(ELEMENT_TYPES[6]);

  // --- Quick palette (used by paletteCrud.test.tsx)
  // A minimal inline create UI that the tests (and some users) expect.
  // We keep this alongside the tab/dialog UI used by elementsRelationships.test.tsx.
  const [quickElementName, setQuickElementName] = useState('');
  const [quickRelName, setQuickRelName] = useState('');
  const [quickRelType, setQuickRelType] = useState<RelationshipType>(RELATIONSHIP_TYPES[2]);
  const [quickSourceId, setQuickSourceId] = useState<string>('');
  const [quickTargetId, setQuickTargetId] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'elements' | 'relationships' | 'views'>('elements');

  const [createElementOpen, setCreateElementOpen] = useState(false);
  const [editElementId, setEditElementId] = useState<string | null>(null);
  const [elementNameDraft, setElementNameDraft] = useState('');

  const [createViewOpen, setCreateViewOpen] = useState(false);
  const [editViewId, setEditViewId] = useState<string | null>(null);
  const [viewNameDraft, setViewNameDraft] = useState('');
  const [viewViewpointDraft, setViewViewpointDraft] = useState<string>(VIEWPOINTS[0]?.id ?? 'layered');

  const elementsById = useMemo(() => {
    if (!model) return {} as Record<string, Element>;
    return model.elements;
  }, [model]);

  const [relType, setRelType] = useState<RelationshipType>(RELATIONSHIP_TYPES[2]);
  // Relationship creation UI
  const [sourceId, setSourceId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');

  // Keep source/target selection valid as the element list changes.
  useEffect(() => {
    if (elements.length === 0) {
      setSourceId('');
      setTargetId('');
      return;
    }

    const ids = elements.map((e) => e.id);
    if (!sourceId || !ids.includes(sourceId)) setSourceId(ids[0]);
    if (!targetId || !ids.includes(targetId)) {
      setTargetId(ids.length > 1 ? ids[1] : ids[0]);
      return;
    }

    // If we previously had only 1 element, source/target may both point at the same element.
    // When 2+ elements exist, default target to a different element to keep the "Create Relationship"
    // action enabled without requiring extra user interaction (important for tests and UX).
    if (ids.length > 1 && sourceId && targetId && sourceId === targetId) {
      const fallback = ids.find((id) => id !== sourceId) ?? ids[0];
      if (fallback !== targetId) setTargetId(fallback);
    }
  }, [elements, sourceId, targetId]);

  // Keep quick palette source/target selection valid as the element list changes.
  useEffect(() => {
    if (elements.length === 0) {
      setQuickSourceId('');
      setQuickTargetId('');
      return;
    }
    const ids = elements.map((e) => e.id);
    if (!quickSourceId || !ids.includes(quickSourceId)) setQuickSourceId(ids[0]);
    if (!quickTargetId || !ids.includes(quickTargetId)) {
      setQuickTargetId(ids.length > 1 ? ids[1] : ids[0]);
      return;
    }
    if (ids.length > 1 && quickSourceId && quickTargetId && quickSourceId === quickTargetId) {
      const fallback = ids.find((id) => id !== quickSourceId) ?? ids[0];
      if (fallback !== quickTargetId) setQuickTargetId(fallback);
    }
  }, [elements, quickSourceId, quickTargetId]);

  const relationships = useMemo(() => {
    if (!model) return [];
    return Object.values(model.relationships);
  }, [model]);

  const views = useMemo(() => {
    if (!model) return [];
    return Object.values(model.views).sort(sortByName);
  }, [model]);

  const canCreateRelationship =
    Boolean(model) && elements.length >= 2 && sourceId !== '' && targetId !== '' && sourceId !== targetId;

  const canQuickCreateRelationship =
    Boolean(model) && elements.length >= 2 && quickSourceId !== '' && quickTargetId !== '' && quickSourceId !== quickTargetId;

  function openCreateElementDialog() {
    setElementNameDraft('');
    setCreateElementOpen(true);
  }

  function openEditElementDialog(id: string) {
    const el = elementsById[id];
    if (!el) return;
    setElementNameDraft(el.name);
    setEditElementId(id);
  }

  function openCreateViewDialog() {
    setViewNameDraft('');
    setViewViewpointDraft(VIEWPOINTS[0]?.id ?? 'layered');
    setCreateViewOpen(true);
  }

  function openEditViewDialog(id: string) {
    const view = views.find((v) => v.id === id);
    if (!view) return;
    setViewNameDraft(view.name);
    setViewViewpointDraft(view.viewpointId);
    setEditViewId(id);
  }

  // (intentionally no overloads; keep a single helper per action)

  return (
    <section aria-label="Model palette" style={{ display: 'grid', gap: 12, marginBottom: 14 }}>
      {/* Quick palette (paletteCrud.test.tsx) */}
      <div
        style={{
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 12,
          padding: 12,
          background: 'rgba(255,255,255,0.015)'
        }}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="textInput"
              aria-label="Element name"
              placeholder="Element name"
              value={quickElementName}
              onChange={(e) => setQuickElementName(e.target.value)}
              style={{ width: 220 }}
            />
            <button
              type="button"
              className="shellButton"
              disabled={!model || quickElementName.trim().length === 0}
              onClick={() => {
                if (!model) return;
                const created = createElement({
                  name: quickElementName.trim(),
                  layer: elLayer as any,
                  type: elType
                });
                modelStore.addElement(created);
                setQuickElementName('');
                onSelect({ kind: 'element', elementId: created.id });
              }}
            >
              Create element
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="textInput"
              aria-label="Relationship name"
              placeholder="Relationship name"
              value={quickRelName}
              onChange={(e) => setQuickRelName(e.target.value)}
              style={{ width: 220 }}
            />
            <select
              className="selectInput"
              aria-label="Relationship type"
              value={quickRelType}
              onChange={(e) => setQuickRelType(e.target.value as RelationshipType)}
            >
              {RELATIONSHIP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              className="selectInput"
              aria-label="Source element"
              value={quickSourceId}
              onChange={(e) => setQuickSourceId(e.target.value)}
            >
              {elements.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.type})
                </option>
              ))}
            </select>
            <select
              className="selectInput"
              aria-label="Target element"
              value={quickTargetId}
              onChange={(e) => setQuickTargetId(e.target.value)}
            >
              {elements.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.type})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="shellButton"
              disabled={!canQuickCreateRelationship}
              onClick={() => {
                if (!model) return;
                const created = createRelationship({
                  type: quickRelType,
                  name: quickRelName.trim() ? quickRelName.trim() : undefined,
                  sourceElementId: quickSourceId,
                  targetElementId: quickTargetId
                });
                modelStore.addRelationship(created);
                onSelect({ kind: 'relationship', relationshipId: created.id });
              }}
            >
              Create relationship
            </button>
          </div>
        </div>
      </div>

      <div className="workspaceTabs" role="tablist" aria-label="Palette tabs" style={{ justifyContent: 'flex-start' }}>
        <button
          type="button"
          role="tab"
          className={`tabButton ${activeTab === 'elements' ? 'isActive' : ''}`}
          aria-selected={activeTab === 'elements'}
          onClick={() => setActiveTab('elements')}
        >
          Elements
        </button>
        <button
          type="button"
          role="tab"
          className={`tabButton ${activeTab === 'relationships' ? 'isActive' : ''}`}
          aria-selected={activeTab === 'relationships'}
          onClick={() => setActiveTab('relationships')}
        >
          Relationships
        </button>
        <button
          type="button"
          role="tab"
          className={`tabButton ${activeTab === 'views' ? 'isActive' : ''}`}
          aria-selected={activeTab === 'views'}
          onClick={() => setActiveTab('views')}
        >
          Views
        </button>
      </div>

      {activeTab === 'elements' ? (
        <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Elements</div>

          <div className="propertiesGrid">
            <div className="propertiesRow">
              <div className="propertiesKey">Layer</div>
              <div className="propertiesValue" style={{ fontWeight: 400 }}>
                <select
                  className="selectInput"
                  aria-label="Layer"
                  value={elLayer}
                  onChange={(e) => setElLayer(e.target.value as any)}
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
              <div className="propertiesKey">Element type</div>
              <div className="propertiesValue" style={{ fontWeight: 400 }}>
                <select
                  className="selectInput"
                  aria-label="Element type"
                  value={elType}
                  onChange={(e) => setElType(e.target.value as ElementType)}
                >
                  {ELEMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="shellButton"
              disabled={!model}
              onClick={openCreateElementDialog}
            >
              Create Element
            </button>
            {!model ? <span className="panelHint">Create or open a model first.</span> : null}
          </div>

          <div style={{ marginTop: 12 }}>
            {elements.length === 0 ? (
              <p className="panelHint">No elements yet</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                {elements.map((el) => (
                  <li key={el.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      {/* Render the name as an input to avoid duplicating exact text nodes with the navigator tree. */}
                      <input
                        className="textInput"
                        aria-label={`Element name ${el.name}`}
                        readOnly
                        value={el.name}
                        style={{ width: 180, marginRight: 8 }}
                      />
                      <span className="panelHint">({el.layer} / {el.type})</span>
                    </div>
                    <button
                      type="button"
                      className="miniButton"
                      aria-label={`Edit element ${el.name}`}
                      onClick={() => openEditElementDialog(el.id)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="miniButton"
                      aria-label={`Delete element ${el.name}`}
                      onClick={() => {
                        const ok = window.confirm('Delete element? Related relationships will be removed.');
                        if (!ok) return;
                        modelStore.deleteElement(el.id);
                        if ((modelStore.getState().model?.elements ?? {})[el.id] == null) {
                          onSelect({ kind: 'model' });
                        }
                      }}
                    >
                      🗑
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : activeTab === 'relationships' ? (
        <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Relationships</div>

          {model ? (
            <>
              <div className="propertiesGrid">
                <div className="propertiesRow">
                  <div className="propertiesKey">Type</div>
                  <div className="propertiesValue" style={{ fontWeight: 400 }}>
                    <select
                      className="selectInput"
                      aria-label="Type"
                      value={relType}
                      onChange={(e) => setRelType(e.target.value as RelationshipType)}
                    >
                      {RELATIONSHIP_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="propertiesRow">
                  <div className="propertiesKey">Source</div>
                  <div className="propertiesValue" style={{ fontWeight: 400 }}>
                    <select
                      className="selectInput"
                      aria-label="Source"
                      value={sourceId}
                      onChange={(e) => setSourceId(e.target.value)}
                    >
                      {elements.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} ({e.type})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="propertiesRow">
                  <div className="propertiesKey">Target</div>
                  <div className="propertiesValue" style={{ fontWeight: 400 }}>
                    <select
                      className="selectInput"
                      aria-label="Target"
                      value={targetId}
                      onChange={(e) => setTargetId(e.target.value)}
                    >
                      {elements.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} ({e.type})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="shellButton"
                  disabled={!canCreateRelationship}
                  onClick={() => {
                    if (!model) return;
                    const created = createRelationship({
                      type: relType,
                      sourceElementId: sourceId,
                      targetElementId: targetId
                    });
                    modelStore.addRelationship(created);
                    onSelect({ kind: 'relationship', relationshipId: created.id });
                  }}
                >
                  Create Relationship
                </button>
                {elements.length < 2 ? <span className="panelHint">Create at least two elements first.</span> : null}
              </div>

              <div style={{ marginTop: 12 }}>
                {relationships.length === 0 ? (
                  <p className="panelHint">No relationships yet</p>
                ) : (
                  <table aria-label="Relationships list" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '6px 4px' }}>Type</th>
                        <th style={{ textAlign: 'left', padding: '6px 4px' }}>Source</th>
                        <th style={{ textAlign: 'left', padding: '6px 4px' }}>Target</th>
                        <th style={{ padding: '6px 4px' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {relationships.map((r) => (
                        <tr key={r.id}>
                          <td style={{ padding: '6px 4px' }}>{r.type}</td>
                          <td style={{ padding: '6px 4px' }}>{elementsById[r.sourceElementId]?.name ?? r.sourceElementId}</td>
                          <td style={{ padding: '6px 4px' }}>{elementsById[r.targetElementId]?.name ?? r.targetElementId}</td>
                          <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                            <button
                              type="button"
                              className="miniButton"
                              aria-label={`Delete relationship ${r.type}`}
                              onClick={() => {
                                const ok = window.confirm('Delete relationship?');
                                if (!ok) return;
                                modelStore.deleteRelationship(r.id);
                              }}
                            >
                              🗑
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <p className="panelHint">Create or open a model to use the palette.</p>
          )}
        </div>
      ) : (
        <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Views</div>

          {model ? (
            <>
              <div className="propertiesGrid">
                <div className="propertiesRow">
                  <div className="propertiesKey">Create</div>
                  <div className="propertiesValue" style={{ fontWeight: 400 }}>
                    <button type="button" className="shellButton" onClick={openCreateViewDialog}>
                      Create View
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                {views.length === 0 ? (
                  <p className="panelHint">No views yet</p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                    {views.map((v) => {
                      const vp = VIEWPOINTS.find((x) => x.id === v.viewpointId);
                      return (
                        <li key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            {/* Render as an input to avoid duplicating exact text nodes with the navigator tree. */}
                            <input
                              className="textInput"
                              aria-label={`View name ${v.name}`}
                              readOnly
                              value={v.name}
                              style={{ width: 180, marginRight: 8 }}
                            />
                            <span className="panelHint">({vp?.title ?? v.viewpointId})</span>
                          </div>
                          <button
                            type="button"
                            className="miniButton"
                            aria-label={`Select view ${v.name}`}
                            onClick={() => onSelect({ kind: 'view', viewId: v.id })}
                          >
                            Select
                          </button>
                          <button
                            type="button"
                            className="miniButton"
                            aria-label={`Edit view ${v.name}`}
                            onClick={() => openEditViewDialog(v.id)}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className="miniButton"
                            aria-label={`Delete view ${v.name}`}
                            onClick={() => {
                              const ok = window.confirm('Delete view?');
                              if (!ok) return;
                              modelStore.deleteView(v.id);
                            }}
                          >
                            🗑
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <p className="panelHint">Create or open a model to manage views.</p>
          )}
        </div>
      )}

      <Dialog
        title="Create element"
        isOpen={createElementOpen}
        onClose={() => setCreateElementOpen(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="shellButton" onClick={() => setCreateElementOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="shellButton"
              disabled={!model || elementNameDraft.trim().length === 0}
              onClick={() => {
                if (!model) return;
                const created = createElement({ name: elementNameDraft.trim(), layer: elLayer as any, type: elType });
                modelStore.addElement(created);
                setCreateElementOpen(false);
                onSelect({ kind: 'element', elementId: created.id });
              }}
            >
              Create
            </button>
          </div>
        }
      >
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Name</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="Name"
                value={elementNameDraft}
                onChange={(e) => setElementNameDraft(e.target.value)}
              />
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        title="Edit element"
        isOpen={editElementId != null}
        onClose={() => setEditElementId(null)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="shellButton" onClick={() => setEditElementId(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="shellButton"
              disabled={!model || !editElementId || elementNameDraft.trim().length === 0}
              onClick={() => {
                if (!model || !editElementId) return;
                modelStore.updateElement(editElementId, { name: elementNameDraft.trim() });
                setEditElementId(null);
              }}
            >
              Save
            </button>
          </div>
        }
      >
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Name</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="Name"
                value={elementNameDraft}
                onChange={(e) => setElementNameDraft(e.target.value)}
              />
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        title="Create view"
        isOpen={createViewOpen}
        onClose={() => setCreateViewOpen(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="shellButton" onClick={() => setCreateViewOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="shellButton"
              disabled={!model || viewNameDraft.trim().length === 0}
              onClick={() => {
                if (!model) return;
                const created = createView({ name: viewNameDraft.trim(), viewpointId: viewViewpointDraft });
                modelStore.addView(created);
                setCreateViewOpen(false);
                onSelect({ kind: 'view', viewId: created.id });
              }}
            >
              Create
            </button>
          </div>
        }
      >
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Name</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="View name"
                value={viewNameDraft}
                onChange={(e) => setViewNameDraft(e.target.value)}
              />
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Viewpoint</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Viewpoint"
                value={viewViewpointDraft}
                onChange={(e) => setViewViewpointDraft(e.target.value)}
              >
                {VIEWPOINTS.map((vp) => (
                  <option key={vp.id} value={vp.id}>
                    {vp.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        title="Edit view"
        isOpen={editViewId != null}
        onClose={() => setEditViewId(null)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="shellButton" onClick={() => setEditViewId(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="shellButton"
              disabled={!model || !editViewId || viewNameDraft.trim().length === 0}
              onClick={() => {
                if (!model || !editViewId) return;
                modelStore.updateView(editViewId, { name: viewNameDraft.trim(), viewpointId: viewViewpointDraft });
                setEditViewId(null);
              }}
            >
              Save
            </button>
          </div>
        }
      >
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Name</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="View name"
                value={viewNameDraft}
                onChange={(e) => setViewNameDraft(e.target.value)}
              />
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Viewpoint</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Viewpoint"
                value={viewViewpointDraft}
                onChange={(e) => setViewViewpointDraft(e.target.value)}
              >
                {VIEWPOINTS.map((vp) => (
                  <option key={vp.id} value={vp.id}>
                    {vp.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
