import type { ReactNode } from 'react';

import { Dialog } from '../../../dialog/Dialog';
import type { ResolveReport } from '../../../../store/overlay/resolve';

type OverlayResolveReportDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  sourceFileName: string;
  warnings: string[];
  report: ResolveReport;
  onDownloadReport: () => void;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

export function OverlayResolveReportDialog({
  isOpen,
  onClose,
  title,
  sourceFileName,
  warnings,
  report,
  onDownloadReport
}: OverlayResolveReportDialogProps) {
  const { attached, orphan, ambiguous } = report.counts;
  const limit = 40;

  return (
    <Dialog
      title={title ?? 'Overlay resolve report'}
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="shellButton" onClick={onClose}>
            Close
          </button>
          <button type="button" className="shellButton" onClick={onDownloadReport}>
            Download report
          </button>
        </div>
      }
    >
      <p className="hintText" style={{ marginTop: 0 }}>
        Source file: <strong>{sourceFileName}</strong>
      </p>

      <div className="shellStatus" style={{ flexWrap: 'wrap' }}>
        <span className="shellStatusChip">Total {report.total}</span>
        <span className="shellStatusChip">Attached {attached}</span>
        <span className="shellStatusChip">Orphan {orphan}</span>
        <span className="shellStatusChip">Ambiguous {ambiguous}</span>
      </div>

      {warnings.length ? (
        <Section title="Warnings">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {report.orphan.length ? (
        <Section title={`Orphans (showing up to ${limit})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {report.orphan.slice(0, limit).map((o) => (
              <div key={o.entryId} className="crudCard">
                <div style={{ fontWeight: 700 }}>Entry {o.entryId}</div>
                <div className="hintText">Keys: {o.externalKeys.join(', ') || '(none)'}</div>
              </div>
            ))}
          </div>
          {report.orphan.length > limit ? <p className="hintText">… and {report.orphan.length - limit} more</p> : null}
        </Section>
      ) : null}

      {report.ambiguous.length ? (
        <Section title={`Ambiguous (showing up to ${limit})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {report.ambiguous.slice(0, limit).map((a) => (
              <div key={a.entryId} className="crudCard">
                <div style={{ fontWeight: 700 }}>Entry {a.entryId}</div>
                <div className="hintText">Candidates: {a.candidates.map((c) => `${c.kind}:${c.id}`).join(', ')}</div>
              </div>
            ))}
          </div>
          {report.ambiguous.length > limit ? (
            <p className="hintText">… and {report.ambiguous.length - limit} more</p>
          ) : null}
        </Section>
      ) : null}

      {!warnings.length && report.orphan.length === 0 && report.ambiguous.length === 0 ? (
        <p className="hintText" style={{ marginTop: 14 }}>
          No issues detected.
        </p>
      ) : null}
    </Dialog>
  );
}
