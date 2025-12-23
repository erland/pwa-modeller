import { ReactNode, useEffect } from 'react';

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
      <div className="dialogPanel">
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
