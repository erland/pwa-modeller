import type { Model } from '../../../domain';
import type { ModelActions } from './actions';
import { folderPathLabel } from './utils';

type Props = {
  model: Model;
  folderId: string;
  actions: ModelActions;
};

export function FolderProperties({ model, folderId, actions }: Props) {
  const folder = model.folders[folderId];
  if (!folder) return <p className="panelHint">Folder not found.</p>;

  const canEdit = !(folder.kind === 'root' || folder.kind === 'elements' || folder.kind === 'views');

  return (
    <div>
      <p className="panelHint">Folder</p>
      <div className="propertiesGrid">
        <div className="propertiesRow">
          <div className="propertiesKey">Name</div>
          <div className="propertiesValue">{folder.name}</div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Kind</div>
          <div className="propertiesValue">{folder.kind}</div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Folders</div>
          <div className="propertiesValue">{folder.folderIds.length}</div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Elements</div>
          <div className="propertiesValue">{folder.elementIds.length}</div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Views</div>
          <div className="propertiesValue">{folder.viewIds.length}</div>
        </div>

        <div className="propertiesRow">
          <div className="propertiesKey">Path</div>
          <div className="propertiesValue">{folderPathLabel(model, folder.id)}</div>
        </div>
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
