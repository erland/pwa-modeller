import { ReactNode, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import '../../styles/shell.css';
import { useModelStore } from '../../store';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

type AppShellProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  leftSidebar?: ReactNode;
  rightSidebar?: ReactNode;
  children: ReactNode;
};

function TopNavLink({ to, label, confirmNavigate }: { to: string; label: string; confirmNavigate?: () => boolean }) {
  const location = useLocation();
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        ['shellNavLink', isActive ? 'isActive' : null].filter(Boolean).join(' ')
      }
      end={to === '/'}
      onClick={(e) => {
        if (!confirmNavigate) return;
        // Only confirm if we're actually leaving the current route.
        if (location.pathname === to) return;
        const ok = confirmNavigate();
        if (!ok) e.preventDefault();
      }}
    >
      {label}
    </NavLink>
  );
}

export function AppShell({ title, subtitle, actions, leftSidebar, rightSidebar, children }: AppShellProps) {
  const hasLeft = Boolean(leftSidebar);
  const hasRight = Boolean(rightSidebar);

  const { isDirty, model } = useModelStore((s) => ({ isDirty: s.isDirty, model: s.model }));
  const online = useOnlineStatus();

  const confirmNavigate = useMemo(() => {
    return () => {
      if (!isDirty) return true;
      return window.confirm('You have unsaved changes. Leave this page?');
    };
  }, [isDirty]);

  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  const showBackdrop = leftOpen || rightOpen;

  return (
    <div className="shell">
      <header className="shellHeader" data-testid="app-header">
        <div className="shellBrand" aria-label="Application">
          <div className="shellTitle">{title}</div>
          {subtitle ? <div className="shellSubtitle">{subtitle}</div> : null}
        </div>

        <nav className="shellNav" aria-label="Primary navigation" data-testid="app-nav">
          <TopNavLink to="/" label="Workspace" confirmNavigate={confirmNavigate} />
          <TopNavLink to="/about" label="About" confirmNavigate={confirmNavigate} />
        </nav>

        <div className="shellActions" aria-label="Actions">
          <div className="shellStatus" aria-label="Status">
            {!online ? <span className="shellStatusChip isOffline">Offline</span> : null}
            {model && isDirty ? <span className="shellStatusChip isDirty">Unsaved</span> : null}
          </div>
          {actions ?? (
            <>
              <button type="button" className="shellButton" disabled title="Coming in later steps">
                New
              </button>
              <button type="button" className="shellButton" disabled title="Coming in later steps">
                Open
              </button>
              <button type="button" className="shellButton" disabled title="Coming in later steps">
                Save
              </button>
            </>
          )}

          {hasLeft ? (
            <button
              type="button"
              className="shellIconButton shellOnlySmall"
              aria-label="Toggle model navigator"
              onClick={() => {
                setLeftOpen((v) => !v);
                setRightOpen(false);
              }}
            >
              ☰
            </button>
          ) : null}

          {hasRight ? (
            <button
              type="button"
              className="shellIconButton shellOnlySmall"
              aria-label="Toggle properties panel"
              onClick={() => {
                setRightOpen((v) => !v);
                setLeftOpen(false);
              }}
            >
              ⚙
            </button>
          ) : null}
        </div>
      </header>

      <div className="shellBody">
        {hasLeft ? (
          <aside
            className={[
              'shellSidebar',
              'shellSidebarLeft',
              leftOpen ? 'isOpen' : null
            ]
              .filter(Boolean)
              .join(' ')}
            data-testid="left-sidebar"
            aria-label="Model navigator"
          >
            <div className="shellSidebarHeader">
              <div className="shellSidebarTitle">Model</div>
              <button
                type="button"
                className="shellIconButton shellOnlySmall"
                aria-label="Close model navigator"
                onClick={() => setLeftOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="shellSidebarContent">{leftSidebar}</div>
          </aside>
        ) : null}

        <main className="shellMain" data-testid="main-content">
          {children}
        </main>

        {hasRight ? (
          <aside
            className={['shellSidebar', 'shellSidebarRight', rightOpen ? 'isOpen' : null]
              .filter(Boolean)
              .join(' ')}
            data-testid="right-sidebar"
            aria-label="Properties panel"
          >
            <div className="shellSidebarHeader">
              <div className="shellSidebarTitle">Properties</div>
              <button
                type="button"
                className="shellIconButton shellOnlySmall"
                aria-label="Close properties panel"
                onClick={() => setRightOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="shellSidebarContent">{rightSidebar}</div>
          </aside>
        ) : null}

        {showBackdrop ? (
          <div
            className="shellBackdrop shellOnlySmall"
            aria-hidden="true"
            onClick={() => {
              setLeftOpen(false);
              setRightOpen(false);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
