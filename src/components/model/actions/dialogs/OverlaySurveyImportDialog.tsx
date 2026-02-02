import { Dialog } from '../../../dialog/Dialog';

import type { SurveyImportOptions } from '../../../../store/overlay';

type OverlaySurveyImportDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  importing: boolean;
  error: string | null;
  options: SurveyImportOptions;
  setOptions: (next: SurveyImportOptions) => void;
  onChooseFile: () => void;
};

export function OverlaySurveyImportDialog({
  isOpen,
  onClose,
  importing,
  error,
  options,
  setOptions,
  onChooseFile
}: OverlaySurveyImportDialogProps) {
  return (
    <Dialog
      title="Import overlay survey (CSV)"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="shellButton" onClick={onClose} disabled={importing}>
            Close
          </button>
          <button
            type="button"
            className="shellButton shellPrimaryAction"
            onClick={onChooseFile}
            disabled={importing}
          >
            Choose CSV…
          </button>
        </div>
      }
    >
      <p className="hintText" style={{ marginTop: 0 }}>
        Import a survey CSV. Rows are matched to the current model by internal id when present, otherwise by external id.
      </p>

      <div className="crudFormRow">
        <label className="crudLabel">Blank cells</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label className="crudInlineLabel">
            <input
              type="radio"
              name="ovlSurveyBlankMode"
              checked={options.blankMode === 'ignore'}
              onChange={() => setOptions({ ...options, blankMode: 'ignore' })}
            />{' '}
            Ignore blanks (do not change)
          </label>
          <label className="crudInlineLabel">
            <input
              type="radio"
              name="ovlSurveyBlankMode"
              checked={options.blankMode === 'clear'}
              onChange={() => setOptions({ ...options, blankMode: 'clear' })}
            />{' '}
            Clear overlay tags when blank
          </label>
        </div>
      </div>

      {importing ? <p className="hintText">Importing…</p> : null}
      {error ? (
        <div className="crudError" role="alert">
          {error}
        </div>
      ) : null}
    </Dialog>
  );
}
