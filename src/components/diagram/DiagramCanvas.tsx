import { useEffect, useMemo, useRef, useState } from 'react';
import type { View } from '../../domain';
import { modelStore } from '../../store';
import { useModelStore } from '../../store/useModelStore';
import type { Selection } from '../model/selection';

type Props = {
  selection: Selection;
  onSelect: (sel: Selection) => void;
};

function sortViews(views: Record<string, View>): View[] {
  return Object.values(views).sort((a, b) => a.name.localeCompare(b.name));
}

export function DiagramCanvas({ selection, onSelect }: Props) {
  const model = useModelStore((s) => s.model);

  const views = useMemo(() => (model ? sortViews(model.views) : []), [model]);

  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  useEffect(() => {
    if (!model) {
      setActiveViewId(null);
      return;
    }
    if (selection.kind === 'view') {
      setActiveViewId(selection.viewId);
      return;
    }
    if (activeViewId && model.views[activeViewId]) return;
    setActiveViewId(views[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, selection.kind === 'view' ? selection.viewId : null, views.length]);

  const activeView = model && activeViewId ? model.views[activeViewId] : null;

  const elements = useMemo(() => {
    if (!model) return [] as { id: string; name: string; label: string }[];
    return Object.values(model.elements)
      .map((e) => ({ id: e.id, name: e.name, label: `${e.name || '(unnamed)'} (${e.type})` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [model]);

  const [elementToAdd, setElementToAdd] = useState<string>('');
  useEffect(() => {
    if (!elementToAdd && elements.length > 0) setElementToAdd(elements[0].id);
  }, [elementToAdd, elements]);

  const canAdd = Boolean(model && activeViewId && elementToAdd);

  function handleAdd() {
    if (!model || !activeViewId || !elementToAdd) return;
    modelStore.addElementToView(activeViewId, elementToAdd);
  }

  // Basic drag handling
  const dragRef = useRef<{
    viewId: string;
    elementId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    function onMove(ev: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      modelStore.updateViewNodePosition(d.viewId, d.elementId, d.origX + dx, d.origY + dy);
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  if (!model) {
    return (
      <div aria-label="Diagram canvas" className="diagramCanvas">
        <div className="diagramEmpty">Create or open a model to start diagramming.</div>
      </div>
    );
  }

  return (
    <div className="diagramWrap">
      <div className="diagramToolbar" aria-label="Diagram toolbar">
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="fieldLabel" htmlFor="active-view">
            Current view
          </label>
          <select
            id="active-view"
            aria-label="Current view"
            className="selectInput"
            value={activeViewId ?? ''}
            onChange={(e) => {
              const vid = e.currentTarget.value;
              setActiveViewId(vid);
              onSelect({ kind: 'view', viewId: vid });
            }}
            disabled={views.length === 0}
          >
            {views.length === 0 ? (
              <option value="">(no views)</option>
            ) : (
              views.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))
            )}
          </select>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label className="fieldLabel" htmlFor="element-to-add">
            Add element
          </label>
          <select
            id="element-to-add"
            aria-label="Element to add"
            className="selectInput"
            value={elementToAdd}
            onChange={(e) => setElementToAdd(e.currentTarget.value)}
            disabled={elements.length === 0 || views.length === 0}
          >
            {elements.length === 0 ? (
              <option value="">(no elements)</option>
            ) : (
              elements.map((el) => (
                <option key={el.id} value={el.id}>
                  {el.label}
                </option>
              ))
            )}
          </select>
        </div>

        <button className="shellButton" type="button" onClick={handleAdd} disabled={!canAdd || views.length === 0}>
          Add to view
        </button>
      </div>

      <div aria-label="Diagram canvas" className="diagramCanvas">
        {views.length === 0 ? (
          <div className="diagramEmpty">Create a view (Palette ▸ Views) to start placing elements.</div>
        ) : !activeView ? (
          <div className="diagramEmpty">Select a view to start diagramming.</div>
        ) : (
          <>
            <div className="diagramHint">
              <span style={{ fontWeight: 700 }}>{activeView.name}</span>
              <span style={{ opacity: 0.8 }}>
                {' '}
                — drag nodes to reposition (basic)
              </span>
            </div>
            {(activeView.layout?.nodes ?? []).map((n) => {
              const el = model.elements[n.elementId];
              if (!el) return null;
              return (
                <div
                  key={n.elementId}
                  className="diagramNode"
                  style={{ left: n.x, top: n.y, width: n.width ?? 120, height: n.height ?? 60 }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Diagram node ${el.name || '(unnamed)'}`}
                  onClick={() => onSelect({ kind: 'element', elementId: el.id })}
                  onPointerDown={(ev) => {
                    dragRef.current = {
                      viewId: activeView.id,
                      elementId: n.elementId,
                      startX: ev.clientX,
                      startY: ev.clientY,
                      origX: n.x,
                      origY: n.y
                    };
                  }}
                >
                  <div className="diagramNodeTitle">{el.name || '(unnamed)'}</div>
                  <div className="diagramNodeMeta">{el.type}</div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
