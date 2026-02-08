import { useCallback, useMemo, useState } from 'react';

import type { Model } from '../../../../domain';
import { downloadTextFile } from '../../../../store';

import { buildPublishBundleZip } from '../../../../publisher/lib/publishBundle';
import { buildLatestPointerJson } from '../../../../publisher/lib/latestPointer';
import { sliceModelForFolder, sliceModelForView } from '../../../../publisher/lib/sliceModel';

import type { PublishScope } from '../dialogs/PublishDialog';

function downloadBytes(bytes: Uint8Array, fileName: string, mime = 'application/zip'): void {
  // Make a copy into a fresh ArrayBuffer-backed Uint8Array to avoid SharedArrayBuffer typing issues in some TS configs.
  const safe = new Uint8Array(bytes.byteLength);
  safe.set(bytes);
  const blob = new Blob([safe], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type UseModelPublishActionsArgs = {
  model: Model | null;
  fileName: string | null;
  activeViewId: string | null;
};

function buildFolderOptions(model: Model | null): Array<{ id: string; label: string }> {
  if (!model) return [];
  const folders = model.folders ?? {};

  // Prefer the root folder (kind=root) or folders with no parent.
  const roots = Object.values(folders)
    .filter((f) => f.kind === 'root' || !f.parentId)
    .map((f) => f.id);

  const visited = new Set<string>();
  const out: Array<{ id: string; label: string }> = [];

  const walk = (id: string, depth: number) => {
    if (visited.has(id)) return;
    visited.add(id);
    const f = folders[id];
    if (!f) return;
    const indent = depth > 0 ? `${'\u00A0'.repeat(depth * 2)}• ` : '';
    // Exclude the root folder from the picker to avoid duplicating the "Whole model" option.
    if (f.kind !== 'root') {
      out.push({ id, label: `${indent}${f.name}` });
    }
    for (const childId of f.folderIds ?? []) {
      walk(childId, depth + 1);
    }
  };

  for (const rid of roots) walk(rid, 0);

  // Fallback: include any remaining folders not reachable from roots.
  for (const f of Object.values(folders)) {
    if (!visited.has(f.id) && f.kind !== 'root') {
      out.push({ id: f.id, label: f.name });
    }
  }

  return out;
}

export function useModelPublishActions({ model, fileName, activeViewId }: UseModelPublishActionsArgs) {
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [publishTitle, setPublishTitle] = useState('');
  const [publishScope, setPublishScope] = useState<PublishScope>('model');
  const folderOptions = useMemo(() => buildFolderOptions(model), [model]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');

  const currentViewLabel = useMemo(() => {
    if (!model) return null;
    if (!activeViewId) return null;
    return model.views?.[activeViewId]?.name ?? activeViewId;
  }, [activeViewId, model]);

  const canPublishView = Boolean(model && activeViewId && model.views?.[activeViewId]);

  const openPublish = useCallback(() => {
    if (!model) return;
    setPublishDialogOpen(true);
    setPublishError(null);
    // Default title: current file name or model name
    const fallback = fileName ?? model.metadata?.name ?? 'EA Portal dataset';
    setPublishTitle(fallback);
    // Default scope: view if a view is active, otherwise whole model
    setPublishScope(canPublishView ? 'view' : 'model');

    // Default folder: first available folder in options
    const firstFolderId = folderOptions[0]?.id ?? '';
    setSelectedFolderId(firstFolderId);
  }, [canPublishView, fileName, folderOptions, model]);

  const doPublish = useCallback(async () => {
    if (!model) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const srcModel =
        publishScope === 'view'
          ? (() => {
              if (!activeViewId) throw new Error('No active view selected.');
              return sliceModelForView(model, activeViewId);
            })()
          : publishScope === 'folder'
          ? (() => {
              if (!selectedFolderId) throw new Error('No folder selected.');
              return sliceModelForFolder(model, selectedFolderId);
            })()
          : model;

      const exportName =
        publishScope === 'view' && activeViewId && model.views?.[activeViewId]
          ? model.views[activeViewId].name
          : publishScope === 'folder' && selectedFolderId && model.folders?.[selectedFolderId]
          ? model.folders[selectedFolderId].name
          : fileName ?? model.metadata?.name;

      const bundle = buildPublishBundleZip(srcModel, {
        sourceTool: 'EA Modeller',
        exportType: publishScope === 'view' ? 'ViewScope' : publishScope === 'folder' ? 'FolderScope' : 'ModelScope',
        exportName
      });

      // Download bundle zip
      downloadBytes(bundle.zipBytes, bundle.zipFileName);

      // Download latest.json pointer (relative manifest path)
      const latestJson = buildLatestPointerJson({
        bundleId: bundle.bundleId,
        title: publishTitle?.trim() ? publishTitle.trim() : undefined,
      });

      downloadTextFile('latest.json', latestJson, 'application/json');

      setPublishDialogOpen(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setPublishError(msg);
    } finally {
      setPublishing(false);
    }
  }, [activeViewId, fileName, model, publishScope, publishTitle, selectedFolderId]);

  return {
    publishDialogOpen,
    setPublishDialogOpen,
    publishing,
    publishError,

    publishTitle,
    setPublishTitle,
    publishScope,
    setPublishScope,

    folderOptions,
    selectedFolderId,
    setSelectedFolderId,

    currentViewLabel,
    canPublishView,

    openPublish,
    doPublish
  };
}
