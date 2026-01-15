import { useMemo, useState } from 'react';

import type { ArchimateLayer, Element, ElementType, Model } from '../../../../domain';
import { ARCHIMATE_LAYERS, ELEMENT_TYPES_BY_LAYER } from '../../../../domain';

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

  return (
    <>
      <PropertyRow label="Layer">
        <select
          className="selectInput"
          aria-label="Element property layer"
          value={el.layer}
          onChange={(e) => {
            const nextLayer = e.target.value as ArchimateLayer;
            if (el.type !== 'Unknown') {
              const allowed = ELEMENT_TYPES_BY_LAYER[nextLayer] ?? [];
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
