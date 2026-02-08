import { Dialog } from '../../../dialog/Dialog';

export type PublishScope = 'model' | 'view' | 'folder';

export type PublishDialogProps = {
  isOpen: boolean;
  onClose: () => void;

  title: string;
  setTitle: (v: string) => void;

  scope: PublishScope;
  setScope: (v: PublishScope) => void;

  currentViewLabel: string | null;
  canPublishView: boolean;

  folderOptions: Array<{ id: string; label: string }>;
  selectedFolderId: string;
  setSelectedFolderId: (v: string) => void;

  publishing: boolean;
  error: string | null;

  onPublish: () => void;
};

export function PublishDialog({
  isOpen,
  onClose,
  title,
  setTitle,
  scope,
  setScope,
  currentViewLabel,
  canPublishView,
  folderOptions,
  selectedFolderId,
  setSelectedFolderId,
  publishing,
  error,
  onPublish
}: PublishDialogProps) {
  return (
    <Dialog title="Publish to Portal" isOpen={isOpen} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Title (shown in Portal)</div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            className="textInput"
            placeholder="EA Portal dataset"
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Scope</div>
          <select
            className="selectInput"
            value={scope}
            onChange={(e) => setScope(e.currentTarget.value as PublishScope)}
          >
            <option value="model">Whole model</option>
            <option value="view" disabled={!canPublishView}>
              Current view{currentViewLabel ? `: ${currentViewLabel}` : ''}
            </option>
            <option value="folder" disabled={folderOptions.length === 0}>
              Folder
            </option>
          </select>
          {!canPublishView ? (
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Open a diagram view in the Diagram tab to enable view-scoped publishing.
            </div>
          ) : null}
        </label>

        {scope === 'folder' ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Folder</div>
            <select
              className="selectInput"
              value={selectedFolderId}
              onChange={(e) => setSelectedFolderId(e.currentTarget.value)}
              disabled={folderOptions.length === 0}
            >
              {folderOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {error ? (
          <div style={{ color: 'var(--danger, #b00020)', whiteSpace: 'pre-wrap', fontSize: 13 }}>{error}</div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <button type="button" className="shellButton" onClick={onClose} disabled={publishing}>
            Cancel
          </button>
          <button type="button" className="shellButton shellPrimaryAction" onClick={onPublish} disabled={publishing}>
            {publishing ? 'Publishing…' : 'Publish (download)'}
          </button>
        </div>

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
          Publishing downloads a bundle zip plus a latest.json pointer file. Host both on a static web server and point
          the Portal to latest.json.
        </div>
      </div>
    </Dialog>
  );
}
