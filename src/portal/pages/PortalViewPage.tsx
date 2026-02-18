import { PortalViewLayout } from './view/PortalViewLayout';
import { usePortalViewPageState } from './view/usePortalViewPageState';

export default function PortalViewPage() {
  const s = usePortalViewPageState();

  return (
    <PortalViewLayout
      shellBodyRef={s.shellBodyRef}
      shellBodyStyle={s.shellBodyStyle}
      isResizing={s.isResizing}
      setIsResizing={s.setIsResizing}
      datasetTitle={s.datasetMeta?.title?.trim() || ''}
      status={s.status}
      treeData={s.treeData}
      selectedNodeId={s.preferredSelectedNodeId}
      expandedNodeIds={s.expandedNodeIds}
      onExpandedNodeIdsChange={s.setExpandedNodeIds}
      onActivateNode={s.onActivateNode}
      activeViewId={s.viewId}
      leftOpen={s.leftOpen}
      setLeftOpen={s.setLeftOpen}
      rightOpen={s.rightOpen}
      setRightOpen={s.setRightOpen}
      leftDocked={s.leftDocked}
      rightDocked={s.rightDocked}
      isSmall={s.isSmall}
      onResetLeftWidth={() => s.setLeftWidth(s.DEFAULT_LEFT_WIDTH)}
      onResetRightWidth={() => s.setRightWidth(s.DEFAULT_RIGHT_WIDTH)}
      viewId={s.viewId}
      view={s.view}
      model={s.model}
      indexes={s.indexes}
      selection={s.selection}
      onSelectionChange={s.onSelectionChange}
      onOpenFactSheet={(elementId) => s.navigate(`/portal/e/${encodeURIComponent(elementId)}`)}
      showBackdrop={s.showBackdrop}
      onBackdropClick={() => {
        if (s.isSmall) {
          s.setLeftOpen(false);
          s.setRightOpen(false);
          return;
        }
        if (s.rightOverlay) {
          s.setRightOpen(false);
        }
      }}
    />
  );
}
