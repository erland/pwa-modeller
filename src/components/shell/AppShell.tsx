import { ReactNode } from 'react';
import type { CSSProperties } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import '../../styles/shell.css';
import { RemoteDatasetConflictDialog } from './RemoteDatasetConflictDialog';
import { RemoteDatasetValidationErrorsDialog } from './RemoteDatasetValidationErrorsDialog';
import { LeaseConflictDialog } from './LeaseConflictDialog';
import { RemoteChangedDialog } from './RemoteChangedDialog';
import { RemoteOpsDiagnosticsDialog } from './RemoteOpsDiagnosticsDialog';

import { getDatasetRegistryEntry } from '../../store/datasetRegistry';
import { getLastAppliedRevision, getPendingOps, getServerRevision, isSseConnected } from '../../store/remoteDatasetSession';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useTheme } from '../../hooks/useTheme';
import { useAppInit } from '../../app/init/useAppInit';

import { usePersistenceDialogsController } from './usePersistenceDialogsController';
import { useShellLayoutController } from './useShellLayoutController';

type AppShellProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  leftSidebar?: ReactNode;
  rightSidebar?: ReactNode;
  children: ReactNode;
};

function TopNavLink({ to, label, className }: { to: string; label: string; className?: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        ['shellNavLink', className ?? null, isActive ? 'isActive' : null].filter(Boolean).join(' ')
      }
      end={to === '/'}
    >
      {label}
    </NavLink>
  );
}

export function AppShell({ title, subtitle, actions, leftSidebar, rightSidebar, children }: AppShellProps) {
  const navigate = useNavigate();
  const hasLeft = Boolean(leftSidebar);
  const hasRight = Boolean(rightSidebar);

  const layout = useShellLayoutController({ hasLeft, hasRight });
  const dialogs = usePersistenceDialogsController();

  useAppInit();

  const online = useOnlineStatus();
  const { theme, toggleTheme } = useTheme();

  return (
    <div
      className={
        ['shell', layout.isResizing ? 'isResizing' : null, layout.isNavigatorDragging ? 'isNavigatorDragging' : null]
          .filter(Boolean)
          .join(' ')
      }
    >
      <RemoteChangedDialog
        isOpen={!!dialogs.persistenceRemoteChanged}
        change={dialogs.persistenceRemoteChanged}
        onReloadFromServer={dialogs.onReloadFromServerAfterRemoteChanged}
        onKeepLocalChanges={dialogs.onKeepLocalChangesAfterRemoteChanged}
      />

      <LeaseConflictDialog
        isOpen={!!dialogs.persistenceLeaseConflict}
        conflict={dialogs.persistenceLeaseConflict}
        onOpenReadOnly={dialogs.onOpenReadOnlyAfterLeaseConflict}
        onRetry={() => void dialogs.onRetryLeaseAfterConflict()}
        onForceSave={dialogs.onForceSaveAfterLeaseConflict}
      />

      <RemoteDatasetValidationErrorsDialog
        isOpen={!!dialogs.persistenceValidationFailure}
        failure={dialogs.persistenceValidationFailure}
        onExportLocalSnapshot={dialogs.onExportLocalValidationSnapshot}
        onKeepPaused={dialogs.onKeepPausedAfterValidation}
        onResumeAutoSave={dialogs.onResumeAfterValidation}
      />

      <RemoteDatasetConflictDialog
        isOpen={!!dialogs.persistenceConflict}
        conflict={dialogs.persistenceConflict}
        onReloadFromServer={dialogs.onReloadFromServerAfterConflict}
        onExportLocalSnapshot={dialogs.onExportLocalConflictSnapshot}
        onKeepLocalChanges={dialogs.onKeepLocalChangesAfterConflict}
      />

      <RemoteOpsDiagnosticsDialog
        isOpen={dialogs.isRemoteOpsDiagOpen}
        datasetId={dialogs.activeDatasetId ?? null}
        onClose={() => dialogs.setIsRemoteOpsDiagOpen(false)}
      />

      <header className="shellHeader" data-testid="app-header">
        <div className="shellBrand" aria-label="Application">
          <div className="shellTitle">{title}</div>
          {subtitle ? <div className="shellSubtitle">{subtitle}</div> : null}
        </div>

        <nav className="shellNav" aria-label="Primary navigation" data-testid="app-nav">
          <TopNavLink to="/" label="Workspace" />
          <TopNavLink to="/analysis" label="Analysis" />
          <TopNavLink to="/overlay" label="Overlay" />
          <TopNavLink to="/about" label="About" className="shellNavLinkAbout" />
        </nav>

        <div className="shellActions" aria-label="Actions">
          <div className="shellStatus" aria-label="Status">
            {dialogs.model ? (
              <button
                type="button"
                className={
                  [
                    'shellStatusChip',
                    'shellStatusChipButton',
                    dialogs.overlayCount ? 'isOverlayActive' : null,
                    dialogs.overlayExportDirty ? 'isDirty' : null
                  ]
                    .filter(Boolean)
                    .join(' ')
                }
                aria-label="Open Overlay workspace"
                title={
                  dialogs.overlayCount
                    ? dialogs.overlayExportMarker
                      ? `Overlay entries: ${dialogs.overlayCount}. Last exported: ${dialogs.overlayExportMarker.exportedAt}. Click to open Overlay workspace.`
                      : `Overlay entries: ${dialogs.overlayCount}. Not exported as a file yet. Click to open Overlay workspace.`
                    : 'No overlay entries. Click to open Overlay workspace.'
                }
                onClick={() => navigate('/overlay')}
              >
                Overlay{dialogs.overlayCount ? ` ${dialogs.overlayCount}` : ''}
                {dialogs.overlayExportDirty ? ' *' : ''}
              </button>
            ) : null}

            {dialogs.persistenceStatus.status === 'error' ? (
              <span className="shellStatusChip isDirty" title={dialogs.persistenceStatus.message}>
                Storage error
              </span>
            ) : null}

            {!online ? <span className="shellStatusChip isOffline">Offline</span> : null}

            {dialogs.activeDatasetId
              ? (() => {
                  const entry = getDatasetRegistryEntry(dialogs.activeDatasetId);
                  const isRemote = entry?.storageKind === 'remote' || String(dialogs.activeDatasetId).startsWith('remote:');
                  if (!isRemote) return null;
                  const pending = getPendingOps(dialogs.activeDatasetId).length;
                  const sse = isSseConnected(dialogs.activeDatasetId);
                  const lastApplied = getLastAppliedRevision(dialogs.activeDatasetId);
                  const serverRev = getServerRevision(dialogs.activeDatasetId);
                  const title = [
                    'Remote ops sync (Phase 3)',
                    `SSE: ${sse ? 'connected' : 'disconnected'}`,
                    `Pending ops: ${pending}`,
                    `Last applied: ${lastApplied ?? '—'}`,
                    `Server revision: ${serverRev ?? '—'}`,
                    'Click for diagnostics'
                  ].join('\n');
                  return (
                    <button
                      type="button"
                      className={
                        ['shellStatusChip', 'shellStatusChipButton', sse ? null : 'isOffline', pending ? 'isDirty' : null]
                          .filter(Boolean)
                          .join(' ')
                      }
                      title={title}
                      aria-label="Open remote sync diagnostics"
                      onClick={() => dialogs.setIsRemoteOpsDiagOpen(true)}
                    >
                      Sync {sse ? 'Live' : 'Idle'}
                      {pending ? ` +${pending}` : ''}
                    </button>
                  );
                })()
              : null}

            {dialogs.model && dialogs.isDirty ? <span className="shellStatusChip isDirty">Unsaved</span> : null}
          </div>

          <button
            type="button"
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
                layout.setLeftOpen((v) => !v);
                if (layout.isSmall) layout.setRightOpen(false);
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
                layout.setRightOpen((v) => !v);
                if (layout.isSmall) layout.setLeftOpen(false);
              }}
            >
              ⚙
            </button>
          ) : null}
        </div>
      </header>

      <div
        ref={layout.shellBodyRef}
        style={
          {
            '--shellLeftWidth': `${Math.round(layout.leftWidth)}px`,
            '--shellRightWidth': `${Math.round(layout.rightWidth)}px`
          } as CSSProperties
        }
        className={
          [
            'shellBody',
            hasLeft && layout.leftOpen && !layout.isSmall ? 'isLeftDockedOpen' : null,
            hasRight && layout.rightOpen && !layout.isSmall && !layout.isMedium ? 'isRightDockedOpen' : null
          ]
            .filter(Boolean)
            .join(' ')
        }
      >
        {hasLeft ? (
          <aside
            className={['shellSidebar', 'shellSidebarLeft', layout.leftOpen ? 'isOpen' : null].filter(Boolean).join(' ')}
            data-testid="left-sidebar"
            aria-label="Model navigator"
          >
            <div className="shellSidebarHeader">
              <div className="shellSidebarTitle">Model</div>
              <button
                type="button"
                className="shellIconButton"
                aria-label="Close model navigator"
                onClick={() => layout.setLeftOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="shellSidebarContent">{leftSidebar}</div>
            {layout.leftDocked ? (
              <div
                className="shellResizer shellResizerLeft"
                role="separator"
                aria-label="Resize model navigator"
                title="Drag to resize (double-click to reset)"
                onDoubleClick={() => layout.setLeftWidth(layout.DEFAULT_LEFT_WIDTH)}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  layout.setIsResizing('left');
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
            className={['shellSidebar', 'shellSidebarRight', layout.rightOpen ? 'isOpen' : null].filter(Boolean).join(' ')}
            data-testid="right-sidebar"
            aria-label="Properties panel"
          >
            <div className="shellSidebarHeader">
              <div className="shellSidebarTitle">Properties</div>
              <button
                type="button"
                className="shellIconButton"
                aria-label="Close properties panel"
                onClick={() => layout.setRightOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="shellSidebarContent">{rightSidebar}</div>
            {layout.rightDocked ? (
              <div
                className="shellResizer shellResizerRight"
                role="separator"
                aria-label="Resize properties panel"
                title="Drag to resize (double-click to reset)"
                onDoubleClick={() => layout.setRightWidth(layout.DEFAULT_RIGHT_WIDTH)}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  layout.setIsResizing('right');
                }}
              />
            ) : null}
          </aside>
        ) : null}

        {layout.showBackdrop && !layout.isNavigatorDragging ? (
          <div
            className="shellBackdrop"
            aria-hidden="true"
            onClick={() => {
              if (layout.isSmall) {
                layout.setLeftOpen(false);
                layout.setRightOpen(false);
                return;
              }
              // Medium screens: backdrop is used for the right overlay panel only.
              if (layout.rightOverlay) {
                layout.setRightOpen(false);
              }
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
