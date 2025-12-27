import { FolderNameDialog } from '../../FolderNameDialog';
import { modelStore } from '../../../../store';

type Props = {
  parentFolderId: string | null;
  onClose: () => void;
};

export function CreateFolderDialog({ parentFolderId, onClose }: Props) {
  return (
    <FolderNameDialog
      isOpen={parentFolderId !== null}
      title="Create folder"
      confirmLabel="Create"
      onCancel={onClose}
      onConfirm={(name) => {
        if (!parentFolderId) return;
        modelStore.createFolder(parentFolderId, name);
        onClose();
      }}
    />
  );
}
