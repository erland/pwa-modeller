import { Dialog } from '../../dialog/Dialog';

type SessionInfo = { name: string; savedAt: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;

  sessions: SessionInfo[];
  selectedSessionName: string;
  onChangeSelectedSessionName: (next: string) => void;

  onSave: () => void;
  onLoad: () => void;
  onDelete: () => void;
};

export function TraceabilitySessionsDialog({
  isOpen,
  onClose,
  sessions,
  selectedSessionName,
  onChangeSelectedSessionName,
  onSave,
  onLoad,
  onDelete
}: Props) {
  return (
    <Dialog
      title="Traceability sessions"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <button type="button" className="shellButton" onClick={onClose}>
          Close
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="crudHint" style={{ marginTop: 0 }}>
          Sessions are stored locally in this browser.
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="selectInput"
            value={selectedSessionName}
            onChange={(e) => onChangeSelectedSessionName(e.currentTarget.value)}
            style={{ minWidth: 240 }}
          >
            <option value="">(none)</option>
            {sessions.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>

          <button type="button" className="miniLinkButton" onClick={onSave}>
            Save
          </button>
          <button type="button" className="miniLinkButton" onClick={onLoad} disabled={!selectedSessionName} aria-disabled={!selectedSessionName}>
            Load
          </button>
          <button type="button" className="miniLinkButton" onClick={onDelete} disabled={!selectedSessionName} aria-disabled={!selectedSessionName}>
            Delete
          </button>
        </div>

        {sessions.length ? (
          <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid var(--border-1)', borderRadius: 12 }}>
            <table className="dataTable" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Session</th>
                  <th style={{ width: 200 }}>Saved</th>
                </tr>
              </thead>
              <tbody>
                {sessions
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((s) => (
                    <tr key={s.name}>
                      <td className="mono">{s.name}</td>
                      <td className="mono" style={{ opacity: 0.8 }}>
                        {s.savedAt}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
