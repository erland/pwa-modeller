import { Dialog } from '../../../dialog/Dialog';

type SaveAsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  setFileName: (v: string) => void;
  onDownload: (fileName: string) => void;
};

export function SaveAsDialog({ isOpen, onClose, fileName, setFileName, onDownload }: SaveAsDialogProps) {
  return (
    <Dialog
      title="Save model as"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="shellButton" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="shellButton"
            onClick={() => {
              onDownload(fileName);
              onClose();
            }}
            disabled={fileName.trim().length === 0}
          >
            Download
          </button>
        </>
      }
    >
      <div className="formGrid">
        <div className="formRow">
          <label htmlFor="saveas-name">File name</label>
          <input
            id="saveas-name"
            className="textInput"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            autoFocus
          />
          <p className="hintText">The browser will download a JSON file. You can rename or move it as you like.</p>
        </div>
      </div>
    </Dialog>
  );
}
