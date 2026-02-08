import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';

import { importModel } from '../../import/framework/importModel';
import { applyImportIR } from '../../import/apply/applyImportIR';
import type { ImportReport } from '../../import/importReport';
import { validateModelWithNotations } from '../../notations/validateModelWithNotations';
import type { ValidationIssue } from '../../domain/validation/types';
import { modelStore } from '../../store';
import { buildPublishBundleZip } from '../lib/publishBundle';
import { buildLatestPointerJson } from '../lib/latestPointer';

type LoadState =
  | { status: 'idle' }
  | { status: 'importing'; fileName: string }
  | { status: 'imported'; fileName: string; report: ImportReport; issues: ValidationIssue[] }
  | { status: 'error'; message: string };

function getQueryParam(search: string, key: string): string | null {
  try {
    const sp = new URLSearchParams(search);
    const v = sp.get(key);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

function isPublisherEnabled(search: string): boolean {
  const q = getQueryParam(search, 'publisher');
  if (q === '1' || q === 'true') return true;
  try {
    return localStorage.getItem('publisher.enabled') === '1';
  } catch {
    return false;
  }
}

function setPublisherEnabled(value: boolean): void {
  try {
    localStorage.setItem('publisher.enabled', value ? '1' : '0');
  } catch {
    // ignore
  }
}

function downloadBytes(bytes: Uint8Array, fileName: string, mime = 'application/zip'): void {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function PublisherPage() {
  const loc = useLocation();
  const enabled = isPublisherEnabled(loc.search);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [bundleInfo, setBundleInfo] = useState<{ bundleId: string; zipFileName: string } | null>(null);
  const [latestTitle, setLatestTitle] = useState<string>('EA Portal');
  const [copyMsg, setCopyMsg] = useState<string>('');

  // Reset bundle info when state changes away from imported.
  useEffect(() => {
    if (state.status !== 'imported') setBundleInfo(null);
  }, [state.status]);

  const summary = useMemo(() => {
    if (state.status !== 'imported') return null;
    const report = state.report;
    const issues = state.issues;
    const issueCounts = issues.reduce(
      (acc, i) => {
        acc[i.severity] = (acc[i.severity] ?? 0) + 1;
        return acc;
      },
      {} as Record<'error' | 'warning', number>
    );

    const structuredCounts = report.issues.reduce(
      (acc, i) => {
        acc[i.level] = (acc[i.level] ?? 0) + i.count;
        return acc;
      },
      {} as Record<string, number>
    );

    return { issueCounts, structuredCounts };
  }, [state]);

  if (!enabled) {
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 900 }}>
        <h2 style={{ margin: 0 }}>Publisher</h2>
        <p style={{ margin: 0 }}>
          This page is guarded by a simple toggle for now. Enable it by opening:
        </p>
        <pre style={{ margin: 0, padding: 10, border: '1px solid #ddd', borderRadius: 8 }}>
          {window.location.origin + window.location.pathname + '#/publisher?publisher=1'}
        </pre>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="shellButton"
            onClick={() => {
              setPublisherEnabled(true);
              window.location.hash = '#/publisher';
              window.location.reload();
            }}
          >
            Enable publisher (local)
          </button>
          <Link className="shellButton" to="/">
            Back to Modeller
          </Link>
        </div>
        <p className="hintText" style={{ margin: 0 }}>
          Step 7 will later be hardened with proper roles/auth. For now this prevents accidental use.
        </p>
      </div>
    );
  }

  const importing = state.status === 'importing';

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ margin: 0 }}>Publisher</h2>
          <div className="hintText" style={{ margin: 0 }}>
            Import a Sparx EA XMI file and generate a versioned publish bundle (.zip).
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link className="shellButton" to="/portal">
            Open Portal
          </Link>
          <Link className="shellButton" to="/">
            Back to Modeller
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="shellButton"
          disabled={importing}
          onClick={() => fileInputRef.current?.click()}
        >
          1) Upload XMI…
        </button>

        <button
          type="button"
          className="shellButton"
          disabled={state.status !== 'imported'}
          onClick={() => {
            const model = modelStore.getState().model;
            if (!model) {
              setState({ status: 'error', message: 'No model is loaded in the store.' });
              return;
            }

            const exportName = state.status === 'imported' ? state.fileName : undefined;

            const built = buildPublishBundleZip(model, { sourceTool: 'SparxEA', exportType: 'XMI', exportName });
            downloadBytes(built.zipBytes, built.zipFileName);
            setBundleInfo({ bundleId: built.bundleId, zipFileName: built.zipFileName });
            // Default title suggestion (editable)
            setLatestTitle(`EA Portal — ${exportName ?? built.bundleId}`);
          }}
        >
          3) Generate publish bundle
        </button>

        <button
          type="button"
          className="shellButton"
          onClick={() => {
            setPublisherEnabled(false);
            window.location.hash = '#/';
            window.location.reload();
          }}
        >
          Disable publisher
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,.xmi,application/xml,text/xml"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0] ?? null;
            e.target.value = '';
            if (!file) return;

            setState({ status: 'importing', fileName: file.name });

            try {
              const importResult = await importModel(file);
              if (!importResult.ir) {
                throw new Error('Importer returned no IR.');
              }

              // Apply to store (creates a new model in the current workspace).
              const applied = applyImportIR(importResult.ir, importResult.report, {
                sourceSystem: 'SparxEA',
                defaultModelName: file.name
              });

              const model = modelStore.getState().model;
              if (!model) throw new Error('Model store did not contain a model after import.');

              const issues = validateModelWithNotations(model);

              setState({
                status: 'imported',
                fileName: file.name,
                report: applied.report,
                issues
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              setState({ status: 'error', message: msg });
            }
          }}
        />
      </div>

      {/* 2) Import report + validation summary */}
      <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ fontWeight: 600 }}>2) Import report + validation</div>
          <div className="hintText">
            {state.status === 'idle'
              ? 'No file imported yet.'
              : state.status === 'importing'
                ? `Importing: ${state.fileName}`
                : state.status === 'imported'
                  ? `Imported: ${state.fileName}`
                  : 'Error'}
          </div>
        </div>

        {state.status === 'error' ? (
          <div role="alert" style={{ padding: 10, border: '1px solid #c33', borderRadius: 8 }}>
            {state.message}
          </div>
        ) : null}

        {state.status === 'imported' ? (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ padding: 10, border: '1px solid #eee', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Validation issues</div>
                <div className="hintText" style={{ margin: 0 }}>
                  errors: {summary?.issueCounts?.error ?? 0} · warnings: {summary?.issueCounts?.warning ?? 0}
                </div>
              </div>
              <div style={{ padding: 10, border: '1px solid #eee', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Import issues</div>
                <div className="hintText" style={{ margin: 0 }}>
                  errors: {summary?.structuredCounts?.error ?? 0} · warnings: {summary?.structuredCounts?.warn ?? 0} · info:{' '}
                  {summary?.structuredCounts?.info ?? 0}
                </div>
              </div>
            </div>

            {copyMsg ? <div className="hintText">{copyMsg}</div> : null}

            <details>
              <summary style={{ cursor: 'pointer' }}>Show import issues</summary>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {state.report.issues.length === 0 ? (
                  <div className="hintText">No structured import issues.</div>
                ) : (
                  state.report.issues.slice(0, 200).map((it) => (
                    <div key={it.code + it.level} style={{ border: '1px solid #eee', borderRadius: 8, padding: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ fontWeight: 600 }}>
                          {it.level.toUpperCase()} · {it.code}
                        </div>
                        <div className="hintText">count: {it.count}</div>
                      </div>
                      <div className="hintText" style={{ marginTop: 4 }}>
                        {it.message}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </details>

            <details>
              <summary style={{ cursor: 'pointer' }}>Show validation issues</summary>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {state.issues.length === 0 ? (
                  <div className="hintText">No validation issues.</div>
                ) : (
                  state.issues.slice(0, 200).map((it) => (
                    <div key={it.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ fontWeight: 600 }}>
                          {it.severity.toUpperCase()} · {it.id}
                        </div>
                        <div className="hintText">{it.target.kind}</div>
                      </div>
                      <div className="hintText" style={{ marginTop: 4 }}>
                        {it.message}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </details>
          </>
        ) : null}
      </div>

      {bundleInfo ? (
        <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Bundle generated</div>
            <div className="hintText" style={{ margin: 0 }}>
              Downloaded: <b>{bundleInfo.zipFileName}</b>
            </div>
            <div className="hintText" style={{ margin: 0 }}>
              bundleId: <b>{bundleInfo.bundleId}</b>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontWeight: 600 }}>Generate latest.json</div>
            <div className="hintText" style={{ margin: 0 }}>
              This small pointer file lets the Portal load the newest published bundle.
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 700 }}>
              <span className="hintText">Title (optional)</span>
              <input
                value={latestTitle}
                onChange={(e) => setLatestTitle(e.target.value)}
                style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
                placeholder="EA Portal (Prod)"
              />
            </label>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="shellButton"
                onClick={() => {
                  const latestJson = buildLatestPointerJson({ bundleId: bundleInfo.bundleId, title: latestTitle || undefined });
                  downloadBytes(new TextEncoder().encode(latestJson), 'latest.json', 'application/json');
                }}
              >
                Download latest.json
              </button>

              <button
                type="button"
                className="shellButton"
                onClick={async () => {
                  const latestJson = buildLatestPointerJson({ bundleId: bundleInfo.bundleId, title: latestTitle || undefined });
                  try {
                    await navigator.clipboard.writeText(latestJson);
                    setCopyMsg('Copied latest.json to clipboard.');
                    window.setTimeout(() => setCopyMsg(''), 2500);
                  } catch {
                    setCopyMsg('Could not copy in this browser.');
                    window.setTimeout(() => setCopyMsg(''), 3500);
                  }
                }}
              >
                Copy latest.json
              </button>
            </div>

            {copyMsg ? <div className="hintText">{copyMsg}</div> : null}

            <details>
              <summary style={{ cursor: 'pointer' }}>Show hosting guidance</summary>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="hintText">
                  Host the bundle folder and <code>latest.json</code> on any static web server (GitHub Pages works well).
                </div>

                <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>1) Upload these files</div>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{`/latest.json
/${bundleInfo.bundleId}/manifest.json
/${bundleInfo.bundleId}/model.json
/${bundleInfo.bundleId}/indexes.json`}</pre>
                </div>

                <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>2) latest.json content</div>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {buildLatestPointerJson({ bundleId: bundleInfo.bundleId, title: latestTitle || undefined })}
                  </pre>
                </div>

                <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>3) Open the Portal</div>
                  <div className="hintText" style={{ margin: 0 }}>
                    In the Portal “Change dataset” dialog, set the latest URL to:
                  </div>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{`${window.location.origin}${window.location.pathname}latest.json`}</pre>
                  <div className="hintText" style={{ marginTop: 6 }}>
                    Or open directly with a query param:
                  </div>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{`${window.location.origin}${window.location.pathname}#/portal?bundleUrl=${encodeURIComponent('https://YOUR-HOST/latest.json')}`}</pre>
                </div>

                <div className="hintText">
                  Notes: if hosting on a different domain, ensure the server allows CORS for JSON fetches.
                </div>
              </div>
            </details>
          </div>
        </div>
      ) : null}
    </div>
  );
}
