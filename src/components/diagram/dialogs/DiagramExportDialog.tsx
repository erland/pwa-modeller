import { useState } from 'react';

import type { Model } from '../../../domain';
import type { PptxOptions } from '../../../export/contracts/ExportOptions';

import { downloadViewPng, downloadViewPptx, downloadViewSvg } from '../../../export/viewDiagramExport';
import { Dialog } from '../../dialog/Dialog';

type ExportFormat = 'png' | 'svg' | 'pptx';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  model: Model | null;
  activeViewId: string | null;
};

const defaultPptxOptions: PptxOptions = {
  layout: 'wide',
  theme: 'light',
  includeTitleSlide: false,
  includeNotes: false,
  footerText: undefined,
  diagramMode: 'image',
};

export function DiagramExportDialog({ isOpen, onClose, model, activeViewId }: Props) {
  const canExport = !!model && !!activeViewId;

  const [format, setFormat] = useState<ExportFormat>('png');

  // PNG opts
  const [pngScale, setPngScale] = useState<number>(2);
  const [pngBackground, setPngBackground] = useState<'white' | 'transparent'>('white');

  // PPTX opts
  // For model workspace diagrams, default PPTX export to editable shapes/connectors.
  // (Users can still switch back to image-based export.)
  const [pptxOptions, setPptxOptions] = useState<PptxOptions>(() => ({
    ...defaultPptxOptions,
    diagramMode: 'shapes',
  }));

  const [isWorking, setIsWorking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function onDownload() {
    if (!model || !activeViewId) return;
    setIsWorking(true);
    setStatus(null);
    try {
      if (format === 'svg') {
        downloadViewSvg(model, activeViewId);
      } else if (format === 'png') {
        await downloadViewPng(model, activeViewId, { scale: pngScale, background: pngBackground });
      } else {
        await downloadViewPptx(model, activeViewId, pptxOptions);
      }
      setStatus('Export complete.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Export failed: ${msg}`);
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <Dialog
      title="Export..."
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="shellButton" onClick={onClose} disabled={isWorking}>
            Close
          </button>
          <button type="button" className="shellButton" onClick={onDownload} disabled={!canExport || isWorking}>
            {isWorking ? 'Working…' : 'Download'}
          </button>
        </div>
      }
    >
      <div className="dialogBody" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 420 }}>
        {!canExport && (
          <div style={{ opacity: 0.8 }}>
            No active view to export.
          </div>
        )}

        <fieldset style={{ border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: 10 }}>
          <legend style={{ padding: '0 6px' }}>Format</legend>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="radio"
                name="exportFormat"
                checked={format === 'png'}
                onChange={() => setFormat('png')}
              />
              PNG
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="radio"
                name="exportFormat"
                checked={format === 'svg'}
                onChange={() => setFormat('svg')}
              />
              SVG
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="radio"
                name="exportFormat"
                checked={format === 'pptx'}
                onChange={() => setFormat('pptx')}
              />
              PPTX
            </label>
          </div>
        </fieldset>

        {format === 'png' && (
          <fieldset style={{ border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: 10 }}>
            <legend style={{ padding: '0 6px' }}>PNG options</legend>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                Scale
                <select
                  value={pngScale}
                  onChange={(e) => setPngScale(Number(e.target.value))}
                  data-autofocus="true"
                >
                  <option value={1}>1×</option>
                  <option value={2}>2×</option>
                  <option value={3}>3×</option>
                  <option value={4}>4×</option>
                </select>
              </label>

              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                Background
                <select value={pngBackground} onChange={(e) => setPngBackground(e.target.value as any)}>
                  <option value="white">White</option>
                  <option value="transparent">Transparent</option>
                </select>
              </label>
            </div>
          </fieldset>
        )}

        {format === 'pptx' && (
          <fieldset style={{ border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: 10 }}>
            <legend style={{ padding: '0 6px' }}>PPTX options</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                Layout
                <select
                  value={pptxOptions.layout}
                  onChange={(e) => setPptxOptions((p) => ({ ...p, layout: e.target.value as any }))}
                  data-autofocus="true"
                >
                  <option value="wide">Wide</option>
                  <option value="standard">Standard</option>
                </select>
              </label>

              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                Theme
                <select
                  value={pptxOptions.theme}
                  onChange={(e) => setPptxOptions((p) => ({ ...p, theme: e.target.value as any }))}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>

              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={pptxOptions.includeTitleSlide}
                  onChange={(e) => setPptxOptions((p) => ({ ...p, includeTitleSlide: e.target.checked }))}
                />
                Title slide
              </label>

              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={pptxOptions.includeNotes}
                  onChange={(e) => setPptxOptions((p) => ({ ...p, includeNotes: e.target.checked }))}
                />
                Notes
              </label>

              <label style={{ display: 'flex', gap: 6, alignItems: 'center', gridColumn: '1 / span 2' }}>
                <input
                  type="checkbox"
                  checked={(pptxOptions.diagramMode ?? 'image') === 'shapes'}
                  onChange={(e) => setPptxOptions((p) => ({ ...p, diagramMode: e.target.checked ? 'shapes' : 'image' }))}
                />
                Editable shapes/connectors (experimental)
              </label>

              <label style={{ display: 'flex', gap: 6, alignItems: 'center', gridColumn: '1 / span 2' }}>
                Footer
                <input
                  type="text"
                  value={pptxOptions.footerText ?? ''}
                  placeholder="Optional footer text"
                  onChange={(e) => setPptxOptions((p) => ({ ...p, footerText: e.target.value || undefined }))}
                  style={{ flex: 1 }}
                />
              </label>
            </div>
          </fieldset>
        )}

        {status && <div style={{ opacity: 0.85 }}>{status}</div>}
      </div>
    </Dialog>
  );
}
