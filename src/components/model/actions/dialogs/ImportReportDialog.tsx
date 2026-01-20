import { useCallback, useMemo, useState } from 'react';

import { Dialog } from '../../../dialog/Dialog';
import { ensureIssuesFromWarnings, formatUnknownCounts, hasImportWarnings } from '../../../../import';
import type { LastImportInfo } from '../useModelActionHandlers';

type JumpToDetail =
  | { kind: 'element'; elementId: string }
  | { kind: 'relationship'; relationshipId: string; viewId?: string }
  | { kind: 'view'; viewId: string }
  | { kind: 'viewNode'; viewId: string; elementId: string };

function dispatchJumpTo(detail: JumpToDetail): void {
  window.dispatchEvent(new CustomEvent<JumpToDetail>('pwa-modeller:jump-to', { detail }));
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const nav = navigator as unknown as { clipboard?: { writeText?: (t: string) => Promise<void> } };
    if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      await nav.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-10000px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

type ImportReportDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  lastImport: LastImportInfo | null;
  onDownloadReport: () => void;
};

export function ImportReportDialog({ isOpen, onClose, lastImport, onDownloadReport }: ImportReportDialogProps) {
  const [query, setQuery] = useState('');
  const [showInfo, setShowInfo] = useState(true);
  const [showWarn, setShowWarn] = useState(true);
  const [showError, setShowError] = useState(true);

  const issues = useMemo(() => (lastImport ? ensureIssuesFromWarnings(lastImport.report) : []), [lastImport]);

  const filteredIssues = useMemo(() => {
    const q = query.trim().toLowerCase();
    return issues.filter((iss) => {
      if (iss.level === 'info' && !showInfo) return false;
      if (iss.level === 'warn' && !showWarn) return false;
      if (iss.level === 'error' && !showError) return false;

      if (!q) return true;
      const hay = `${iss.level} ${iss.code ?? ''} ${iss.message}`.toLowerCase();
      return hay.includes(q);
    });
  }, [issues, query, showError, showInfo, showWarn]);

  const onCopyIssue = useCallback(async (idx: number) => {
    const iss = issues[idx];
    if (!iss) return;
    const payload = {
      level: iss.level,
      code: iss.code,
      message: iss.message,
      count: iss.count,
      samples: iss.samples ?? []
    };
    const text = `Import issue\n\n${iss.level.toUpperCase()}${iss.code ? ` (${iss.code})` : ''}: ${iss.message}${
      iss.count > 1 ? ` x${iss.count}` : ''
    }\n\nJSON:\n${JSON.stringify(payload, null, 2)}\n`;
    const ok = await copyToClipboard(text);
    if (!ok) window.alert('Failed to copy to clipboard');
  }, [issues]);

  const onCopySample = useCallback(async (sample: unknown) => {
    const text = JSON.stringify(sample, null, 2);
    const ok = await copyToClipboard(text);
    if (!ok) window.alert('Failed to copy to clipboard');
  }, []);

  const onJumpFromSample = useCallback(
    (sample: unknown) => {
      const s = sample as Record<string, unknown>;
      const elementId = typeof s.elementId === 'string' ? s.elementId : null;
      const relationshipId = typeof s.relationshipId === 'string' ? s.relationshipId : null;
      const viewId = typeof s.viewId === 'string' ? s.viewId : null;

      if (viewId && elementId) {
        dispatchJumpTo({ kind: 'viewNode', viewId, elementId });
        onClose();
        return;
      }
      if (viewId) {
        dispatchJumpTo({ kind: 'view', viewId });
        onClose();
        return;
      }
      if (relationshipId) {
        dispatchJumpTo({ kind: 'relationship', relationshipId, viewId: viewId ?? undefined });
        onClose();
        return;
      }
      if (elementId) {
        dispatchJumpTo({ kind: 'element', elementId });
        onClose();
      }
    },
    [onClose]
  );

  return (
    <Dialog
      title="Import report"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="shellButton" onClick={onClose}>
            Close
          </button>
          <button type="button" className="shellButton" onClick={onDownloadReport} disabled={!lastImport}>
            Download report
          </button>
        </>
      }
    >
      {lastImport ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div>
              <b>File</b>: {lastImport.fileName}
            </div>
            <div>
              <b>Format</b>: {lastImport.format}
            </div>
            <div>
              <b>Importer</b>: {lastImport.importerId}
            </div>
            <div>
              <b>Source</b>: {lastImport.report.source}
            </div>
            <div>
              <b>Counts</b>: folders={lastImport.counts.folders}, elements={lastImport.counts.elements}, relationships={lastImport.counts.relationships},
              views={lastImport.counts.views}
            </div>
          </div>

          <div>
            <b>Status</b>: {hasImportWarnings(lastImport.report) ? 'Warnings' : 'OK'}
          </div>

          {issues.length ? (
            <div>
              <b>Issues</b>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search issues..."
                  aria-label="Search issues"
                  style={{ minWidth: 240 }}
                />
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={showInfo} onChange={(e) => setShowInfo(e.target.checked)} /> info
                </label>
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={showWarn} onChange={(e) => setShowWarn(e.target.checked)} /> warn
                </label>
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={showError} onChange={(e) => setShowError(e.target.checked)} /> error
                </label>
                <span style={{ opacity: 0.8 }}>
                  showing {filteredIssues.length}/{issues.length}
                </span>
              </div>

              <ul>
                {filteredIssues.map((iss, i) => (
                  <li key={`${iss.level}-${iss.code}-${i}`}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 auto' }}>
                        <span style={{ textTransform: 'capitalize' }}>{iss.level}</span>
                        {iss.code ? <span style={{ opacity: 0.8 }}> ({iss.code})</span> : null}: {iss.message}
                        {iss.count > 1 ? <span style={{ opacity: 0.8 }}> x{iss.count}</span> : null}
                      </div>
                      <button
                        type="button"
                        className="shellButton"
                        onClick={() => {
                          // Map filtered index back to original issue list
                          const originalIndex = issues.indexOf(iss);
                          void onCopyIssue(originalIndex >= 0 ? originalIndex : i);
                        }}
                        title="Copy details"
                      >
                        Copy
                      </button>
                    </div>

                    {iss.samples && iss.samples.length ? (
                      <details>
                        <summary>Samples</summary>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                          {iss.samples.map((s, si) => {
                            const ss = s as Record<string, unknown>;
                            const canJump =
                              typeof ss.viewId === 'string' ||
                              typeof ss.elementId === 'string' ||
                              typeof ss.relationshipId === 'string';

                            let jumpLabel: string | null = null;
                            if (typeof ss.viewId === 'string' && typeof ss.elementId === 'string') jumpLabel = 'Jump to node';
                            else if (typeof ss.viewId === 'string') jumpLabel = 'Jump to view';
                            else if (typeof ss.relationshipId === 'string') jumpLabel = 'Jump to relationship';
                            else if (typeof ss.elementId === 'string') jumpLabel = 'Jump to element';

                            return (
                              <div key={si} style={{ border: '1px solid #ccc', borderRadius: 8, padding: 8 }}>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                  {jumpLabel ? (
                                    <button
                                      type="button"
                                      className="shellButton"
                                      onClick={() => onJumpFromSample(s)}
                                      disabled={!canJump}
                                    >
                                      {jumpLabel}
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="shellButton"
                                    onClick={() => void onCopySample(s)}
                                  >
                                    Copy sample
                                  </button>
                                </div>
                                <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{JSON.stringify(s, null, 2)}</pre>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {formatUnknownCounts(lastImport.report.unknownElementTypes).length ? (
            <div>
              <b>Unknown element types</b>
              <ul>
                {formatUnknownCounts(lastImport.report.unknownElementTypes).map(([k, v]) => (
                  <li key={k}>
                    {k}: {v}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {formatUnknownCounts(lastImport.report.unknownRelationshipTypes).length ? (
            <div>
              <b>Unknown relationship types</b>
              <ul>
                {formatUnknownCounts(lastImport.report.unknownRelationshipTypes).map(([k, v]) => (
                  <li key={k}>
                    {k}: {v}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!hasImportWarnings(lastImport.report) ? <div>No warnings.</div> : null}
        </div>
      ) : (
        <div>No report available.</div>
      )}
    </Dialog>
  );
}
