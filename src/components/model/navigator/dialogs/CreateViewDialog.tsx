import { useEffect, useState } from 'react';

import { VIEWPOINTS, createView } from '../../../../domain';
import { modelStore } from '../../../../store';
import { Dialog } from '../../../dialog/Dialog';
import type { Selection } from '../../selection';

type Props = {
  isOpen: boolean;
  targetFolderId: string;
  /** If set, the view will be created nested under (centered around) this element and will not be placed in any folder. */
  centerElementId?: string;
  onClose: () => void;
  onSelect: (selection: Selection) => void;
};

export function CreateViewDialog({ isOpen, targetFolderId, centerElementId, onClose, onSelect }: Props) {
  const [nameDraft, setNameDraft] = useState('');
  const [viewpointDraft, setViewpointDraft] = useState<string>(VIEWPOINTS[0]?.id ?? 'layered');

  useEffect(() => {
    if (!isOpen) return;
    setNameDraft('');
    setViewpointDraft(VIEWPOINTS[0]?.id ?? 'layered');
  }, [isOpen]);

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
            disabled={nameDraft.trim().length === 0}
            onClick={() => {
              const created = createView({
                name: nameDraft.trim(),
                viewpointId: viewpointDraft,
                centerElementId: centerElementId || undefined
              });
              // Centered views are not placed in folders (store enforces this invariant).
              modelStore.addView(created, centerElementId ? undefined : (targetFolderId ?? undefined));
              onClose();
              onSelect({ kind: 'view', viewId: created.id });
            }}
          >
            Create
          </button>
        </div>
      }
    >
      {centerElementId ? (
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
            />
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
              {VIEWPOINTS.map((vp) => (
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
