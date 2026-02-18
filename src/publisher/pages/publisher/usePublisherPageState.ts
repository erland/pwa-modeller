import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { importModel } from '../../../import/framework/importModel';
import { applyImportIR } from '../../../import/apply/applyImportIR';
import type { ImportReport } from '../../../import/importReport';
import { validateModelWithNotations } from '../../../notations/validateModelWithNotations';
import type { ValidationIssue } from '../../../domain/validation/types';
import { modelStore } from '../../../store';
import { buildPublishBundleZip } from '../../lib/publishBundle';
import { buildLatestPointerJson } from '../../lib/latestPointer';
import { downloadBytes } from '../../services/download';
import { isPublisherEnabled, setPublisherEnabled } from '../../services/publisherGuard';

export type PublisherLoadState =
  | { status: 'idle' }
  | { status: 'importing'; fileName: string }
  | { status: 'imported'; fileName: string; report: ImportReport; issues: ValidationIssue[] }
  | { status: 'error'; message: string };

export type PublisherBundleInfo = { bundleId: string; zipFileName: string };

export type PublisherSummary = {
  issueCounts: Record<'error' | 'warning', number>;
  structuredCounts: Record<string, number>;
};

export type PublisherPageState = {
  enabled: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  state: PublisherLoadState;
  importing: boolean;
  statusHint: string;
  summary: PublisherSummary | null;
  bundleInfo: PublisherBundleInfo | null;
  latestTitle: string;
  copyMsg: string;
  // actions
  enablePublisher: () => void;
  disablePublisher: () => void;
  openFilePicker: () => void;
  onFileSelected: (file: File) => Promise<void>;
  generateBundle: () => void;
  setLatestTitle: (v: string) => void;
  downloadLatestJson: () => void;
  copyLatestJson: () => Promise<void>;
};

function calcStatusHint(state: PublisherLoadState): string {
  if (state.status === 'idle') return 'No file imported yet.';
  if (state.status === 'importing') return `Importing: ${state.fileName}`;
  if (state.status === 'imported') return `Imported: ${state.fileName}`;
  return 'Error';
}

export function usePublisherPageState(): PublisherPageState {
  const loc = useLocation();
  const enabled = isPublisherEnabled(loc.search);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<PublisherLoadState>({ status: 'idle' });
  const [bundleInfo, setBundleInfo] = useState<PublisherBundleInfo | null>(null);
  const [latestTitle, setLatestTitle] = useState<string>('EA Portal');
  const [copyMsg, setCopyMsg] = useState<string>('');

  // Reset bundle info when state changes away from imported.
  useEffect(() => {
    if (state.status !== 'imported') setBundleInfo(null);
  }, [state.status]);

  const summary = useMemo<PublisherSummary | null>(() => {
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

  const importing = state.status === 'importing';

  function enablePublisher(): void {
    setPublisherEnabled(true);
    window.location.hash = '#/publisher';
    window.location.reload();
  }

  function disablePublisher(): void {
    setPublisherEnabled(false);
    window.location.hash = '#/';
    window.location.reload();
  }

  function openFilePicker(): void {
    fileInputRef.current?.click();
  }

  async function onFileSelected(file: File): Promise<void> {
    setState({ status: 'importing', fileName: file.name });
    try {
      const importResult = await importModel(file);
      if (!importResult.ir) {
        throw new Error('Importer returned no IR.');
      }

      applyImportIR(importResult.ir, importResult.report, {
        sourceSystem: 'SparxEA',
        defaultModelName: file.name
      });

      const model = modelStore.getState().model;
      if (!model) throw new Error('Model store did not contain a model after import.');

      const issues = validateModelWithNotations(model);

      setState({
        status: 'imported',
        fileName: file.name,
        report: importResult.report,
        issues
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState({ status: 'error', message: msg });
    }
  }

  function generateBundle(): void {
    const model = modelStore.getState().model;
    if (!model) {
      setState({ status: 'error', message: 'No model is loaded in the store.' });
      return;
    }
    const exportName = state.status === 'imported' ? state.fileName : undefined;
    try {
      const built = buildPublishBundleZip(model, { sourceTool: 'SparxEA', exportType: 'XMI', exportName });
      downloadBytes(built.zipBytes, built.zipFileName);
      setBundleInfo({ bundleId: built.bundleId, zipFileName: built.zipFileName });
      setLatestTitle(`EA Portal — ${exportName ?? built.bundleId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState({ status: 'error', message: msg });
    }
  }

  function downloadLatestJson(): void {
    if (!bundleInfo) return;
    const latestJson = buildLatestPointerJson({ bundleId: bundleInfo.bundleId, title: latestTitle || undefined });
    downloadBytes(new TextEncoder().encode(latestJson), 'latest.json', 'application/json');
  }

  async function copyLatestJson(): Promise<void> {
    if (!bundleInfo) return;
    const latestJson = buildLatestPointerJson({ bundleId: bundleInfo.bundleId, title: latestTitle || undefined });
    try {
      await navigator.clipboard.writeText(latestJson);
      setCopyMsg('Copied latest.json to clipboard.');
      window.setTimeout(() => setCopyMsg(''), 2500);
    } catch {
      setCopyMsg('Could not copy in this browser.');
      window.setTimeout(() => setCopyMsg(''), 3500);
    }
  }

  return {
    enabled,
    fileInputRef,
    state,
    importing,
    statusHint: calcStatusHint(state),
    summary,
    bundleInfo,
    latestTitle,
    copyMsg,
    enablePublisher,
    disablePublisher,
    openFilePicker,
    onFileSelected,
    generateBundle,
    setLatestTitle,
    downloadLatestJson,
    copyLatestJson
  };
}
