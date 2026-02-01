import { Dialog } from '../../dialog/Dialog';

import { SandboxInsertRelationshipTypePicker } from './sandboxInsert/SandboxInsertRelationshipTypePicker';
import { SandboxInsertContextRow } from './sandboxInsert/SandboxInsertContextRow';
import { SandboxInsertSimpleOptions } from './sandboxInsert/SandboxInsertSimpleOptions';
import { SandboxInsertSimplePreview } from './sandboxInsert/SandboxInsertSimplePreview';
import { useSandboxInsertBetweenDialogState, type SandboxInsertBetweenDialogProps } from './sandboxInsert/useSandboxInsertBetweenDialogState';

export function SandboxInsertBetweenDialog(props: SandboxInsertBetweenDialogProps) {
  const vm = useSandboxInsertBetweenDialogState(props);

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
          <button type="button" className="shellButton" onClick={vm.computePreview}>
            Preview
          </button>
          <button type="button" className="shellButton" disabled={!vm.canInsert} onClick={vm.onConfirmClick}>
            Insert selected
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
          <SandboxInsertContextRow kind="related" model={vm.model} anchorElementIds={props.anchorElementIds} contextLabel={props.contextLabel} />
        )}

        <SandboxInsertSimpleOptions
          kind={props.kind}
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

        <SandboxInsertRelationshipTypePicker
          allTypes={vm.allRelationshipTypes}
          enabledTypes={vm.enabledTypes}
          setEnabledTypes={vm.setEnabledTypes}
          columns={2}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <SandboxInsertSimplePreview
          model={vm.model}
          preview={vm.preview}
          error={vm.error}
          existingSet={vm.existingSet}
          selectedIds={vm.selectedIds}
          setSelectedIds={vm.setSelectedIds}
        />
      </div>
    </Dialog>
  );
}
