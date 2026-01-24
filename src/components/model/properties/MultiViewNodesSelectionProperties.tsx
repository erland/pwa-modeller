import { useMemo, useState } from 'react';

import type { ArchimateLayer, Element, Model } from '../../../domain';
import { ARCHIMATE_LAYERS } from '../../../domain';

import type { Selection } from '../selection';
import type { ModelActions } from './actions';
import { PropertyRow } from './editors/PropertyRow';

type Props = {
  model: Model;
  viewId: string;
  elementIds: string[];
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
};

function getElementLabel(el: Element): string {
  return el.name?.trim() ? el.name : el.type;
}

export function MultiViewNodesSelectionProperties({ model, viewId, elementIds, actions, onSelect }: Props) {
  const selectedElements = useMemo(() => {
    const els: Element[] = [];
    for (const id of elementIds) {
      const el = model.elements[id];
      if (el) els.push(el);
    }
    return els;
  }, [model, elementIds]);

  const count = selectedElements.length;

  const selectionSummary = count === 1 ? '1 item selected' : `${count} items selected`;

  const view = model.views[viewId];

  const lockState = useMemo(() => {
    const nodes = view?.layout?.nodes ?? [];
    const selectedNodes = nodes.filter((n) => n.elementId && elementIds.includes(n.elementId));
    const lockedCount = selectedNodes.filter((n) => Boolean(n.locked)).length;
    return { total: selectedNodes.length, lockedCount };
  }, [view, elementIds]);

  const allArchimate = selectedElements.length > 0 && selectedElements.every((e) => e.kind === 'archimate');
  const commonLayer = useMemo<ArchimateLayer | null>(() => {
    if (!allArchimate) return null;
    const first = (selectedElements[0] as unknown as { layer?: ArchimateLayer }).layer;
    if (!first) return null;
    for (const el of selectedElements) {
      const l = (el as unknown as { layer?: ArchimateLayer }).layer;
      if (l !== first) return null;
    }
    return first;
  }, [allArchimate, selectedElements]);

  const [layerChoice, setLayerChoice] = useState<ArchimateLayer | ''>(commonLayer ?? '');

  const hasView = Boolean(view);
  const canLock = hasView && lockState.total > 0;

  const onDelete = () => {
    const ok = window.confirm(
      count === 1
        ? 'Delete this element? This will remove it from all views.'
        : `Delete ${count} elements? This will remove them from all views.`
    );
    if (!ok) return;

    for (const id of elementIds) actions.deleteElement(id);

    onSelect?.({ kind: 'none' });
  };

  const onLock = () => {
    if (!canLock) return;
    for (const id of elementIds) actions.updateViewNodeLayout(viewId, id, { locked: true });
  };

  const onUnlock = () => {
    if (!canLock) return;
    for (const id of elementIds) actions.updateViewNodeLayout(viewId, id, { locked: false });
  };

  const onApplyLayer = (next: ArchimateLayer) => {
    for (const id of elementIds) actions.updateElement(id, ({ layer: next } as unknown) as Partial<Element>);
  };

  return (
    <div className="properties-panel">
      <h3>Selection</h3>

      <PropertyRow label="Summary">
        <div>{selectionSummary}</div>
      </PropertyRow>

      {count > 0 && (
        <PropertyRow label="Items">
          <div style={{ maxHeight: 160, overflow: 'auto' }}>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {selectedElements.slice(0, 20).map((el) => (
                <li key={el.id}>{getElementLabel(el)}</li>
              ))}
              {selectedElements.length > 20 && <li>and more</li>}
            </ul>
          </div>
        </PropertyRow>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button onClick={onDelete} disabled={count === 0}>
          Delete
        </button>

        <button onClick={onLock} disabled={!canLock}>
          Lock
        </button>

        <button onClick={onUnlock} disabled={!canLock}>
          Unlock
        </button>
      </div>

      {allArchimate && (
        <div style={{ marginTop: 16 }}>
          <h4>ArchiMate</h4>
          <PropertyRow label="Layer">
            <select
              value={layerChoice}
              onChange={(e) => {
                const v = e.target.value as ArchimateLayer;
                setLayerChoice(v);
                if (v) onApplyLayer(v);
              }}
            >
              {commonLayer === null && <option value="">Mixed</option>}
              {ARCHIMATE_LAYERS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </PropertyRow>
        </div>
      )}
    </div>
  );
}
