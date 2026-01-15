import { useEffect, useMemo, useState } from 'react';

import type { ArchimateLayer, ElementType, ModelKind } from '../../../../domain';
import { createElement } from '../../../../domain';
import { getNotation } from '../../../../notations';
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

  /**
   * Optional hook invoked after the element is created and added to the model.
   * Useful for flows where the element should be placed into a view next.
   */
  onCreated?: (elementId: string) => void;

  /**
   * Whether to select the created element immediately.
   * Defaults to true to preserve existing behavior.
   */
  selectAfterCreate?: boolean;
};

function coerceElementType(id: string | undefined): ElementType {
  return (id ?? 'BusinessActor') as ElementType;
}

function computeDefaultLayer(kind: ModelKind, initialTypeId: ElementType | undefined): string | undefined {
  const notation = getNotation(kind);
  const layers = notation.getElementLayerOptions?.() ?? [];
  if (layers.length === 0) return undefined;

  // If an initial type is provided and the notation can infer a layer, prefer that.
  if (initialTypeId && notation.inferElementLayer) {
    const inferred = notation.inferElementLayer(initialTypeId as unknown as string);
    if (inferred && layers.some((l) => l.id === inferred)) return inferred;
  }

  return layers[0]?.id;
}

function computeDefaultType(kind: ModelKind, initialTypeId: ElementType | undefined, layerId: string | undefined): ElementType {
  const notation = getNotation(kind);

  const opts = (layerId && notation.getElementTypeOptionsForLayer
    ? notation.getElementTypeOptionsForLayer(layerId)
    : notation.getElementTypeOptions())
    .map((o) => o.id);

  if (initialTypeId && opts.includes(initialTypeId)) return initialTypeId;

  // Prefer a stable default for UML.
  if (kind === 'uml') {
    return coerceElementType(opts.includes('uml.class') ? 'uml.class' : opts[0]);
  }

  return coerceElementType(opts[0]);
}

export function CreateElementDialog({
  isOpen,
  targetFolderId,
  onClose,
  onSelect,
  kind,
  initialTypeId,
  onCreated,
  selectAfterCreate,
}: Props) {
  const effectiveKind: ModelKind = kind ?? 'archimate';
  const notation = useMemo(() => getNotation(effectiveKind), [effectiveKind]);

  const layerOptions = useMemo(() => notation.getElementLayerOptions?.() ?? null, [notation]);

  const [nameDraft, setNameDraft] = useState('');
  const [layerDraft, setLayerDraft] = useState<string | undefined>(() => computeDefaultLayer(effectiveKind, initialTypeId));
  const [typeDraft, setTypeDraft] = useState<ElementType>(() =>
    computeDefaultType(effectiveKind, initialTypeId, computeDefaultLayer(effectiveKind, initialTypeId)),
  );

  // Reset drafts when opening (and when kind/initial type changes while open).
  useEffect(() => {
    if (!isOpen) return;
    const nextLayer = computeDefaultLayer(effectiveKind, initialTypeId);
    setNameDraft('');
    setLayerDraft(nextLayer);
    setTypeDraft(computeDefaultType(effectiveKind, initialTypeId, nextLayer));
  }, [isOpen, effectiveKind, initialTypeId]);

  const typeOptions = useMemo(() => {
    const opts = layerDraft && notation.getElementTypeOptionsForLayer
      ? notation.getElementTypeOptionsForLayer(layerDraft)
      : notation.getElementTypeOptions();
    return opts as Array<{ id: ElementType; label: string }>;
  }, [notation, layerDraft]);

  // If the layer changes and the current type no longer exists, snap to the first type in that layer.
  useEffect(() => {
    if (!isOpen) return;
    if (typeOptions.length === 0) return;
    const ids = new Set(typeOptions.map((o) => o.id));
    if (!ids.has(typeDraft)) {
      setTypeDraft(typeOptions[0].id);
    }
  }, [isOpen, typeOptions, typeDraft]);

  const canCreate = nameDraft.trim().length > 0;

  const doCreate = () => {
    if (!canCreate) return;

    const created = createElement({
      name: nameDraft.trim(),
      kind: effectiveKind,
      layer: effectiveKind === 'archimate' ? (layerDraft as ArchimateLayer | undefined) : undefined,
      type: typeDraft,
    });

    modelStore.addElement(created, targetFolderId ?? undefined);

    onCreated?.(created.id);
    onClose();
    if (selectAfterCreate !== false) {
      onSelect({ kind: 'element', elementId: created.id });
    }
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

        {layerOptions && layerOptions.length > 0 ? (
          <div className="propertiesRow">
            <div className="propertiesKey">Layer</div>
            <div className="propertiesValue">
              <select
                className="selectInput"
                aria-label="Layer"
                value={layerDraft ?? layerOptions[0].id}
                onChange={(e) => setLayerDraft(e.target.value)}
              >
                {layerOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
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
