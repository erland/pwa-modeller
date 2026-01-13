import type * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Model, View } from '../../../domain';
import { createElement, createViewObject, createViewObjectNodeLayout, getDefaultViewObjectSize } from '../../../domain';
import { modelStore } from '../../../store';
import type { Selection } from '../../model/selection';
import type { Point } from '../geometry';

export type ToolMode =
  | 'select'
  | 'addNote'
  | 'addLabel'
  | 'addGroupBox'
  | 'addDivider'
  // UML palette (class diagram v1)
  | 'addUmlClass'
  | 'addUmlInterface'
  | 'addUmlEnum'
  | 'addUmlPackage'
  | 'addUmlNote';

export type GroupBoxDraft = {
  start: Point;
  current: Point;
};

type Args = {
  model: Model | null;
  activeViewId: string | null;
  activeView: View | null;
  clientToModelPoint: (clientX: number, clientY: number) => Point | null;
  onSelect: (sel: Selection) => void;
};

export function useDiagramToolState({ model, activeViewId, activeView, clientToModelPoint, onSelect }: Args) {
  const [toolMode, setToolMode] = useState<ToolMode>('select');

  const [groupBoxDraft, setGroupBoxDraft] = useState<GroupBoxDraft | null>(null);
  const groupBoxDraftRef = useRef<GroupBoxDraft | null>(null);

  // Tool mode: Escape cancels placement / returns to select.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setGroupBoxDraft(null);
        setToolMode('select');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const beginGroupBoxDraft = useCallback(
    (start: Point) => {
      if (!activeViewId) return;
      const initial: GroupBoxDraft = { start, current: start };
      groupBoxDraftRef.current = initial;
      setGroupBoxDraft(initial);

      function onMove(e: PointerEvent) {
        const p = clientToModelPoint(e.clientX, e.clientY);
        if (!p) return;
        const next = { start, current: p };
        groupBoxDraftRef.current = next;
        setGroupBoxDraft(next);
      }

      function onUp(e: PointerEvent) {
        const end = clientToModelPoint(e.clientX, e.clientY);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);

        const draft = groupBoxDraftRef.current;
        groupBoxDraftRef.current = null;
        setGroupBoxDraft(null);

        if (!draft || !activeViewId) return;

        const p1 = draft.start;
        const p2 = end ?? draft.current;

        const x0 = Math.min(p1.x, p2.x);
        const y0 = Math.min(p1.y, p2.y);
        const w0 = Math.abs(p1.x - p2.x);
        const h0 = Math.abs(p1.y - p2.y);

        const minSize = 10;
        const useDefault = w0 < minSize && h0 < minSize;
        const size = useDefault
          ? getDefaultViewObjectSize('GroupBox')
          : { width: Math.max(minSize, w0), height: Math.max(minSize, h0) };

        const obj = createViewObject({ type: 'GroupBox' });
        const node = { ...createViewObjectNodeLayout(obj.id, x0, y0, size.width, size.height), zIndex: -100 };
        modelStore.addViewObject(activeViewId, obj, node);
        onSelect({ kind: 'viewObject', viewId: activeViewId, objectId: obj.id });
        setToolMode('select');
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [activeViewId, clientToModelPoint, onSelect]
  );

  const findFolderContainingView = useCallback(
    (m: Model, viewId: string): string | undefined => {
      // Best-effort: place newly created elements in the same folder as the view.
      // If the view is centered under an element (not in any folder), fall back to root.
      for (const f of Object.values(m.folders)) {
        if (f.viewIds.includes(viewId)) return f.id;
      }
      return undefined;
    },
    []
  );

  const createUmlElementInViewAt = useCallback(
    (umlType: 'uml.class' | 'uml.interface' | 'uml.enum' | 'uml.package' | 'uml.note', x: number, y: number) => {
      if (!model || !activeViewId || !activeView) return;
      if (activeView.kind !== 'uml') return;

      const defaultName =
        umlType === 'uml.class'
          ? 'Class'
          : umlType === 'uml.interface'
            ? 'Interface'
            : umlType === 'uml.enum'
              ? 'Enum'
              : umlType === 'uml.package'
                ? 'Package'
                : 'Note';

      const el = createElement({ name: defaultName, type: umlType });
      const folderId = findFolderContainingView(model, activeViewId);
      modelStore.addElement(el, folderId);
      modelStore.addElementToViewAt(activeViewId, el.id, x, y);

      // Better default sizes for UML compartments.
      const size =
        umlType === 'uml.note'
          ? { width: 220, height: 140 }
          : umlType === 'uml.package'
            ? { width: 220, height: 110 }
            : { width: 220, height: 150 };
      modelStore.updateViewNodeLayout(activeViewId, el.id, { width: size.width, height: size.height });

      onSelect({ kind: 'viewNode', viewId: activeViewId, elementId: el.id });
      setToolMode('select');
    },
    [activeView, activeViewId, findFolderContainingView, model, onSelect]
  );

  const onSurfacePointerDownCapture = useCallback(
    (e: React.PointerEvent) => {
      if (!model || !activeViewId || !activeView) return;
      if (toolMode === 'select') return;

      const target = e.target as HTMLElement | null;
      if (target?.closest('.diagramNode, .diagramConnectorNode, .diagramViewObjectNode')) {
        return;
      }

      const p = clientToModelPoint(e.clientX, e.clientY);
      if (!p) return;

      e.preventDefault();
      e.stopPropagation();

      if (toolMode === 'addNote') {
        const id = modelStore.createViewObjectInViewAt(activeViewId, 'Note', p.x, p.y);
        onSelect({ kind: 'viewObject', viewId: activeViewId, objectId: id });
        setToolMode('select');
      } else if (toolMode === 'addLabel') {
        const id = modelStore.createViewObjectInViewAt(activeViewId, 'Label', p.x, p.y);
        onSelect({ kind: 'viewObject', viewId: activeViewId, objectId: id });
        setToolMode('select');
      } else if (toolMode === 'addDivider') {
        const id = modelStore.createViewObjectInViewAt(activeViewId, 'Divider', p.x, p.y);
        onSelect({ kind: 'viewObject', viewId: activeViewId, objectId: id });
        setToolMode('select');
      } else if (toolMode === 'addGroupBox') {
        beginGroupBoxDraft(p);
      } else if (toolMode === 'addUmlClass') {
        createUmlElementInViewAt('uml.class', p.x, p.y);
      } else if (toolMode === 'addUmlInterface') {
        createUmlElementInViewAt('uml.interface', p.x, p.y);
      } else if (toolMode === 'addUmlEnum') {
        createUmlElementInViewAt('uml.enum', p.x, p.y);
      } else if (toolMode === 'addUmlPackage') {
        createUmlElementInViewAt('uml.package', p.x, p.y);
      } else if (toolMode === 'addUmlNote') {
        createUmlElementInViewAt('uml.note', p.x, p.y);
      }
    },
    [
      model,
      activeViewId,
      activeView,
      toolMode,
      clientToModelPoint,
      beginGroupBoxDraft,
      createUmlElementInViewAt,
      onSelect,
    ]
  );

  return { toolMode, setToolMode, groupBoxDraft, onSurfacePointerDownCapture };
}
