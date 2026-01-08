import type { Model } from '../../../domain';
import type { ModelActions } from './actions';
import { PropertyRow } from './editors/PropertyRow';

type Props = {
  model: Model;
  folderId: string;
  actions: ModelActions;
};

export function FolderProperties({ model, folderId, actions }: Props) {
  const folder = model.folders[folderId];
  if (!folder) return <p className="panelHint">Folder not found.</p>;

  const canEdit = folder.kind !== 'root';

  return (
    <div>
      <p className="panelHint">Folder</p>
      <div className="propertiesGrid">
        <PropertyRow label="Name">{folder.name}</PropertyRow>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          className="shellButton"
          disabled={!canEdit}
          onClick={() => {
            const name = window.prompt('Rename folder', folder.name);
            if (!name) return;
            actions.renameFolder(folder.id, name);
          }}
        >
          Rename
        </button>
        <button
          type="button"
          className="shellButton"
          disabled={!canEdit}
          onClick={() => {
            const ok = window.confirm('Delete this folder? Contents will be moved to its parent folder.');
            if (!ok) return;
            actions.deleteFolder(folder.id);
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
