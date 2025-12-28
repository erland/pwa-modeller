import { ReactNode, useEffect, useMemo, useState } from 'react';
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

function TopNavLink({ to, label, confirmNavigate, className }: { to: string; label: string; confirmNavigate?: () => boolean; className?: string }) {
  const location = useLocation();
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        ['shellNavLink', className ?? null, isActive ? 'isActive' : null].filter(Boolean).join(' ')
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

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();

    // NOTE: TypeScript's DOM lib assumes `addEventListener` exists on MediaQueryList,
    // which makes feature checks like `'addEventListener' in mql` narrow the else
    // branch to `never`. Use an `any`-based feature check so we can still support
    // older Safari/iOS versions that only have `addListener/removeListener`.
    const anyMql = mql as any;
    if (typeof anyMql.addEventListener === 'function') {
      anyMql.addEventListener('change', onChange);
      return () => anyMql.removeEventListener('change', onChange);
    }

    // Safari < 14
    if (typeof anyMql.addListener === 'function') {
      // eslint-disable-next-line deprecation/deprecation
      anyMql.addListener(onChange);
      // eslint-disable-next-line deprecation/deprecation
      return () => anyMql.removeListener(onChange);
    }

    return;
  }, [query]);

  return matches;
}

export function AppShell({ title, subtitle, actions, leftSidebar, rightSidebar, children }: AppShellProps) {
  const hasLeft = Boolean(leftSidebar);
  const hasRight = Boolean(rightSidebar);

  const isSmall = useMediaQuery('(max-width: 720px)');
  const isMedium = useMediaQuery('(max-width: 1100px)');
  const rightOverlay = !isSmall && isMedium;

  const { isDirty, model } = useModelStore((s) => ({ isDirty: s.isDirty, model: s.model }));
  const online = useOnlineStatus();

  const confirmNavigate = useMemo(() => {
    return () => {
      if (!isDirty) return true;
      return window.confirm('You have unsaved changes. Leave this page?');
    };
  }, [isDirty]);

  const [leftOpen, setLeftOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth > 720;
  });
  const [rightOpen, setRightOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    const w = window.innerWidth;
    return w > 1100;
  });

  // When entering small screens, close overlays by default.
  useEffect(() => {
    if (isSmall) {
      setLeftOpen(false);
      setRightOpen(false);
    }
  }, [isSmall]);

  // On medium screens, prefer hiding the properties panel by default.
  useEffect(() => {
    if (!isSmall && isMedium) {
      setRightOpen(false);
    }
  }, [isSmall, isMedium]);

  const showBackdrop = (isSmall && (leftOpen || rightOpen)) || (rightOverlay && rightOpen);

  return (
    <div className="shell">
      <header className="shellHeader" data-testid="app-header">
        <div className="shellBrand" aria-label="Application">
          <div className="shellTitle">{title}</div>
          {subtitle ? <div className="shellSubtitle">{subtitle}</div> : null}
        </div>

        <nav className="shellNav" aria-label="Primary navigation" data-testid="app-nav">
          <TopNavLink to="/" label="Workspace" confirmNavigate={confirmNavigate} />
          <TopNavLink to="/about" label="About" className="shellNavLinkAbout" confirmNavigate={confirmNavigate} />
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
              className="shellIconButton"
              aria-label="Toggle model navigator"
              onClick={() => {
                setLeftOpen((v) => !v);
                if (isSmall) setRightOpen(false);
              }}
            >
              ☰
            </button>
          ) : null}

          {hasRight ? (
            <button
              type="button"
              className="shellIconButton"
              aria-label="Toggle properties panel"
              onClick={() => {
                setRightOpen((v) => !v);
                if (isSmall) setLeftOpen(false);
              }}
            >
              ⚙
            </button>
          ) : null}
        </div>
      </header>

      <div
        className={[
          'shellBody',
          hasLeft && leftOpen && !isSmall ? 'isLeftDockedOpen' : null,
          hasRight && rightOpen && !isSmall && !isMedium ? 'isRightDockedOpen' : null
        ]
          .filter(Boolean)
          .join(' ')}
      >
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
                className="shellIconButton"
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
                className="shellIconButton"
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
            className="shellBackdrop"
            aria-hidden="true"
            onClick={() => {
              if (isSmall) {
                setLeftOpen(false);
                setRightOpen(false);
                return;
              }
              // Medium screens: backdrop is used for the right overlay panel only.
              if (rightOverlay) {
                setRightOpen(false);
              }
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
