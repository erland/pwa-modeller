import { Dialog } from '../../dialog/Dialog';

import { SandboxInsertContextRow } from './sandboxInsert/SandboxInsertContextRow';
import { SandboxInsertFiltersDetails } from './sandboxInsert/SandboxInsertFiltersDetails';
import { SandboxInsertPreviewPanel } from './sandboxInsert/SandboxInsertPreviewPanel';
import { useSandboxInsertDialogState, type SandboxInsertDialogProps } from './sandboxInsert/useSandboxInsertDialogState';

export function SandboxInsertDialog(props: SandboxInsertDialogProps) {
  const vm = useSandboxInsertDialogState(props);

  return (
    <Dialog
      title={vm.title}
      isOpen={vm.isOpen}
      onClose={vm.onCancel}
      footer={
        <>
          <button type="button" className="shellButton" onClick={vm.onCancel}>
            Cancel
          </button>
          <button type="button" className="shellButton" disabled={!vm.canInsert} onClick={vm.onConfirmClick}>
            {props.kind === 'related' ? 'Add selected' : 'Insert selected'}
          </button>
        </>
      }
    >
      <div className="formGrid">
        {props.kind === 'intermediates' ? (
          <SandboxInsertContextRow
            kind="intermediates"
            model={vm.model}
            sourceElementId={props.sourceElementId}
            targetElementId={props.targetElementId}
            contextLabel={props.contextLabel}
            contextRelationshipType={props.contextRelationshipType}
          />
        ) : (
          <SandboxInsertContextRow kind="related" model={vm.model} anchorElementIds={props.anchorElementIds} />
        )}

        <SandboxInsertFiltersDetails
          kind={props.kind}
          allElementTypes={vm.allElementTypesForModel}
          enabledElementTypes={vm.enabledElementTypes}
          setEnabledElementTypes={vm.setEnabledElementTypes}
          relationshipTypes={vm.relationshipTypesForDialog}
          enabledRelationshipTypes={vm.enabledTypes}
          setEnabledRelationshipTypes={vm.setEnabledTypes}
          mode={vm.mode}
          setMode={vm.setMode}
          k={vm.k}
          setK={vm.setK}
          maxHops={vm.maxHops}
          setMaxHops={vm.setMaxHops}
          depth={vm.depth}
          setDepth={vm.setDepth}
          direction={vm.direction}
          setDirection={vm.setDirection}
        />
      </div>

      <SandboxInsertPreviewPanel
        model={vm.model}
        error={vm.error}
        preview={vm.preview}
        search={vm.search}
        setSearch={vm.setSearch}
        existingSet={vm.existingSet}
        selectedIds={vm.selectedIds}
        toggleSelectedId={vm.toggleSelectedId}
        visibleCandidateIds={vm.visibleCandidateIds}
        candidateById={vm.candidateById}
        candidatesCount={vm.candidatesCount}
        selectedCount={vm.selectedCount}
        selectedVisibleCount={vm.selectedVisibleCount}
        selectedNewCount={vm.selectedNewCount}
        maxNewNodes={vm.maxNewNodes}
        selectAllVisible={vm.selectAllVisible}
        clearVisible={vm.clearVisible}
        selectNone={vm.selectNone}
      />
    </Dialog>
  );
}
