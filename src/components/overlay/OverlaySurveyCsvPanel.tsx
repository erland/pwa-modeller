import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Model } from '../../domain';
import { computeModelSignature } from '../../domain';
import { downloadTextFile, sanitizeFileNameWithExtension } from '../../store';
import { overlayStore } from '../../store/overlay/overlayStoreInstance';
import {
  importOverlaySurveyCsvToStore,
  serializeOverlaySurveyCsv,
  type SurveyExportOptions,
  type SurveyImportOptions,
  type SurveyTargetSet
} from '../../store/overlay';

import { defaultOverlayFileBase, parseKeyList, readFileAsText } from './overlayUiUtils';
import { HiddenFilePicker } from './shared/HiddenFilePicker';
import { TypeMultiSelect } from './shared/TypeMultiSelect';

type ToastState = { kind: 'info' | 'success' | 'warn' | 'error'; message: string };

export function OverlaySurveyCsvPanel(props: { model: Model | null; fileName: string | null }) {
  const { model, fileName } = props;

  const [toast, setToast] = useState<ToastState | null>(null);

  // Export state
  const [targetSet, setTargetSet] = useState<SurveyTargetSet>('elements');
  const [selectedElementTypes, setSelectedElementTypes] = useState<string[] | undefined>(undefined); // undefined means all; [] means none
  const [selectedRelationshipTypes, setSelectedRelationshipTypes] = useState<string[] | undefined>(undefined); // undefined means all; [] means none
  const [tagKeysText, setTagKeysText] = useState<string>('');
  // (filter state lives inside TypeMultiSelect)

  // Import state
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importOptions, setImportOptions] = useState<SurveyImportOptions>({ blankMode: 'ignore' });

  useEffect(() => {
    // Reset type filters when model changes.
    if (!model) return;
    const sig = computeModelSignature(model);
    // Use signature in dep array, not direct effect.
    void sig;
    setSelectedElementTypes(undefined);
    setSelectedRelationshipTypes(undefined);
  }, [model ? computeModelSignature(model) : '']);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const availableElementTypes = useMemo(() => {
    if (!model) return [] as string[];
    const set = new Set<string>();
    for (const el of Object.values(model.elements ?? {})) {
      const t = String((el as any).type ?? '').trim();
      if (t) set.add(t);
    }
    return [...set.values()].sort();
  }, [model]);

  const availableRelationshipTypes = useMemo(() => {
    if (!model) return [] as string[];
    const set = new Set<string>();
    for (const rel of Object.values(model.relationships ?? {})) {
      const t = String((rel as any).type ?? '').trim();
      if (t) set.add(t);
    }
    return [...set.values()].sort();
  }, [model]);


  const suggestKeys = useCallback(() => {
    if (!model) {
      setToast({ kind: 'warn', message: 'Load a model first.' });
      return;
    }

    const set = new Set<string>();
    // Overlay keys
    for (const e of overlayStore.listEntries()) {
      for (const k0 of Object.keys(e.tags ?? {})) {
        const k = (k0 ?? '').toString().trim();
        if (k) set.add(k);
      }
    }
    // Core keys
    for (const el of Object.values(model.elements ?? {})) {
      for (const tv of (el as any).taggedValues ?? []) {
        const k = (tv?.key ?? '').toString().trim();
        if (k) set.add(k);
      }
    }
    for (const rel of Object.values(model.relationships ?? {})) {
      for (const tv of (rel as any).taggedValues ?? []) {
        const k = (tv?.key ?? '').toString().trim();
        if (k) set.add(k);
      }
    }

    const keys = [...set.values()]
      .map((s) => s.trim())
      .filter((s) => !!s)
      .sort()
      .slice(0, 40);

    setTagKeysText(keys.join('\n'));
    setToast({ kind: 'info', message: keys.length ? `Suggested ${keys.length} keys.` : 'No tag keys found to suggest.' });
  }, [model]);

  const doExport = useCallback(() => {
    if (!model) {
      setToast({ kind: 'warn', message: 'Load a model first before exporting a survey CSV.' });
      return;
    }

    const base = defaultOverlayFileBase(model, fileName);
    const tagKeys = parseKeyList(tagKeysText);

    const options: SurveyExportOptions = {
      targetSet,
      elementTypes: selectedElementTypes,
      relationshipTypes: selectedRelationshipTypes,
      tagKeys,
      prefillFromEffectiveTags: true
    };

    const csv = serializeOverlaySurveyCsv({ model, overlayStore, options });
    downloadTextFile(sanitizeFileNameWithExtension(`${base}-overlay-survey`, 'csv'), csv, 'text/csv');
    setToast({ kind: 'success', message: 'Overlay survey CSV exported.' });
  }, [fileName, model, selectedElementTypes, selectedRelationshipTypes, tagKeysText, targetSet]);

  const onFileChosen = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!model) return;
      setImporting(true);
      setImportError(null);
      try {
        const text = await readFileAsText(file);
        const result = importOverlaySurveyCsvToStore({ model, overlayStore, csvText: text, options: importOptions });

        const { warnings, resolveReport, stats } = result;
        const warnSuffix = warnings.length === 0 ? '' : warnings.length === 1 ? ' (1 warning)' : ` (${warnings.length} warnings)`;
        const summary = `attached=${resolveReport.counts.attached}, orphan=${resolveReport.counts.orphan}, ambiguous=${resolveReport.counts.ambiguous}`;
        const msg = `Survey imported: ${summary}${warnSuffix}. Rows processed=${stats.rowsProcessed}, skipped=${stats.rowsSkipped}, entries touched=${stats.entriesTouched}.`;
        setToast({
          kind: warnings.length || resolveReport.counts.orphan || resolveReport.counts.ambiguous ? 'warn' : 'success',
          message: msg
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setImportError(msg);
        setToast({ kind: 'error', message: 'Failed to import survey CSV.' });
      } finally {
        setImporting(false);
      }
    },
    [importOptions, model]
  );

  return (
    <div className="crudPanel" style={{ marginBottom: 12 }}>
      <div className="crudPanelTitle">Survey CSV (bulk tag values)</div>
      <p className="hintText" style={{ marginTop: 6 }}>
        Export a survey-friendly CSV (one row per target, one column per tag key) and import the filled-in CSV back into the overlay.
        Import supports <code>,</code>, <code>;</code> and <code>\t</code> delimiters.
      </p>

      <div className="crudGrid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* EXPORT */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Export</div>

          <div className="crudFormRow">
            <label className="crudLabel">Targets</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label className="crudInlineLabel">
                <input
                  type="radio"
                  name="ovlSurveyTargetSetInline"
                  checked={targetSet === 'elements'}
                  onChange={() => setTargetSet('elements')}
                />{' '}
                Elements
              </label>
              <label className="crudInlineLabel">
                <input
                  type="radio"
                  name="ovlSurveyTargetSetInline"
                  checked={targetSet === 'relationships'}
                  onChange={() => setTargetSet('relationships')}
                />{' '}
                Relationships
              </label>
              <label className="crudInlineLabel">
                <input
                  type="radio"
                  name="ovlSurveyTargetSetInline"
                  checked={targetSet === 'both'}
                  onChange={() => setTargetSet('both')}
                />{' '}
                Both
              </label>
            </div>
          </div>

          {(targetSet === 'elements' || targetSet === 'both') && (
            <TypeMultiSelect
              label="Element types"
              allTypes={availableElementTypes}
              selectedTypes={selectedElementTypes}
              onChange={setSelectedElementTypes}
              filterPlaceholder="Filter element types…"
            />
          )}

          {(targetSet === 'relationships' || targetSet === 'both') && (
            <TypeMultiSelect
              label="Relationship types"
              allTypes={availableRelationshipTypes}
              selectedTypes={selectedRelationshipTypes}
              onChange={setSelectedRelationshipTypes}
              filterPlaceholder="Filter relationship types…"
            />
          )}

          <div className="crudFormRow">
            <label className="crudLabel" htmlFor="ovlSurveyKeysInline">
              Tag keys (columns)
            </label>
            <textarea
              id="ovlSurveyKeysInline"
              className="crudTextArea"
              rows={6}
              value={tagKeysText}
              onChange={(e) => setTagKeysText(e.currentTarget.value)}
              placeholder="owner\ncriticality\nrisk\ncost"
            />
            <div className="hintText">One per line (or comma-separated). Empty means export only identifying columns.</div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <button type="button" className="shellButton" onClick={suggestKeys} disabled={!model}>
              Suggest keys
            </button>
            <button type="button" className="shellButton shellPrimaryAction" onClick={doExport} disabled={!model}>
              Export CSV
            </button>
          </div>
        </div>

        {/* IMPORT */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Import</div>

          <div className="crudFormRow">
            <label className="crudLabel">Blank cells</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label className="crudInlineLabel">
                <input
                  type="radio"
                  name="ovlSurveyBlankModeInline"
                  checked={importOptions.blankMode === 'ignore'}
                  onChange={() => setImportOptions({ ...importOptions, blankMode: 'ignore' })}
                />{' '}
                Ignore blanks (do not change)
              </label>
              <label className="crudInlineLabel">
                <input
                  type="radio"
                  name="ovlSurveyBlankModeInline"
                  checked={importOptions.blankMode === 'clear'}
                  onChange={() => setImportOptions({ ...importOptions, blankMode: 'clear' })}
                />{' '}
                Clear overlay tags when blank
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <HiddenFilePicker accept=".csv,text/csv" onFile={onFileChosen}>
              {(open) => (
                <button type="button" className="shellButton shellPrimaryAction" onClick={open} disabled={!model || importing}>
                  Choose CSV…
                </button>
              )}
            </HiddenFilePicker>
          </div>

          {importing ? <p className="hintText">Importing…</p> : null}
          {importError ? (
            <div className="crudError" role="alert">
              {importError}
            </div>
          ) : null}
        </div>
      </div>

      {toast ? (
        <div className={`toast toast-${toast.kind}`} role="status" aria-live="polite" style={{ marginTop: 10 }}>
          <div className="toastRow">
            <div className="toastMsg">{toast.message}</div>
            <button type="button" className="shellIconButton" aria-label="Dismiss" onClick={() => setToast(null)}>
              ✕
            </button>
          </div>
        </div>
      ) : null}

    </div>
  );
}
