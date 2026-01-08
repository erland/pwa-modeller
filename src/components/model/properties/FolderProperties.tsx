import type { Model } from '../../../domain';
import type { ModelActions } from './actions';
import { PropertyRow } from './editors/PropertyRow';
import { ExternalIdsSection } from './sections/ExternalIdsSection';
import { TaggedValuesSection } from './sections/TaggedValuesSection';

type Props = {
  model: Model;
  folderId: string;
  actions: ModelActions;
};

export function FolderProperties({ model, folderId, actions }: Props) {
  const folder = model.folders[folderId];
  if (!folder) return <p className="panelHint">Folder not found.</p>;

  const canEdit = folder.kind !== 'root';

  
  function getFolderPath(): string {
    if (folder.kind === 'root') return '';

    const parts: string[] = [];
    const seen = new Set<string>();
    let current = folder;

    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (current.kind !== 'root') parts.push(current.name);

      const parentId = current.parentId;
      if (!parentId) break;
      const parent = model.folders[parentId];
      if (!parent || parent.kind === 'root') break;
      current = parent;
    }

    return parts.reverse().join(' / ');
  }

  return (
    <div>
      <p className="panelHint">Folder</p>
      <div className="propertiesGrid">
        <PropertyRow label="Name">{folder.name}</PropertyRow>
        <PropertyRow label="Path">{getFolderPath() || '—'}</PropertyRow>
      </div>

      <ExternalIdsSection externalIds={folder.externalIds} />

      <TaggedValuesSection
        taggedValues={folder.taggedValues}
        onChange={(next) => actions.updateFolder(folder.id, { taggedValues: next })}
        dialogTitle={`Folder tagged values — ${folder.name}`}
      />

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
