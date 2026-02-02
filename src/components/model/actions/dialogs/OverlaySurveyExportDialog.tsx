import { useMemo, useState } from 'react';

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
  const [elementTypeFilterText, setElementTypeFilterText] = useState('');
  const [relationshipTypeFilterText, setRelationshipTypeFilterText] = useState('');

  const elementTypesShown = useMemo(() => {
    const q = elementTypeFilterText.trim().toLowerCase();
    if (!q) return availableElementTypes;
    return availableElementTypes.filter((t) => t.toLowerCase().includes(q));
  }, [availableElementTypes, elementTypeFilterText]);

  const relationshipTypesShown = useMemo(() => {
    const q = relationshipTypeFilterText.trim().toLowerCase();
    if (!q) return availableRelationshipTypes;
    return availableRelationshipTypes.filter((t) => t.toLowerCase().includes(q));
  }, [availableRelationshipTypes, relationshipTypeFilterText]);

  const isTypeSelected = (selected: string[], t: string) => selected.length === 0 || selected.includes(t);

  const toggleSelection = (all: string[], selected: string[], setSelected: (v: string[]) => void, t: string) => {
    const currentlyAll = selected.length === 0;
    const currentlySelected = currentlyAll ? true : selected.includes(t);

    if (currentlyAll) {
      // turning one off moves into explicit subset
      if (currentlySelected) {
        const next = all.filter((x) => x !== t);
        setSelected(next.length === all.length ? [] : next);
      } else {
        setSelected([]); // should not happen
      }
      return;
    }

    const next = currentlySelected ? selected.filter((x) => x !== t) : [...selected, t];
    const nextNorm = [...new Set(next)].sort();
    // if user ended up selecting everything, store as "all" (empty)
    if (nextNorm.length === all.length) setSelected([]);
    else setSelected(nextNorm);
  };
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
        <div className="crudFormRow">
          <label className="crudLabel">Element types</label>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <input
                type="text"
                className="crudTextInput"
                value={elementTypeFilterText}
                onChange={(e) => setElementTypeFilterText(e.currentTarget.value)}
                placeholder="Filter element types…"
                style={{ width: 260 }}
              />
              <button type="button" className="shellButton" onClick={() => setSelectedElementTypes([])}>
                All
              </button>
              <span className="hintText" style={{ margin: 0 }}>
                {selectedElementTypes.length === 0
                  ? `All (${availableElementTypes.length})`
                  : `${selectedElementTypes.length} of ${availableElementTypes.length}`}
              </span>
            </div>

            <div style={{ maxHeight: 160, overflow: 'auto', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 8, padding: 8 }}>
              {elementTypesShown.length === 0 ? (
                <div className="hintText">No element types match the filter.</div>
              ) : (
                elementTypesShown.map((t) => (
                  <label key={t} className="crudInlineLabel" style={{ display: 'block', marginBottom: 4 }}>
                    <input
                      type="checkbox"
                      checked={isTypeSelected(selectedElementTypes, t)}
                      onChange={() => toggleSelection(availableElementTypes, selectedElementTypes, setSelectedElementTypes, t)}
                    />{' '}
                    {t}
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {(targetSet === 'relationships' || targetSet === 'both') && (
        <div className="crudFormRow">
          <label className="crudLabel">Relationship types</label>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <input
                type="text"
                className="crudTextInput"
                value={relationshipTypeFilterText}
                onChange={(e) => setRelationshipTypeFilterText(e.currentTarget.value)}
                placeholder="Filter relationship types…"
                style={{ width: 260 }}
              />
              <button type="button" className="shellButton" onClick={() => setSelectedRelationshipTypes([])}>
                All
              </button>
              <span className="hintText" style={{ margin: 0 }}>
                {selectedRelationshipTypes.length === 0
                  ? `All (${availableRelationshipTypes.length})`
                  : `${selectedRelationshipTypes.length} of ${availableRelationshipTypes.length}`}
              </span>
            </div>

            <div style={{ maxHeight: 160, overflow: 'auto', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 8, padding: 8 }}>
              {relationshipTypesShown.length === 0 ? (
                <div className="hintText">No relationship types match the filter.</div>
              ) : (
                relationshipTypesShown.map((t) => (
                  <label key={t} className="crudInlineLabel" style={{ display: 'block', marginBottom: 4 }}>
                    <input
                      type="checkbox"
                      checked={isTypeSelected(selectedRelationshipTypes, t)}
                      onChange={() =>
                        toggleSelection(availableRelationshipTypes, selectedRelationshipTypes, setSelectedRelationshipTypes, t)
                      }
                    />{' '}
                    {t}
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
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
