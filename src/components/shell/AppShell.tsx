import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import '../../styles/shell.css';
import { modelStore, useModelStore } from '../../store';
import { initRelationshipValidationMatrixFromBundledTable } from '../../domain/config/archimatePalette';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useTheme } from '../../hooks/useTheme';

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

  // Sidebar widths are driven by CSS variables in shell.css. We override them here so the user
  // can resize the docked sidebars. Values are persisted in localStorage.
  const DEFAULT_LEFT_WIDTH = 260;
  const DEFAULT_RIGHT_WIDTH = 320;
  const MIN_LEFT_WIDTH = 200;
  const MIN_RIGHT_WIDTH = 240;
  const MIN_MAIN_WIDTH = 360;

  const [leftWidth, setLeftWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_LEFT_WIDTH;
    const n = Number(window.localStorage.getItem('shellLeftWidthPx'));
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_LEFT_WIDTH;
  });

  const [rightWidth, setRightWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_RIGHT_WIDTH;
    const n = Number(window.localStorage.getItem('shellRightWidthPx'));
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_RIGHT_WIDTH;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('shellLeftWidthPx', String(Math.round(leftWidth)));
  }, [leftWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('shellRightWidthPx', String(Math.round(rightWidth)));
  }, [rightWidth]);

  const shellBodyRef = useRef<HTMLDivElement | null>(null);
  const [isResizing, setIsResizing] = useState<null | 'left' | 'right'>(null);
  const [isNavigatorDragging, setIsNavigatorDragging] = useState(false);
const { isDirty, model, relationshipValidationMode } = useModelStore((s) => ({
    isDirty: s.isDirty,
    model: s.model,
    relationshipValidationMode: s.relationshipValidationMode,
  }));

  useEffect(() => {
    if (relationshipValidationMode !== 'minimal') {
      void initRelationshipValidationMatrixFromBundledTable().catch(() => undefined);
    }
  }, [relationshipValidationMode]);
const online = useOnlineStatus();
  const { theme, toggleTheme } = useTheme();

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

  const leftDocked = hasLeft && leftOpen && !isSmall;
  const rightDocked = hasRight && rightOpen && !isSmall && !isMedium;

  useEffect(() => {
    if (!isResizing) return;

    const onMove = (ev: PointerEvent) => {
      const el = shellBodyRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();

      const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

      if (isResizing === 'left') {
        const rightW = rightDocked ? rightWidth : 0;
        const maxLeft = Math.max(MIN_LEFT_WIDTH, rect.width - rightW - MIN_MAIN_WIDTH);
        const next = clamp(ev.clientX - rect.left, MIN_LEFT_WIDTH, maxLeft);
        setLeftWidth(next);
      } else {
        const leftW = leftDocked ? leftWidth : 0;
        const maxRight = Math.max(MIN_RIGHT_WIDTH, rect.width - leftW - MIN_MAIN_WIDTH);
        const next = clamp(rect.right - ev.clientX, MIN_RIGHT_WIDTH, maxRight);
        setRightWidth(next);
      }
    };

    const onUp = () => setIsResizing(null);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isResizing, leftDocked, rightDocked, leftWidth, rightWidth]);

  // When entering small screens, close overlays by default.
  useEffect(() => {
    if (isSmall) {
      setLeftOpen(false);
      setRightOpen(false);
    }
  }, [isSmall]);

  // While dragging from the navigator on touch devices, temporarily relax overlay hit-testing
  // so the canvas can receive drop/pointer events.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onStart = () => setIsNavigatorDragging(true);
    const onEnd = () => setIsNavigatorDragging(false);

    window.addEventListener('modelNavigator:dragstart', onStart as any);
    window.addEventListener('modelNavigator:dragend', onEnd as any);

    // Safety: ensure we always clear the dragging flag.
    window.addEventListener('dragend', onEnd as any, true);
    window.addEventListener('drop', onEnd as any, true);

    return () => {
      window.removeEventListener('modelNavigator:dragstart', onStart as any);
      window.removeEventListener('modelNavigator:dragend', onEnd as any);
      window.removeEventListener('dragend', onEnd as any, true);
      window.removeEventListener('drop', onEnd as any, true);
    };
  }, []);


  // On medium screens, prefer hiding the properties panel by default.
  useEffect(() => {
    if (!isSmall && isMedium) {
      setRightOpen(false);
    }
  }, [isSmall, isMedium]);

  const showBackdrop = (isSmall && (leftOpen || rightOpen)) || (rightOverlay && rightOpen);

  return (
    <div className={['shell', isResizing ? 'isResizing' : null, isNavigatorDragging ? 'isNavigatorDragging' : null].filter(Boolean).join(' ')}>
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
          <label className="shellValidationMode" aria-label="Relationship validation mode" title="Välj valideringsnivå för relationer medan du modellerar">
            <span className="shellValidationModeLabel">Validering</span>
            <select
              className="shellSelect"
              value={relationshipValidationMode}
              onChange={(e) => modelStore.setRelationshipValidationMode(e.target.value as any)}
              aria-label="Valideringsnivå"
            >
              <option value="minimal">Minimal</option>
              <option value="full">Full</option>
              <option value="full_derived">Full inkl. härledda</option>
            </select>
          </label>

          <button type="button"
            className="shellIconButton"
            aria-label="Toggle theme"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>
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
        ref={shellBodyRef}
        style={
          {
            ['--shellLeftWidth' as any]: `${Math.round(leftWidth)}px`,
            ['--shellRightWidth' as any]: `${Math.round(rightWidth)}px`
          } as any
        }
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
            {leftDocked ? (
              <div
                className="shellResizer shellResizerLeft"
                role="separator"
                aria-label="Resize model navigator"
                title="Drag to resize (double-click to reset)"
                onDoubleClick={() => setLeftWidth(DEFAULT_LEFT_WIDTH)}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  (e.currentTarget as any).setPointerCapture?.(e.pointerId);
                  setIsResizing('left');
                }}
              />
            ) : null}
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
            {rightDocked ? (
              <div
                className="shellResizer shellResizerRight"
                role="separator"
                aria-label="Resize properties panel"
                title="Drag to resize (double-click to reset)"
                onDoubleClick={() => setRightWidth(DEFAULT_RIGHT_WIDTH)}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  (e.currentTarget as any).setPointerCapture?.(e.pointerId);
                  setIsResizing('right');
                }}
              />
            ) : null}
          </aside>
        ) : null}

        {showBackdrop && !isNavigatorDragging ? (
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
