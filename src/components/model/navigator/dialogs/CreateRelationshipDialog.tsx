import { useEffect, useMemo, useState } from 'react';

import type { Model, RelationshipType } from '../../../../domain';
import { RELATIONSHIP_TYPES, createRelationship } from '../../../../domain';
import { initRelationshipValidationMatrixFromBundledTable } from '../../../../domain/config/archimatePalette';
import { getNotation } from '../../../../notations';
import { modelStore } from '../../../../store';
import { Dialog } from '../../../dialog/Dialog';
import type { Selection } from '../../selection';
import { elementOptionLabel } from '../navUtils';
import { useModelStore } from '../../../../store';

type Props = {
  model: Model;
  isOpen: boolean;
  prefillSourceElementId?: string;
  onClose: () => void;
  onSelect: (selection: Selection) => void;
};

export function CreateRelationshipDialog({ model, isOpen, prefillSourceElementId, onClose, onSelect }: Props) {
  
  const { relationshipValidationMode } = useModelStore((s) => ({ relationshipValidationMode: s.relationshipValidationMode }));

  const [matrixLoadTick, setMatrixLoadTick] = useState(0);

  useEffect(() => {
    if (relationshipValidationMode === 'minimal') return;
    let cancelled = false;
    void initRelationshipValidationMatrixFromBundledTable().then(() => {
      if (!cancelled) setMatrixLoadTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [relationshipValidationMode]);
const [nameDraft, setNameDraft] = useState('');
  const [documentationDraft, setDocumentationDraft] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [typeDraft, setTypeDraft] = useState<RelationshipType>((RELATIONSHIP_TYPES[2] ?? 'Association') as RelationshipType);

  const elementIdsInOrder = useMemo(() => Object.keys(model.elements), [model]);

  // Reset drafts when opening
  useEffect(() => {
    if (!isOpen) return;
    setNameDraft('');
    setDocumentationDraft('');

    const ids = elementIdsInOrder;
    const validSource = prefillSourceElementId && ids.includes(prefillSourceElementId) ? prefillSourceElementId : ids[0];
    const validTarget = ids.find((id) => id !== validSource) ?? validSource ?? '';

    setSourceId(validSource ?? '');
    setTargetId(validTarget ?? '');
    setTypeDraft((RELATIONSHIP_TYPES[2] ?? 'Association') as RelationshipType);
  }, [isOpen, prefillSourceElementId, elementIdsInOrder]);

  const allowedRelationshipTypes = useMemo(() => {
    void matrixLoadTick;
    const s = model.elements[sourceId];
    const t = model.elements[targetId];
    if (!s || !t) return RELATIONSHIP_TYPES as RelationshipType[];
    const notation = getNotation('archimate');
    const allowed = (RELATIONSHIP_TYPES as RelationshipType[]).filter((rt) =>
      notation.canCreateRelationship({ relationshipType: rt, sourceType: s.type, targetType: t.type, mode: relationshipValidationMode }).allowed
    );
    return (allowed.length > 0 ? allowed : RELATIONSHIP_TYPES) as RelationshipType[];
  }, [model, sourceId, targetId, relationshipValidationMode, matrixLoadTick]);

  // Keep relationship type valid for chosen endpoints.
  useEffect(() => {
    if (!allowedRelationshipTypes.includes(typeDraft)) {
      setTypeDraft(allowedRelationshipTypes[0] ?? ('Association' as RelationshipType));
    }
  }, [allowedRelationshipTypes, typeDraft]);

  const relationshipRuleError = useMemo(() => {
    void matrixLoadTick;
    const s = model.elements[sourceId];
    const t = model.elements[targetId];
    if (!s || !t) return null;
    const notation = getNotation('archimate');
    const res = notation.canCreateRelationship({ relationshipType: typeDraft, sourceType: s.type, targetType: t.type, mode: relationshipValidationMode });
    return res.allowed ? null : res.reason ?? 'Invalid relationship';
  }, [model, sourceId, targetId, typeDraft, relationshipValidationMode, matrixLoadTick]);

  return (
    <Dialog
      title="Create relationship"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          {relationshipRuleError ? (
            <span className="panelHint" style={{ color: '#ffb3b3' }}>
              {relationshipRuleError}
            </span>
          ) : null}
          <button type="button" className="shellButton" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="shellButton"
            disabled={!sourceId || !targetId || sourceId === targetId || Boolean(relationshipRuleError)}
            onClick={() => {
              const created = createRelationship({
                sourceElementId: sourceId,
                targetElementId: targetId,
                type: typeDraft,
                name: nameDraft.trim() || undefined,
                documentation: documentationDraft.trim() || undefined
              });
              modelStore.addRelationship(created);
              onClose();
              onSelect({ kind: 'relationship', relationshipId: created.id });
            }}
          >
            Create
          </button>
        </div>
      }
    >
      <div className="propertiesGrid">
        <div className="propertiesRow">
          <div className="propertiesKey">Type</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <select
              className="selectInput"
              aria-label="Relationship type"
              value={typeDraft}
              onChange={(e) => setTypeDraft(e.target.value as RelationshipType)}
            >
              {allowedRelationshipTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="propertiesRow">
          <div className="propertiesKey">Name</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <input
              className="textInput"
              aria-label="Relationship name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
            />
          </div>
        </div>

        <div className="propertiesRow">
          <div className="propertiesKey">Documentation</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <input
              className="textInput"
              aria-label="Relationship documentation"
              value={documentationDraft}
              onChange={(e) => setDocumentationDraft(e.target.value)}
            />
          </div>
        </div>

        <div className="propertiesRow">
          <div className="propertiesKey">Source</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <select className="selectInput" aria-label="Source" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              {elementIdsInOrder.map((id) => (
                <option key={id} value={id}>
                  {elementOptionLabel(model, id)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="propertiesRow">
          <div className="propertiesKey">Target</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <select className="selectInput" aria-label="Target" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              {elementIdsInOrder.map((id) => (
                <option key={id} value={id}>
                  {elementOptionLabel(model, id)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </Dialog>
  );
}