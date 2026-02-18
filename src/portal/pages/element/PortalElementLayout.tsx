import type { CSSProperties, RefObject } from 'react';
import type { Key } from '@react-types/shared';

import '../../../styles/shell.css';

import { PortalNavigationTree } from '../../components/PortalNavigationTree';
import { Card } from '../../components/factsheet/FactSheetPrimitives';
import { ElementFactSheetHeader } from '../../components/factsheet/ElementFactSheetHeader';
import { ElementSummaryCard } from '../../components/factsheet/ElementSummaryCard';
import { ElementUmlMembersCards } from '../../components/factsheet/ElementUmlMembersCards';
import { ElementRelationshipsCard } from '../../components/factsheet/ElementRelationshipsCard';
import { ElementUsedInViewsCard } from '../../components/factsheet/ElementUsedInViewsCard';
import { ElementIdentifiersCard } from '../../components/factsheet/ElementIdentifiersCard';
import { ElementOtherInfoCard } from '../../components/factsheet/ElementOtherInfoCard';
import type { NavNode } from '../../navigation/types';

type Props = {
  shellBodyRef: RefObject<HTMLDivElement>;
  shellBodyStyle: CSSProperties;
  isResizing: boolean;
  setIsResizing: (v: boolean) => void;
  leftDocked: boolean;

  datasetTitle: string;
  status: string;

  treeData: NavNode[];
  selectedNodeId: string | null;
  expandedNodeIds: Set<Key>;
  onExpandedNodeIdsChange: (v: Set<Key>) => void;
  onActivateNode: (node: NavNode) => void;

  leftOpen: boolean;
  setLeftOpen: (v: boolean | ((prev: boolean) => boolean)) => void;

  onResetLeftWidth: () => void;

  // fact sheet
  hasDataset: boolean;
  isLoading: boolean;
  resolvedElementId: string | null;
  missingIdHint: string | null;
  hasData: boolean;
  elementDisplayName: string;
  elementType: string;
  elementKind: any;
  elementLayer: any;
  internalLink: string;
  bestExternalIdKey: string;
  externalLink: string;
  copied: string | null;
  onCopy: (kind: string, value: string) => void;
  umlMembers: any;
  relations: any;
  usedInViews: any;
  documentation: any;
  taggedValues: any;
  attrs: any;
  elementId: string;
  externalIdKeys: string[];

  showBackdrop: boolean;
  onBackdropClick: () => void;
};

export function PortalElementLayout(props: Props) {
  const {
    shellBodyRef,
    shellBodyStyle,
    isResizing,
    setIsResizing,
    leftDocked,
    datasetTitle,
    status,
    treeData,
    selectedNodeId,
    expandedNodeIds,
    onExpandedNodeIdsChange,
    onActivateNode,
    leftOpen,
    setLeftOpen,
    onResetLeftWidth,
    hasDataset,
    isLoading,
    resolvedElementId,
    missingIdHint,
    hasData,
    elementDisplayName,
    elementType,
    elementKind,
    elementLayer,
    internalLink,
    bestExternalIdKey,
    externalLink,
    copied,
    onCopy,
    umlMembers,
    relations,
    usedInViews,
    documentation,
    taggedValues,
    attrs,
    elementId,
    externalIdKeys,
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
        className={['shellBody', leftDocked ? 'isLeftDockedOpen' : null].filter(Boolean).join(' ')}
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
            <button type="button" className="shellIconButton" aria-label="Close navigation" onClick={() => setLeftOpen(false)}>
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
                  activeViewId={undefined}
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
                setIsResizing(true);
              }}
            />
          ) : null}
        </aside>

        {/* Main */}
        <main className="shellMain" style={{ minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ marginTop: 0, marginBottom: 4 }}>Fact sheet</h2>
              <div style={{ opacity: 0.7 }}>
                {hasData ? `“${elementDisplayName}”` : resolvedElementId ? `“${resolvedElementId}”` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="shellIconButton"
                aria-label="Toggle navigation"
                onClick={() => setLeftOpen((v) => !v)}
                title={leftOpen ? 'Hide navigation' : 'Show navigation'}
              >
                ☰
              </button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            {hasData ? (
              <ElementFactSheetHeader
                elementDisplayName={elementDisplayName}
                elementType={elementType}
                elementKind={elementKind}
                elementLayer={elementLayer}
                internalLink={internalLink}
                bestExternalIdKey={bestExternalIdKey}
                externalLink={externalLink}
                copied={copied}
                onCopy={onCopy}
              />
            ) : null}

            {!hasDataset ? (
              <Card>
                <strong>No dataset loaded.</strong>
                <div style={{ marginTop: 6, opacity: 0.8 }}>
                  Use <em>Change dataset</em> in the top bar to point the portal to a hosted <code>latest.json</code>.
                </div>
              </Card>
            ) : isLoading ? (
              <Card>
                <strong>Dataset is loading…</strong>
              </Card>
            ) : !resolvedElementId ? (
              <Card>
                <strong>Element not found.</strong>
                {missingIdHint ? (
                  <div style={{ marginTop: 6, opacity: 0.85 }}>
                    {missingIdHint}
                  </div>
                ) : null}
              </Card>
            ) : !hasData ? (
              <Card>
                <strong>Element not found in model.</strong>
              </Card>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, alignItems: 'start' }}>
                {/* Main column */}
                <div style={{ display: 'grid', gap: 12 }}>
                  <ElementSummaryCard documentation={documentation} />
                  <ElementUmlMembersCards umlMembers={umlMembers} />
                  <ElementRelationshipsCard relations={relations} />
                  <ElementUsedInViewsCard usedInViews={usedInViews} />
                </div>

                {/* Sidebar */}
                <div style={{ display: 'grid', gap: 12 }}>
                  <ElementIdentifiersCard elementId={elementId} externalIdKeys={externalIdKeys} onCopy={onCopy} />
                  <ElementOtherInfoCard taggedValues={taggedValues} attrs={attrs} />
                </div>
              </div>
            )}
          </div>
        </main>

        {showBackdrop ? <div className="shellBackdrop" aria-hidden="true" onClick={onBackdropClick} /> : null}
      </div>
    </div>
  );
}
