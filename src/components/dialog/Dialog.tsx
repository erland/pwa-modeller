import { ReactNode, useEffect, useRef } from 'react';

import '../../styles/dialog.css';

type DialogProps = {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function Dialog({ title, isOpen, onClose, children, footer }: DialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);


  const dialogPanelRef = useRef<HTMLDivElement | null>(null);


  useEffect(() => {
    if (!isOpen) return;

    const root = dialogPanelRef.current;
    if (!root) return;

    const focusFirst = () => {
    // Prefer focusing inside the dialog body (not the close button in the header).
    const body = root.querySelector<HTMLElement>('.dialogBody') ?? root;

    // 1) Explicit opt-in marker (if a dialog wants to be precise).
    let el = body.querySelector<HTMLElement>('[data-autofocus="true"]') ?? null;

    // 2) First text-like control in the body.
    if (!el) {
    el = body.querySelector<HTMLElement>(
    'input:not([type]), input[type="text"], input[type="search"], input[type="url"], input[type="email"], textarea, select'
    );
    }

    // 3) Any focusable control (fallback).
    if (!el) {
    el = body.querySelector<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    }

    if (!el) return;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.disabled) return;
    }

    el.focus();

    // Optional but nice: select existing text so typing replaces it.
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    try {
    el.select();
    } catch {
    // ignore
    }
    }
    };

    // If focus is already inside the dialog on a form control, don't steal it.
    const active = document.activeElement as HTMLElement | null;
    if (active && root.contains(active) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) {
    return;
    }

    focusFirst();

    // One extra tick helps in browsers that restore focus to the click target after mounting the dialog.
    const t = window.setTimeout(() => {
    const activeNow = document.activeElement as HTMLElement | null;
    if (!activeNow || !root.contains(activeNow)) {
    focusFirst();
    }
    }, 0);

    return () => window.clearTimeout(t);
  }, [isOpen]);


  if (!isOpen) return null;

  return (
    <div
      className="dialogBackdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        // Click outside closes
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <div className="dialogPanel" ref={dialogPanelRef}>
        <div className="dialogHeader">
          <div className="dialogTitle">{title}</div>
          <button type="button" className="shellIconButton" aria-label="Close dialog" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="dialogBody">{children}</div>
        {footer ? <div className="dialogFooter">{footer}</div> : null}
      </div>
    </div>
  );
}
