import { useEffect, useMemo, useState } from 'react';

import type { ModelKind } from '../../../../domain';
import { VIEWPOINTS, createView } from '../../../../domain';
import { modelStore } from '../../../../store';
import { Dialog } from '../../../dialog/Dialog';
import type { Selection } from '../../selection';

type Props = {
  isOpen: boolean;
  targetFolderId: string;
  /** If set, the view will be created owned by this element and will not be placed in any folder. */
  ownerElementId?: string;

  /** Optional initial kind (useful when launching from a navigator shortcut such as “UML View…”). */
  initialKind?: ModelKind;
  onClose: () => void;
  onSelect: (selection: Selection) => void;
};

export function CreateViewDialog({ isOpen, targetFolderId, ownerElementId, initialKind, onClose, onSelect }: Props) {
  const [nameDraft, setNameDraft] = useState('');
  const [kindDraft, setKindDraft] = useState<ModelKind>('archimate');
  const [viewpointDraft, setViewpointDraft] = useState<string>(VIEWPOINTS[0]?.id ?? 'layered');

  useEffect(() => {
    if (!isOpen) return;
    setNameDraft('');
    const k: ModelKind = initialKind ?? 'archimate';
    setKindDraft(k);
    // Pick a reasonable default viewpoint for the selected kind.
    const wantsQualified = k !== 'archimate';
    const eligible = VIEWPOINTS.filter((vp) => {
      const hasQualified = vp.allowedElementTypes.some((t) => String(t).includes('.'));
      return wantsQualified ? hasQualified : !hasQualified;
    });
    const preferred =
      k === 'uml'
        ? eligible.find((v) => v.id === 'uml-class')
        : k === 'bpmn'
          ? eligible.find((v) => v.id === 'bpmn-process')
          : eligible.find((v) => v.id === 'layered');
    setViewpointDraft(preferred?.id ?? eligible[0]?.id ?? (k === 'uml' ? 'uml-class' : k === 'bpmn' ? 'bpmn-process' : 'layered'));
  }, [isOpen, initialKind]);

  const viewpointOptions = useMemo(() => {
    return VIEWPOINTS.filter((vp) => {
      const hasQualified = vp.allowedElementTypes.some((t) => String(t).includes('.'));
      return kindDraft === 'archimate' ? !hasQualified : hasQualified;
    });
  }, [kindDraft]);

  const defaultViewpointId = useMemo(() => {
    if (kindDraft === 'uml') {
      return viewpointOptions.find((v) => v.id === 'uml-class')?.id ?? viewpointOptions[0]?.id ?? 'uml-class';
    }
    if (kindDraft === 'bpmn') {
      return viewpointOptions.find((v) => v.id === 'bpmn-process')?.id ?? viewpointOptions[0]?.id ?? 'bpmn-process';
    }
    return viewpointOptions.find((v) => v.id === 'layered')?.id ?? viewpointOptions[0]?.id ?? 'layered';
  }, [kindDraft, viewpointOptions]);

  const isViewpointValid = useMemo(() => {
    return viewpointOptions.some((v) => v.id === viewpointDraft);
  }, [viewpointOptions, viewpointDraft]);

  // Keep viewpoint valid when kind changes (or when available viewpoints change).
  useEffect(() => {
    if (isViewpointValid) return;
    setViewpointDraft(defaultViewpointId);
  }, [isViewpointValid, defaultViewpointId]);

  const canCreate = nameDraft.trim().length > 0;
  const doCreate = () => {
    if (!canCreate) return;
    const created = createView({
      name: nameDraft.trim(),
      kind: kindDraft,
      viewpointId: viewpointDraft,
      // Step 4: create "owned" views using ownerRef (navigator groups by ownerRef).
      ownerRef: ownerElementId ? { kind: 'archimate', id: ownerElementId } : undefined
    });
    // Owned views are not placed in folders (store enforces this invariant).
    modelStore.addView(created, ownerElementId ? undefined : (targetFolderId ?? undefined));
    onClose();
    onSelect({ kind: 'view', viewId: created.id });
  };

return (
    <Dialog
      title="Create view"
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
            disabled={!canCreate}
            onClick={doCreate}
          >
            Create
          </button>
        </div>
      }
    >
      {ownerElementId ? (
        <p className="panelHint" style={{ marginTop: 0 }}>
          This view will be nested under the selected element in the navigator.
        </p>
      ) : null}
      <div className="propertiesGrid">
        <div className="propertiesRow">
          <div className="propertiesKey">Name</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <input
              className="textInput"
              aria-label="View name"
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
        <div className="propertiesRow">
          <div className="propertiesKey">Kind</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <select
              className="selectInput"
              aria-label="View kind"
              value={kindDraft}
              onChange={(e) => setKindDraft(e.target.value as ModelKind)}
            >
              <option value="archimate">ArchiMate</option>
              <option value="uml">UML</option>
              <option value="bpmn">BPMN</option>
            </select>
          </div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Viewpoint</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <select
              className="selectInput"
              aria-label="Viewpoint"
              value={viewpointDraft}
              onChange={(e) => setViewpointDraft(e.target.value)}
            >
              {viewpointOptions.map((vp) => (
                <option key={vp.id} value={vp.id}>
                  {vp.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
