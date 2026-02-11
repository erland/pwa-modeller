import { Dialog } from '../../../dialog/Dialog';
import { useEffect, useMemo, useState } from 'react';
import {
  clearPublishServerDatasetId,
  loadPublishServerSettings,
  savePublishServerSettings
} from '../../../../publisher/server/publishServerSettings';

import { listDatasets, type DatasetInfo } from '../../../../publisher/server/publishServerClient';
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
  success?: string | null;
  publishServerResult?: {
    datasetId: string;
    bundleId: string;
    publishedAt?: string;
    latestUrl?: string;
    manifestUrl?: string;
  } | null;

  onPublish: () => void;

  /**
   * Placeholder for upcoming "Publish to Server" support.
   * Step 0 (integration point) keeps behavior unchanged.
   */
  onPublishToServer?: () => void;
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
  success,
  publishServerResult,
  onPublish,
  onPublishToServer
}: PublishDialogProps) {
  // Step 1: publishing-server settings (UI + persistence)
  const [serverBaseUrl, setServerBaseUrl] = useState('');

  const serverBaseUrlValid = !!serverBaseUrl.trim() && /^https?:\/\//i.test(serverBaseUrl.trim());useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!serverBaseUrlValid) {
        setDatasets([]);
        setDatasetsError(null);
        return;
      }

      setDatasetsLoading(true);
      setDatasetsError(null);
      try {
        const list = await listDatasets(serverBaseUrl.trim());
        if (cancelled) return;
        setDatasets(Array.isArray(list) ? list : []);
      } catch (e: any) {
        if (cancelled) return;
        setDatasets([]);
        setDatasetsError(e?.message || 'Failed to load datasets');
      } finally {
        if (!cancelled) setDatasetsLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [serverBaseUrl, serverBaseUrlValid]);
  const [serverDatasetId, setServerDatasetId] = useState('');

  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [datasetsError, setDatasetsError] = useState<string | null>(null);
  const [rememberDatasetId, setRememberDatasetId] = useState(true);

  const datasetOptions = useMemo((): DatasetInfo[] => {
    const list = datasets.slice();
    list.sort((a: DatasetInfo, b: DatasetInfo) => (a.title || a.datasetId).localeCompare(b.title || b.datasetId));
    return list;
  }, [datasets]);

  useEffect(() => {
    if (!isOpen) return;
    const s = loadPublishServerSettings();
    setServerBaseUrl(s.baseUrl);
    setServerDatasetId(s.datasetId);
    setRememberDatasetId(s.rememberLastDatasetId);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    savePublishServerSettings({ baseUrl: serverBaseUrl });
  }, [isOpen, serverBaseUrl]);

  useEffect(() => {
    if (!isOpen) return;
    savePublishServerSettings({ rememberLastDatasetId: rememberDatasetId });
    if (!rememberDatasetId) {
      clearPublishServerDatasetId();
    }
  }, [isOpen, rememberDatasetId]);

  useEffect(() => {
    if (!isOpen) return;
    if (!rememberDatasetId) return;
    savePublishServerSettings({ datasetId: serverDatasetId });
  }, [isOpen, rememberDatasetId, serverDatasetId]);

  const baseUrlOk = useMemo(() => {
    const v = serverBaseUrl.trim();
    if (!v) return true;
    return /^https?:\/\//i.test(v);
  }, [serverBaseUrl]);

  const datasetIdOk = useMemo(() => {
    const v = serverDatasetId.trim();
    if (!v) return true;
    return /^[a-z0-9][a-z0-9-_]{1,63}$/.test(v);
  }, [serverDatasetId]);

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

        <div
          style={{
            border: '1px solid rgba(127,127,127,0.25)',
            borderRadius: 8,
            padding: 10,
            background: 'rgba(127,127,127,0.06)'
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Publishing server (optional)</div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Server base URL</div>
            <input
              type="text"
              value={serverBaseUrl}
              onChange={(e) => setServerBaseUrl(e.currentTarget.value)}
              className="textInput"
              placeholder="https://intranet/ea/publish-server"
            />
            {!baseUrlOk ? (
              <div style={{ fontSize: 12, color: 'var(--danger, #b00020)' }}>Must start with http:// or https://</div>
            ) : null}
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Dataset</div>
            {datasetsLoading ? <div style={{ fontSize: 12, opacity: 0.7 }}>Loading…</div> : null}
          </div>
          {datasetsError ? (
            <div style={{ fontSize: 12, color: 'var(--warn, #b26a00)' }}>
              Could not load datasets. You can still type a Dataset ID.
            </div>
          ) : null}
          {datasetOptions.length > 0 ? (
            <select
              value=""
              onChange={(e) => {
                const v = e.currentTarget.value;
                if (v) setServerDatasetId(v);
              }}
              className="textInput"
              style={{ marginTop: 6 }}
            >
              <option value="">Select existing…</option>
              {datasetOptions.map((d: DatasetInfo) => (
                <option key={d.datasetId} value={d.datasetId}>
                  {(d.title ? `${d.title} — ` : ``) + d.datasetId}
                </option>
              ))}
            </select>
          ) : null}

            <div style={{ fontSize: 12, opacity: 0.8 }}>Dataset ID</div>
            <input
              type="text"
              value={serverDatasetId}
              onChange={(e) => setServerDatasetId(e.currentTarget.value)}
              className="textInput"
              placeholder="tullverket-business"
              disabled={!rememberDatasetId}
            />
            {!datasetIdOk ? (
              <div style={{ fontSize: 12, color: 'var(--danger, #b00020)' }}>
                Expected: lowercase letters/digits, dash/underscore. 2–64 chars.
              </div>
            ) : null}
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={rememberDatasetId}
              onChange={(e) => setRememberDatasetId(Boolean(e.currentTarget.checked))}
            />
            Remember dataset ID on this device
          </label>

          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8, lineHeight: 1.35 }}>
            When implemented, “Publish to server” will upload the same bundle ZIP to the server API and the server will
            update <code>latest.json</code> for the selected dataset.
          </div>
        </div>

        {success ? (
          <div style={{ color: 'var(--success, #0a7a2f)', whiteSpace: 'pre-wrap', fontSize: 13 }}>{success}</div>
        ) : null}

        
        {publishServerResult ? (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>Wiki link helper</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
              Use this URL as <code>latestUrl</code> in your wiki portal link.
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <input
                className="textInput"
                style={{ flex: 1 }}
                readOnly
                value={
                  publishServerResult.latestUrl ||
                  '(Server did not provide latest URL — ask admin to set PUBLISH_BASE_URL on the publishing server)'
                }
              />
              <button
                className="button"
                disabled={!publishServerResult.latestUrl}
                onClick={async () => {
                  if (!publishServerResult.latestUrl) return;
                  try {
                    await navigator.clipboard.writeText(publishServerResult.latestUrl);
                  } catch (e) {
                    // ignore — user can still copy manually
                  }
                }}
                title={publishServerResult.latestUrl ? 'Copy latestUrl' : 'No latest URL available'}
              >
                Copy
              </button>
            </div>

            {publishServerResult.manifestUrl ? (
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                Manifest: <code>{publishServerResult.manifestUrl}</code>
              </div>
            ) : null}
          </div>
        ) : null}

{error ? (
          <div style={{ color: 'var(--danger, #b00020)', whiteSpace: 'pre-wrap', fontSize: 13 }}>{error}</div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <button type="button" className="shellButton" onClick={onClose} disabled={publishing}>
            Cancel
          </button>

          <button
            type="button"
            className="shellButton"
            onClick={onPublishToServer}
            disabled={publishing || !onPublishToServer || !baseUrlOk || !datasetIdOk}
            title={!onPublishToServer ? 'Publish to Server is coming soon.' : undefined}
          >
            Publish to server
          </button>

          <button type="button" className="shellButton shellPrimaryAction" onClick={onPublish} disabled={publishing}>
            {publishing ? 'Publishing…' : 'Publish (download)'}
          </button>
        </div>

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
          Publishing downloads a bundle zip plus a latest.json pointer file. Host both on a static web server and point
          the Portal to latest.json.
        </div>

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Tip: "Publish to server" will let you upload the same bundle zip directly to a publishing server API (coming
          next).
        </div>
      </div>
    </Dialog>
  );
}
