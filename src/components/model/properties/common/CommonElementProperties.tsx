import { useEffect, useState } from 'react';
import type { ElementType, FolderOption, Model } from '../../../../domain';
import { kindFromTypeId } from '../../../../domain';

import type { Selection } from '../../selection';
import type { ModelActions } from '../actions';
import { PropertiesPanelHost, type PropertiesSection } from './PropertiesPanelHost';
import { findFolderContaining } from '../utils';
import { CreateRelationshipDialog } from '../../navigator/dialogs/CreateRelationshipDialog';
import { ExternalIdsSection } from '../sections/ExternalIdsSection';
import { OverlayTagsSection } from '../sections/OverlayTagsSection';
import { TaggedValuesSection } from '../sections/TaggedValuesSection';
import { ElementBasicsSection } from './sections/ElementBasicsSection';
import { ElementContainmentSection } from './sections/ElementContainmentSection';
import { ElementRelationshipsSection } from './sections/ElementRelationshipsSection';
import { ElementTraceSection } from './sections/ElementTraceSection';
import { useElementRelationships } from './hooks/useElementRelationships';
import { useElementTypeOptions } from './hooks/useElementTypeOptions';
import { useRelationshipTrace, type TraceDirection } from './hooks/useRelationshipTrace';
import { useUsedInViews } from './hooks/useUsedInViews';

type Props = {
  model: Model;
  elementId: string;
  actions: ModelActions;
  elementFolders: FolderOption[];
  onSelect?: (selection: Selection) => void;
  /** Notation-specific sections (rendered as-is). */
  notationSections?: PropertiesSection[];
};

export function CommonElementProperties({ model, elementId, actions, elementFolders, onSelect, notationSections }: Props) {
  // Note: Avoid conditional hooks by allowing the component to render a fallback
  // after all hooks have been invoked.
  const el = model.elements[elementId];
  const hasElement = Boolean(el);
  const kind: 'archimate' | 'uml' | 'bpmn' = hasElement ? (el!.kind ?? kindFromTypeId(el!.type as unknown as string)) : 'archimate';
  const safeType: ElementType = hasElement ? (el!.type as ElementType) : ('Unknown' as ElementType);

  const [createRelationshipOpen, setCreateRelationshipOpen] = useState(false);

  const [traceDirection, setTraceDirection] = useState<TraceDirection>('both');
  const [traceDepth, setTraceDepth] = useState<number>(1);

  const { elementTypeOptions, kindTypeLabelById } = useElementTypeOptions(kind, safeType);

  useEffect(() => {
    setTraceDirection('both');
    setTraceDepth(1);
  }, [elementId]);

  const currentFolderId = hasElement ? findFolderContaining(model, 'element', el!.id) : null;

  const { incoming, outgoing } = useElementRelationships(model, elementId);
  const usedInViews = useUsedInViews(model, elementId, hasElement);
  const traceSteps = useRelationshipTrace(model, elementId, traceDirection, traceDepth);

  const onSelectSafe = onSelect ?? (() => undefined);


  if (!hasElement) return <p className="panelHint">Element not found.</p>;


  return (
    <div>
      <ElementBasicsSection
        element={el}
        kind={kind}
        actions={actions}
        currentFolderId={currentFolderId}
        elementFolders={elementFolders}
        elementTypeOptions={elementTypeOptions}
        kindTypeLabelById={kindTypeLabelById}
      />

      <ElementContainmentSection
        model={model}
        elementId={el.id}
        actions={actions}
        currentFolderId={currentFolderId}
        onSelect={onSelectSafe}
      />

      {notationSections ? <PropertiesPanelHost sections={notationSections} /> : null}

      <ExternalIdsSection externalIds={el.externalIds} />

      <OverlayTagsSection kind="element" displayName={el.name || el.id} externalIds={el.externalIds} />

      <TaggedValuesSection
        taggedValues={el.taggedValues}
        onChange={(next) => actions.updateElement(el.id, { taggedValues: next })}
        dialogTitle={`Element tagged values — ${el.name || el.id}`}
      />

      <ElementRelationshipsSection
        model={model}
        elementId={el.id}
        kind={kind}
        usedInViews={usedInViews}
        outgoing={outgoing}
        incoming={incoming}
        onSelect={onSelect}
        onNewRelationship={() => setCreateRelationshipOpen(true)}
      />

      <ElementTraceSection
        model={model}
        traceDirection={traceDirection}
        setTraceDirection={setTraceDirection}
        traceDepth={traceDepth}
        setTraceDepth={setTraceDepth}
        traceSteps={traceSteps}
        onSelect={onSelect}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            const ok = window.confirm('Delete this element? Relationships referencing it will also be removed.');
            if (!ok) return;
            actions.deleteElement(el.id);
          }}
        >
          Delete element
        </button>
      </div>

      <CreateRelationshipDialog
        model={model}
        isOpen={createRelationshipOpen}
        prefillSourceElementId={el.id}
        onClose={() => setCreateRelationshipOpen(false)}
        onSelect={onSelectSafe}
      />
    </div>
  );
}
