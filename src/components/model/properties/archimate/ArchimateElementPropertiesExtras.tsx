import { useMemo, useState } from 'react';

import type { ArchimateLayer, Element, ElementType, Model } from '../../../../domain';
import { ARCHIMATE_LAYERS, ELEMENT_TYPES, ELEMENT_TYPES_BY_LAYER, getElementTypeLabel } from '../../../../domain';

import type { Selection } from '../../selection';
import type { ModelActions } from '../actions';
import { findFolderByKind } from '../utils';
import { CreateViewDialog } from '../../navigator/dialogs/CreateViewDialog';
import { PropertyRow } from '../editors/PropertyRow';

type Props = {
  model: Model;
  element: Element;
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
};

export function ArchimateElementPropertiesExtras({ model, element: el, actions, onSelect }: Props) {
  const [createUmlViewOpen, setCreateUmlViewOpen] = useState(false);

  const linkedUmlViews = useMemo(() => {
    return Object.values(model.views)
      .filter((v) => v.kind === 'uml' && v.ownerRef?.kind === 'archimate' && v.ownerRef.id === el.id)
      .map((v) => ({ id: v.id, name: v.name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [model, el.id]);

  const fallbackViewsFolderId = useMemo(() => {
    try {
      return findFolderByKind(model, 'views').id;
    } catch {
      return findFolderByKind(model, 'root').id;
    }
  }, [model]);


  const safeLayer: ArchimateLayer = el.layer ?? ARCHIMATE_LAYERS[0];

  const layerForElementType = useMemo(() => {
    const m = new Map<ElementType, ArchimateLayer>();
    for (const layer of ARCHIMATE_LAYERS) {
      const types = ELEMENT_TYPES_BY_LAYER[layer] ?? [];
      for (const t of types) m.set(t, layer);
    }
    return m;
  }, []);

  const allowedTypesForLayer = useMemo<ElementType[]>(() => {
    return ELEMENT_TYPES_BY_LAYER[safeLayer] ?? [];
  }, [safeLayer]);

  const [showAllElementTypes, setShowAllElementTypes] = useState(false);

  const isTypeOutOfSync =
    (el.type as ElementType) !== 'Unknown' && allowedTypesForLayer.length > 0 && !allowedTypesForLayer.includes(el.type as ElementType);

  const elementTypeOptions = useMemo<ElementType[]>(() => {
    const base = showAllElementTypes ? ELEMENT_TYPES : allowedTypesForLayer;
    const withUnknown = (el.type as ElementType) === 'Unknown' ? (['Unknown', ...base] as ElementType[]) : base;

    // Keep current value visible even if it is out-of-sync (e.g., imported data).
    return withUnknown.includes(el.type as ElementType) ? withUnknown : ([el.type as ElementType, ...withUnknown] as ElementType[]);
  }, [allowedTypesForLayer, showAllElementTypes, el.type]);


  return (
    <>
      <p className="panelHint">ArchiMate</p>
      <div className="propertiesGrid">
        <PropertyRow label="Type">
          <select
            className="selectInput"
            value={el.type}
            onChange={(e) => {
              const nextType = e.target.value as ElementType;
              if (nextType === 'Unknown') {
                actions.updateElement(el.id, { type: nextType });
                return;
              }
              const derivedLayer = layerForElementType.get(nextType);
              actions.updateElement(el.id, { type: nextType, layer: derivedLayer ?? safeLayer });
            }}
          >
            {elementTypeOptions.map((t) => (
              <option key={t} value={t}>
                {t === 'Unknown' ? (el.unknownType?.name ? `Unknown: ${el.unknownType.name}` : 'Unknown') : getElementTypeLabel(t)}
              </option>
            ))}
          </select>
        </PropertyRow>

        <PropertyRow label="Layer">
          <select
            className="selectInput"
            value={safeLayer}
            onChange={(e) => {
              const nextLayer = e.target.value as ArchimateLayer;
              const allowed = ELEMENT_TYPES_BY_LAYER[nextLayer] ?? [];
              if (allowed.length > 0 && el.type !== 'Unknown') {
                if (!allowed.includes(el.type as ElementType)) {
                  const nextType: ElementType = (allowed[0] as ElementType) ?? (el.type as ElementType);
                  actions.updateElement(el.id, { layer: nextLayer, type: nextType });
                  return;
                }
              }
              actions.updateElement(el.id, { layer: nextLayer });
            }}
          >
            {ARCHIMATE_LAYERS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </PropertyRow>
      </div>

      {isTypeOutOfSync ? (
        <div className="panelWarning" style={{ marginTop: 8 }}>
          This element&apos;s <strong>Type</strong> does not belong to its <strong>Layer</strong>. Select a Type (or Layer)
          to re-sync. If you change Type, the Layer will update automatically.
        </div>
      ) : null}

      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="miniButton"
          onClick={() => setShowAllElementTypes((v) => !v)}
          title="Toggle showing all element types (advanced)"
        >
          {showAllElementTypes ? 'Show only layer types' : 'Show all element types'}
        </button>
      </div>


      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <p className="panelHint" style={{ margin: 0 }}>
            UML drill-down
          </p>
          <button
            type="button"
            className="miniButton"
            title="Create a linked UML Class Diagram view for this element"
            onClick={() => setCreateUmlViewOpen(true)}
          >
            Create UML diagram…
          </button>
        </div>

        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Linked UML views</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              {linkedUmlViews.length === 0 ? (
                <span style={{ opacity: 0.7 }}>None</span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {linkedUmlViews.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className="miniButton"
                      aria-label={`Select view ${v.name}`}
                      onClick={() => onSelect?.({ kind: 'viewNode', viewId: v.id, elementId: el.id })}
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <CreateViewDialog
        isOpen={createUmlViewOpen}
        targetFolderId={fallbackViewsFolderId}
        ownerElementId={el.id}
        initialKind="uml"
        onClose={() => setCreateUmlViewOpen(false)}
        onSelect={onSelect ?? (() => undefined)}
      />
    </>
  );
}
