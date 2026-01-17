import { useEffect, useMemo, useRef } from 'react';

export type QuickTooltipProps = {
  open: boolean;
  x: number;
  y: number;
  title: string;
  lines: string[];
  onClose: () => void;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * A small, dependency-free tooltip/popover used for quick inspection
 * when selecting items in analysis views.
 */
export function QuickTooltip({ open, x, y, title, lines, onClose }: QuickTooltipProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Auto-close after a short delay.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => onClose(), 8000);
    return () => window.clearTimeout(t);
  }, [open, onClose]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (ref.current && ref.current.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onMouseDown, true);
    return () => document.removeEventListener('mousedown', onMouseDown, true);
  }, [open, onClose]);

  const pos = useMemo(() => {
    // Best-effort clamping into viewport.
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
    const w = 360;
    const h = 180;
    const left = clamp(x + 12, 8, Math.max(8, vw - w - 8));
    const top = clamp(y + 12, 8, Math.max(8, vh - h - 8));
    return { left, top, width: w };
  }, [x, y]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="tooltip"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: pos.width,
        zIndex: 50,
        background: 'var(--panelBg, rgba(255,255,255,0.96))',
        border: '1px solid var(--borderColor, rgba(0,0,0,0.18))',
        borderRadius: 10,
        boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
        padding: '10px 12px',
        color: 'var(--textColor, rgba(0,0,0,0.9))'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 650, fontSize: 13, lineHeight: '16px' }}>{title || '(untitled)'}</div>
        <button
          type="button"
          className="miniLinkButton"
          onClick={onClose}
          aria-label="Close tooltip"
          style={{ padding: '0 6px', lineHeight: '16px' }}
        >
          ×
        </button>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, lineHeight: '16px' }}>
        {lines.filter(Boolean).map((l, idx) => (
          <div key={idx} style={{ marginTop: idx === 0 ? 0 : 4, whiteSpace: 'pre-wrap' }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
