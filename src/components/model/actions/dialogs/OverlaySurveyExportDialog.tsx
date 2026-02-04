import { TypeMultiSelect } from '../../../overlay/shared/TypeMultiSelect';

import { Dialog } from '../../../dialog/Dialog';

import type { SurveyTargetSet } from '../../../../store/overlay';

type OverlaySurveyExportDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  targetSet: SurveyTargetSet;
  setTargetSet: (v: SurveyTargetSet) => void;
  availableElementTypes: string[];
  availableRelationshipTypes: string[];
  selectedElementTypes: string[]; // empty means all
  setSelectedElementTypes: (v: string[]) => void;
  selectedRelationshipTypes: string[]; // empty means all
  setSelectedRelationshipTypes: (v: string[]) => void;
  tagKeysText: string;
  setTagKeysText: (v: string) => void;
  onSuggestKeys: () => void;
  onExport: () => void;
};

export function OverlaySurveyExportDialog({
  isOpen,
  onClose,
  targetSet,
  setTargetSet,
  availableElementTypes,
  availableRelationshipTypes,
  selectedElementTypes,
  setSelectedElementTypes,
  selectedRelationshipTypes,
  setSelectedRelationshipTypes,
  tagKeysText,
  setTagKeysText,
  onSuggestKeys,
  onExport,
}: OverlaySurveyExportDialogProps) {
  return (
    <Dialog
      title="Export overlay survey (CSV)"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', width: '100%' }}>
          <button type="button" className="shellButton" onClick={onSuggestKeys}>
            Suggest keys
          </button>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="shellButton" onClick={onClose}>
              Close
            </button>
            <button type="button" className="shellButton shellPrimaryAction" onClick={onExport}>
              Export CSV
            </button>
          </div>
        </div>
      }
    >
      <p className="hintText" style={{ marginTop: 0 }}>
        Creates a survey-friendly CSV: one row per target, one column per tag key. Values are prefilled from effective tags (overlay
        if present, else core).
      </p>

      <div className="crudFormRow">
        <label className="crudLabel">Targets</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label className="crudInlineLabel">
            <input
              type="radio"
              name="ovlSurveyTargetSet"
              checked={targetSet === 'elements'}
              onChange={() => setTargetSet('elements')}
            />{' '}
            Elements
          </label>
          <label className="crudInlineLabel">
            <input
              type="radio"
              name="ovlSurveyTargetSet"
              checked={targetSet === 'relationships'}
              onChange={() => setTargetSet('relationships')}
            />{' '}
            Relationships
          </label>
          <label className="crudInlineLabel">
            <input type="radio" name="ovlSurveyTargetSet" checked={targetSet === 'both'} onChange={() => setTargetSet('both')} /> Both
          </label>
        </div>
      </div>

      {(targetSet === 'elements' || targetSet === 'both') && (
        <TypeMultiSelect
          label="Element types"
          allTypes={availableElementTypes}
          selectedTypes={selectedElementTypes}
          onChange={setSelectedElementTypes}
          filterPlaceholder="Filter element types…"
        />
      )}

      {(targetSet === 'relationships' || targetSet === 'both') && (
        <TypeMultiSelect
          label="Relationship types"
          allTypes={availableRelationshipTypes}
          selectedTypes={selectedRelationshipTypes}
          onChange={setSelectedRelationshipTypes}
          filterPlaceholder="Filter relationship types…"
        />
      )}


      <div className="crudFormRow">
        <label className="crudLabel" htmlFor="ovlSurveyKeys">
          Tag keys (columns)
        </label>
        <textarea
          id="ovlSurveyKeys"
          className="crudTextArea"
          rows={6}
          value={tagKeysText}
          onChange={(e) => setTagKeysText(e.currentTarget.value)}
          placeholder="owner\ncriticality\nrisk\ncost"
        />
        <div className="hintText">One per line (or comma-separated). Empty means export only identifying columns.</div>
      </div>
    </Dialog>
  );
}
