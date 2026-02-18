import type { CSSProperties, RefObject } from 'react';
import { Link } from 'react-router-dom';
import type { Key } from '@react-types/shared';

import '../../../styles/shell.css';

import { PortalDiagramViewer } from '../../components/PortalDiagramViewer';
import { PortalInspectorPanel } from '../../components/PortalInspectorPanel';
import { PortalNavigationTree } from '../../components/PortalNavigationTree';
import type { NavNode } from '../../navigation/types';
import type { Selection } from '../../../components/model/selection';

type Props = {
  shellBodyRef: RefObject<HTMLDivElement>;
  shellBodyStyle: CSSProperties;
  isResizing: null | 'left' | 'right';
  setIsResizing: (v: null | 'left' | 'right') => void;

  datasetTitle: string;
  status: string;

  treeData: NavNode[];
  selectedNodeId: string | null;
  expandedNodeIds: Set<Key>;
  onExpandedNodeIdsChange: (v: Set<Key>) => void;
  onActivateNode: (node: NavNode) => void;
  activeViewId: string;

  leftOpen: boolean;
  setLeftOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  rightOpen: boolean;
  setRightOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  leftDocked: boolean;
  rightDocked: boolean;
  isSmall: boolean;
  onResetLeftWidth: () => void;
  onResetRightWidth: () => void;

  viewId: string;
  view: any | null;
  model: any | null;
  indexes: any;
  selection: Selection;
  onSelectionChange: (s: Selection) => void;

  onOpenFactSheet: (elementId: string) => void;

  showBackdrop: boolean;
  onBackdropClick: () => void;
};

export function PortalViewLayout(props: Props) {
  const {
    shellBodyRef,
    shellBodyStyle,
    isResizing,
    setIsResizing,
    datasetTitle,
    status,
    treeData,
    selectedNodeId,
    expandedNodeIds,
    onExpandedNodeIdsChange,
    onActivateNode,
    activeViewId,
    leftOpen,
    setLeftOpen,
    rightOpen,
    setRightOpen,
    leftDocked,
    rightDocked,
    isSmall,
    onResetLeftWidth,
    onResetRightWidth,
    viewId,
    view,
    model,
    indexes,
    selection,
    onSelectionChange,
    onOpenFactSheet,
    showBackdrop,
    onBackdropClick,
  } = props;

  return (
    <div
      className={['shell', isResizing ? 'isResizing' : null].filter(Boolean).join(' ')}
      style={{ width: '100%', minHeight: 0 }}
    >
      <div
        ref={shellBodyRef}
        style={shellBodyStyle}
        className={['shellBody', leftDocked ? 'isLeftDockedOpen' : null, rightDocked ? 'isRightDockedOpen' : null]
          .filter(Boolean)
          .join(' ')}
      >
        {/* Left: navigation */}
        <aside
          className={['shellSidebar', 'shellSidebarLeft', leftOpen ? 'isOpen' : null].filter(Boolean).join(' ')}
          aria-label="Portal navigation"
        >
          <div className="shellSidebarHeader">
            <div style={{ minWidth: 0 }}>
              <div className="shellSidebarTitle">Navigation</div>
              <div
                style={{
                  fontSize: 12,
                  opacity: 0.75,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {datasetTitle || (status === 'loading' ? 'Loading…' : 'No dataset loaded')}
              </div>
            </div>
            <button
              type="button"
              className="shellIconButton"
              aria-label="Close navigation"
              onClick={() => setLeftOpen(false)}
            >
              ✕
            </button>
          </div>
          <div className="shellSidebarContent" style={{ padding: 0 }}>
            <div className="navigator" style={{ border: 'none', background: 'transparent', height: '100%', minHeight: 0 }}>
              <div className="navTreeWrap" style={{ minHeight: 0 }}>
                <PortalNavigationTree
                  treeData={treeData}
                  selectedNodeId={selectedNodeId}
                  expandedNodeIds={expandedNodeIds}
                  onExpandedNodeIdsChange={onExpandedNodeIdsChange}
                  onActivateNode={onActivateNode}
                  activeViewId={activeViewId}
                  showFilter
                />
              </div>
            </div>
          </div>
          {leftDocked ? (
            <div
              className="shellResizer shellResizerLeft"
              role="separator"
              aria-label="Resize navigation"
              title="Drag to resize (double-click to reset)"
              onDoubleClick={() => onResetLeftWidth()}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture?.(e.pointerId);
                setIsResizing('left');
              }}
            />
          ) : null}
        </aside>

        {/* Main */}
        <main className="shellMain" style={{ minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ marginTop: 0, marginBottom: 4 }}>View</h2>
              <div style={{ opacity: 0.7 }}>{view ? `“${view.name}”` : viewId ? `“${viewId}”` : '(missing param)'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="shellIconButton"
                aria-label="Toggle navigation"
                onClick={() => {
                  setLeftOpen((v) => !v);
                  if (isSmall) setRightOpen(false);
                }}
                title={leftOpen ? 'Hide navigation' : 'Show navigation'}
              >
                ☰
              </button>
              <button
                type="button"
                className="shellIconButton"
                aria-label="Toggle inspector"
                onClick={() => {
                  setRightOpen((v) => !v);
                  if (isSmall) setLeftOpen(false);
                }}
                title={rightOpen ? 'Hide inspector' : 'Show inspector'}
              >
                ⚙
              </button>
            </div>
          </div>

          {!model ? (
            <div
              style={{
                padding: 12,
                border: '1px solid var(--borderColor, rgba(0,0,0,0.12))',
                borderRadius: 12,
              }}
            >
              <strong>{status === 'loading' ? 'Loading dataset…' : 'No dataset loaded.'}</strong>
              <div style={{ marginTop: 8, opacity: 0.85 }}>
                Go to the portal home to configure a <code>latest.json</code> URL, then return here.
              </div>
            </div>
          ) : !viewId ? (
            <div
              style={{
                padding: 12,
                border: '1px solid var(--borderColor, rgba(0,0,0,0.12))',
                borderRadius: 12,
              }}
            >
              <strong>Pick a view from the navigation tree.</strong>
            </div>
          ) : !view ? (
            <div
              style={{
                padding: 12,
                border: '1px solid var(--borderColor, rgba(0,0,0,0.12))',
                borderRadius: 12,
              }}
            >
              <strong>View not found.</strong>
              <div style={{ marginTop: 8, opacity: 0.85 }}>
                The dataset is loaded, but it does not contain a view with id <code>{viewId}</code>.
              </div>
            </div>
          ) : (
            <div style={{ minHeight: 0 }}>
              <div style={{ opacity: 0.8, marginBottom: 10 }}>
                <span style={{ fontWeight: 700 }}>{view.name}</span>
                <span style={{ marginLeft: 8 }}>·</span>
                <span style={{ marginLeft: 8, opacity: 0.75 }}>
                  Nodes: {(view.layout?.nodes?.length ?? 0)} · Connections: {(view.connections ?? []).length}
                </span>
              </div>

              <PortalDiagramViewer
                model={model}
                view={view}
                viewId={viewId}
                selection={selection}
                onSelectionChange={onSelectionChange}
              />
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <Link to="/portal">Back to portal home</Link>
          </div>
        </main>

        {/* Right: inspector */}
        <aside
          className={['shellSidebar', 'shellSidebarRight', rightOpen ? 'isOpen' : null].filter(Boolean).join(' ')}
          aria-label="Portal inspector"
        >
          <div className="shellSidebarHeader">
            <div className="shellSidebarTitle">Inspector</div>
            <button type="button" className="shellIconButton" aria-label="Close inspector" onClick={() => setRightOpen(false)}>
              ✕
            </button>
          </div>
          <div className="shellSidebarContent">
            {model ? (
              <PortalInspectorPanel
                model={model}
                selection={selection}
                indexes={indexes}
                onOpenFactSheet={(elementId) => {
                  // Keep left nav state as-is; switch the main workspace to the fact sheet.
                  onOpenFactSheet(elementId);
                }}
              />
            ) : null}
          </div>
          {rightDocked ? (
            <div
              className="shellResizer shellResizerRight"
              role="separator"
              aria-label="Resize inspector"
              title="Drag to resize (double-click to reset)"
              onDoubleClick={() => onResetRightWidth()}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture?.(e.pointerId);
                setIsResizing('right');
              }}
            />
          ) : null}
        </aside>

        {showBackdrop ? <div className="shellBackdrop" aria-hidden="true" onClick={onBackdropClick} /> : null}
      </div>
    </div>
  );
}
