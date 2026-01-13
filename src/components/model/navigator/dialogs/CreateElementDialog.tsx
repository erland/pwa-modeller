import { useEffect, useMemo, useState } from 'react';

import type { ArchimateLayer, ElementType, ModelKind, TypeOption } from '../../../../domain';
import {
  ARCHIMATE_LAYERS,
  ELEMENT_TYPES_BY_LAYER,
  createElement,
  getElementTypeOptionsForKind
} from '../../../../domain';
import { modelStore } from '../../../../store';
import { Dialog } from '../../../dialog/Dialog';
import type { Selection } from '../../selection';

type Props = {
  isOpen: boolean;
  targetFolderId: string;
  onClose: () => void;
  onSelect: (selection: Selection) => void;

  /**
   * Which notation-kind to create the element for.
   * Defaults to 'archimate' to preserve existing behavior.
   */
  kind?: ModelKind;

  /**
   * Optional initial type (useful when launching from a palette button).
   * Must belong to the selected kind, otherwise ignored.
   */
  initialTypeId?: ElementType;
};

const DEFAULT_ARCHIMATE_LAYER: ArchimateLayer = ARCHIMATE_LAYERS[1] ?? 'Business';

function defaultArchimateTypeForLayer(layer: ArchimateLayer): ElementType {
  const opts = ELEMENT_TYPES_BY_LAYER[layer] ?? [];
  return (opts[0] ?? 'BusinessActor') as ElementType;
}

function computeDefaultType(kind: ModelKind, initialTypeId: ElementType | undefined, layer: ArchimateLayer): ElementType {
  if (kind === 'uml') {
    if (initialTypeId?.startsWith('uml.')) return initialTypeId;
    return 'uml.class';
  }
  // TODO: BPMN
  return defaultArchimateTypeForLayer(layer);
}

export function CreateElementDialog({
  isOpen,
  targetFolderId,
  onClose,
  onSelect,
  kind,
  initialTypeId
}: Props) {
  const effectiveKind: ModelKind = kind ?? 'archimate';

  const [nameDraft, setNameDraft] = useState('');
  const [layerDraft, setLayerDraft] = useState<ArchimateLayer>(DEFAULT_ARCHIMATE_LAYER);
  const [typeDraft, setTypeDraft] = useState<ElementType>(() =>
    computeDefaultType(effectiveKind, initialTypeId, DEFAULT_ARCHIMATE_LAYER)
  );

  // Reset drafts when opening (and when kind/initial type changes while open).
  useEffect(() => {
    if (!isOpen) return;
    setNameDraft('');
    setLayerDraft(DEFAULT_ARCHIMATE_LAYER);
    setTypeDraft(computeDefaultType(effectiveKind, initialTypeId, DEFAULT_ARCHIMATE_LAYER));
  }, [isOpen, effectiveKind, initialTypeId]);

  // Keep element type selection valid when layer changes (ArchiMate only).
  useEffect(() => {
    if (effectiveKind !== 'archimate') return;
    const opts = ELEMENT_TYPES_BY_LAYER[layerDraft] ?? [];
    if (opts.length === 0) return;
    if (!opts.includes(typeDraft)) setTypeDraft(opts[0] as ElementType);
  }, [effectiveKind, layerDraft, typeDraft]);

  const typeOptions = useMemo<TypeOption<ElementType>[]>(() => {
    if (effectiveKind === 'archimate') {
      const opts = (ELEMENT_TYPES_BY_LAYER[layerDraft] ?? []) as ElementType[];
      return opts.map((id) => ({ id, label: id }));
    }
    return getElementTypeOptionsForKind(effectiveKind);
  }, [effectiveKind, layerDraft]);

  const canCreate = nameDraft.trim().length > 0;

  const doCreate = () => {
    if (!canCreate) return;

    const created = createElement({
      name: nameDraft.trim(),
      kind: effectiveKind,
      layer: effectiveKind === 'archimate' ? layerDraft : undefined,
      type: typeDraft
    });

    modelStore.addElement(created, targetFolderId ?? undefined);
    onClose();
    onSelect({ kind: 'element', elementId: created.id });
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={effectiveKind === 'uml' ? 'Create UML element' : 'Create element'}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="shellButton" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="shellButton" disabled={!canCreate} onClick={doCreate}>
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
              aria-label="Element name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                doCreate();
              }}
              autoFocus
            />
          </div>
        </div>

        {effectiveKind === 'archimate' ? (
          <div className="propertiesRow">
            <div className="propertiesKey">Layer</div>
            <div className="propertiesValue">
              <select
                className="selectInput"
                aria-label="Layer"
                value={layerDraft}
                onChange={(e) => setLayerDraft(e.target.value as ArchimateLayer)}
              >
                {ARCHIMATE_LAYERS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        <div className="propertiesRow">
          <div className="propertiesKey">Type</div>
          <div className="propertiesValue">
            <select
              className="selectInput"
              aria-label="Type"
              value={typeDraft}
              onChange={(e) => setTypeDraft(e.target.value as ElementType)}
            >
              {typeOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
