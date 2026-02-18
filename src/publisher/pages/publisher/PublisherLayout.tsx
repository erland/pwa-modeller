import type { ChangeEvent } from 'react';
import { Link } from 'react-router-dom';

import type { PublisherPageState } from './usePublisherPageState';
import { buildLatestPointerJson } from '../../lib/latestPointer';

type Props = PublisherPageState;

export function PublisherLayout(p: Props) {
  if (!p.enabled) {
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 900 }}>
        <h2 style={{ margin: 0 }}>Publisher</h2>
        <p style={{ margin: 0 }}>This page is guarded by a simple toggle for now. Enable it by opening:</p>
        <pre style={{ margin: 0, padding: 10, border: '1px solid #ddd', borderRadius: 8 }}>
          {window.location.origin + window.location.pathname + '#/publisher?publisher=1'}
        </pre>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="shellButton" onClick={p.enablePublisher}>
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

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 1000 }}>
      <Header />

      <Actions
        importing={p.importing}
        canGenerate={p.state.status === 'imported'}
        openFilePicker={p.openFilePicker}
        generateBundle={p.generateBundle}
        disablePublisher={p.disablePublisher}
      />

      <input
        ref={p.fileInputRef}
        type="file"
        accept=".xml,.xmi,application/xml,text/xml"
        style={{ display: 'none' }}
        onChange={async (e: ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = '';
          if (!file) return;
          await p.onFileSelected(file);
        }}
      />

      <ImportReportPanel state={p.state} statusHint={p.statusHint} summary={p.summary} copyMsg={p.copyMsg} />

      {p.bundleInfo ? (
        <BundleGeneratedPanel
          bundleId={p.bundleInfo.bundleId}
          zipFileName={p.bundleInfo.zipFileName}
          latestTitle={p.latestTitle}
          setLatestTitle={p.setLatestTitle}
          downloadLatestJson={p.downloadLatestJson}
          copyLatestJson={p.copyLatestJson}
          copyMsg={p.copyMsg}
        />
      ) : null}
    </div>
  );
}

function Header() {
  return (
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
  );
}

function Actions(p: {
  importing: boolean;
  canGenerate: boolean;
  openFilePicker: () => void;
  generateBundle: () => void;
  disablePublisher: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <button type="button" className="shellButton" disabled={p.importing} onClick={p.openFilePicker}>
        1) Upload XMI…
      </button>
      <button type="button" className="shellButton" disabled={!p.canGenerate} onClick={p.generateBundle}>
        3) Generate publish bundle
      </button>
      <button type="button" className="shellButton" onClick={p.disablePublisher}>
        Disable publisher
      </button>
    </div>
  );
}

function ImportReportPanel(p: {
  state: Props['state'];
  statusHint: string;
  summary: Props['summary'];
  copyMsg: string;
}) {
  const state = p.state;
  const summary = p.summary;
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ fontWeight: 600 }}>2) Import report + validation</div>
        <div className="hintText">{p.statusHint}</div>
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

          {p.copyMsg ? <div className="hintText">{p.copyMsg}</div> : null}

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
  );
}

function BundleGeneratedPanel(p: {
  bundleId: string;
  zipFileName: string;
  latestTitle: string;
  setLatestTitle: (v: string) => void;
  downloadLatestJson: () => void;
  copyLatestJson: () => Promise<void>;
  copyMsg: string;
}) {
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Bundle generated</div>
        <div className="hintText" style={{ margin: 0 }}>
          Downloaded: <b>{p.zipFileName}</b>
        </div>
        <div className="hintText" style={{ margin: 0 }}>
          bundleId: <b>{p.bundleId}</b>
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
            value={p.latestTitle}
            onChange={(e) => p.setLatestTitle(e.target.value)}
            style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
            placeholder="EA Portal (Prod)"
          />
        </label>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="shellButton" onClick={p.downloadLatestJson}>
            Download latest.json
          </button>

          <button type="button" className="shellButton" onClick={p.copyLatestJson}>
            Copy latest.json
          </button>
        </div>

        {p.copyMsg ? <div className="hintText">{p.copyMsg}</div> : null}

        <details>
          <summary style={{ cursor: 'pointer' }}>Show hosting guidance</summary>
          <HostingGuidance bundleId={p.bundleId} latestTitle={p.latestTitle} />
        </details>
      </div>
    </div>
  );
}

function HostingGuidance(p: { bundleId: string; latestTitle: string }) {
  const latestJson = buildLatestPointerJson({ bundleId: p.bundleId, title: p.latestTitle || undefined });
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="hintText">Host the bundle folder and <code>latest.json</code> on any static web server (GitHub Pages works well).</div>

      <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>1) Upload these files</div>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{`/latest.json
/${p.bundleId}/manifest.json
/${p.bundleId}/model.json
/${p.bundleId}/indexes.json`}</pre>
      </div>

      <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>2) latest.json content</div>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{latestJson}</pre>
      </div>

      <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>3) Open the Portal</div>
        <div className="hintText" style={{ margin: 0 }}>
          In the Portal “Change dataset” dialog, set the latest URL to:
        </div>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{`${window.location.origin}${window.location.pathname}latest.json`}</pre>
        <div className="hintText" style={{ marginTop: 6 }}>Or open directly with a query param:</div>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{`${window.location.origin}${window.location.pathname}#/portal?bundleUrl=${encodeURIComponent(
          'https://YOUR-HOST/latest.json'
        )}`}</pre>
      </div>

      <div className="hintText">Notes: if hosting on a different domain, ensure the server allows CORS for JSON fetches.</div>
    </div>
  );
}
