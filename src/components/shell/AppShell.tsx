import { ReactNode, useState } from 'react';
import { NavLink } from 'react-router-dom';

import '../../styles/shell.css';

type AppShellProps = {
  title: string;
  subtitle?: string;
  leftSidebar?: ReactNode;
  rightSidebar?: ReactNode;
  children: ReactNode;
};

function TopNavLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        ['shellNavLink', isActive ? 'isActive' : null].filter(Boolean).join(' ')
      }
      end={to === '/'}
    >
      {label}
    </NavLink>
  );
}

export function AppShell({ title, subtitle, leftSidebar, rightSidebar, children }: AppShellProps) {
  const hasLeft = Boolean(leftSidebar);
  const hasRight = Boolean(rightSidebar);

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
          <TopNavLink to="/" label="Workspace" />
          <TopNavLink to="/about" label="About" />
        </nav>

        <div className="shellActions" aria-label="Actions">
          <button type="button" className="shellButton" disabled title="Coming in later steps">
            New
          </button>
          <button type="button" className="shellButton" disabled title="Coming in later steps">
            Open
          </button>
          <button type="button" className="shellButton" disabled title="Coming in later steps">
            Save
          </button>

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
