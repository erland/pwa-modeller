import { PortalElementLayout } from './element/PortalElementLayout';
import type { PortalElementPageProps } from './element/usePortalElementPageState';
import { usePortalElementPageState } from './element/usePortalElementPageState';

export default function PortalElementPage(props: PortalElementPageProps) {
  const s = usePortalElementPageState(props);
  const data = s.data;

  const missingIdHint =
    s.mode === 'externalId'
      ? `No match for externalId ${s.params.externalId ? String(s.params.externalId) : ''}.`
      : `No match for id ${s.params.id ? String(s.params.id) : ''}.`;

  return (
    <PortalElementLayout
      shellBodyRef={s.shellBodyRef}
      shellBodyStyle={s.shellBodyStyle}
      isResizing={s.isResizing}
      setIsResizing={s.setIsResizing}
      leftDocked={s.leftDocked}
      datasetTitle={s.datasetMeta?.title?.trim() || ''}
      status={s.status}
      treeData={s.treeData}
      selectedNodeId={s.selectedNodeId}
      expandedNodeIds={s.expandedNodeIds}
      onExpandedNodeIdsChange={s.setExpandedNodeIds}
      onActivateNode={s.onActivateNode}
      leftOpen={s.leftOpen}
      setLeftOpen={s.setLeftOpen}
      onResetLeftWidth={() => s.setLeftWidth(s.DEFAULT_LEFT_WIDTH)}
      hasDataset={Boolean(s.datasetMeta)}
      isLoading={!s.datasetMeta ? false : !s.model || !s.indexes}
      resolvedElementId={s.resolvedElementId}
      missingIdHint={missingIdHint}
      hasData={Boolean(data)}
      elementDisplayName={s.elementDisplayName}
      elementType={s.elementType}
      elementKind={s.elementKind}
      elementLayer={s.elementLayer}
      internalLink={s.internalLink}
      bestExternalIdKey={s.bestExternalIdKey}
      externalLink={s.externalLink}
      copied={s.copied}
      onCopy={s.onCopy}
      umlMembers={s.umlMembers}
      relations={data?.relations}
      usedInViews={data?.usedInViews}
      documentation={data?.element?.documentation}
      taggedValues={data?.element?.taggedValues}
      attrs={data?.element?.attrs}
      elementId={data?.elementId ?? ''}
      externalIdKeys={data?.externalIdKeys ?? []}
      showBackdrop={s.showBackdrop}
      onBackdropClick={() => s.setLeftOpen(false)}
    />
  );
}
