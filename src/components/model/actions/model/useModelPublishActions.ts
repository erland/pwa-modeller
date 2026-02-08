import { useCallback, useMemo, useState } from 'react';

import type { Model } from '../../../../domain';
import { downloadTextFile } from '../../../../store';

import { buildPublishBundleZip } from '../../../../publisher/lib/publishBundle';
import { buildLatestPointerJson } from '../../../../publisher/lib/latestPointer';
import { sliceModelForView } from '../../../../publisher/lib/sliceModel';

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

export function useModelPublishActions({ model, fileName, activeViewId }: UseModelPublishActionsArgs) {
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [publishTitle, setPublishTitle] = useState('');
  const [publishScope, setPublishScope] = useState<PublishScope>('model');

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
  }, [canPublishView, fileName, model]);

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
          : model;

      const exportName =
        publishScope === 'view' && activeViewId && model.views?.[activeViewId]
          ? model.views[activeViewId].name
          : fileName ?? model.metadata?.name;

      const bundle = buildPublishBundleZip(srcModel, {
        sourceTool: 'EA Modeller',
        exportType: publishScope === 'view' ? 'ViewScope' : 'ModelScope',
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
  }, [activeViewId, fileName, model, publishScope, publishTitle]);

  return {
    publishDialogOpen,
    setPublishDialogOpen,
    publishing,
    publishError,

    publishTitle,
    setPublishTitle,
    publishScope,
    setPublishScope,

    currentViewLabel,
    canPublishView,

    openPublish,
    doPublish
  };
}
