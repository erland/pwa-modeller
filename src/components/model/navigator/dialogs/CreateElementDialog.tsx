import { useEffect, useMemo, useState } from 'react';

import type { ArchimateLayer, ElementType } from '../../../../domain';
import {
  ARCHIMATE_LAYERS,
  ELEMENT_TYPES_BY_LAYER,
  createElement
} from '../../../../domain';
import { modelStore } from '../../../../store';
import { Dialog } from '../../../dialog/Dialog';
import type { Selection } from '../../selection';

type Props = {
  isOpen: boolean;
  targetFolderId: string;
  onClose: () => void;
  onSelect: (selection: Selection) => void;
};

export function CreateElementDialog({ isOpen, targetFolderId, onClose, onSelect }: Props) {
  const [nameDraft, setNameDraft] = useState('');
  const [layerDraft, setLayerDraft] = useState<ArchimateLayer>(ARCHIMATE_LAYERS[1]);
  const [typeDraft, setTypeDraft] = useState<ElementType>(() => {
    const types = ELEMENT_TYPES_BY_LAYER[ARCHIMATE_LAYERS[1]];
    return (types?.[0] ?? 'BusinessActor') as ElementType;
  });

  // Reset drafts when opening
  useEffect(() => {
    if (!isOpen) return;
    setNameDraft('');
    const defaultLayer = ARCHIMATE_LAYERS[1];
    setLayerDraft(defaultLayer);
    const opts = ELEMENT_TYPES_BY_LAYER[defaultLayer] ?? [];
    setTypeDraft((opts[0] ?? 'BusinessActor') as ElementType);
  }, [isOpen]);

  // Keep element type selection valid when layer changes.
  useEffect(() => {
    const opts = ELEMENT_TYPES_BY_LAYER[layerDraft] ?? [];
    if (opts.length === 0) return;
    if (!opts.includes(typeDraft)) setTypeDraft(opts[0]);
  }, [layerDraft, typeDraft]);

  const typeOptions = useMemo(() => ELEMENT_TYPES_BY_LAYER[layerDraft] ?? [], [layerDraft]);

  return (
    <Dialog
      title="Create element"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="shellButton" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="shellButton"
            disabled={nameDraft.trim().length === 0}
            onClick={() => {
              const created = createElement({
                name: nameDraft.trim(),
                layer: layerDraft,
                type: typeDraft
              });
              modelStore.addElement(created, targetFolderId ?? undefined);
              onClose();
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
              aria-label="Element name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
            />
          </div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Layer</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
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
        <div className="propertiesRow">
          <div className="propertiesKey">Type</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <select
              className="selectInput"
              aria-label="Type"
              value={typeDraft}
              onChange={(e) => setTypeDraft(e.target.value as ElementType)}
            >
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
