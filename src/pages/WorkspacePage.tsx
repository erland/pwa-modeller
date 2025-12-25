import { useEffect, useState } from 'react';

import { ModelActions } from '../components/model/ModelActions';
import { ModelNavigator } from '../components/model/ModelNavigator';
import { ModelPropertiesDialog } from '../components/model/ModelPropertiesDialog';
import { PropertiesPanel } from '../components/model/PropertiesPanel';
import { noSelection, type Selection } from '../components/model/selection';
import { DiagramCanvas } from '../components/diagram/DiagramCanvas';
import { ReportsWorkspace } from '../components/reports/ReportsWorkspace';
import { ValidationWorkspace } from '../components/validation/ValidationWorkspace';
import { AppShell } from '../components/shell/AppShell';
import { modelStore } from '../store';
import { useModelStore } from '../store/useModelStore';

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  return false;
}

function WorkspaceMainPlaceholder({
  selection,
  mainTab,
  onChangeTab,
  onSelect
}: {
  selection: Selection;
  mainTab: 'diagram' | 'reports' | 'validation';
  onChangeTab: (tab: 'diagram' | 'reports' | 'validation') => void;
  onSelect: (sel: Selection) => void;
}) {
  return (
    <div className="workspace">
      <div className="workspaceHeader">
        <h1 className="workspaceTitle">Model workspace</h1>
        <div className="workspaceTabs" role="tablist" aria-label="Workspace tabs">
          <button
            type="button"
            className={`tabButton ${mainTab === 'diagram' ? 'isActive' : ''}`}
            role="tab"
            aria-selected={mainTab === 'diagram'}
            onClick={() => onChangeTab('diagram')}
          >
            Diagram
          </button>
          <button
            type="button"
            className={`tabButton ${mainTab === 'reports' ? 'isActive' : ''}`}
            role="tab"
            aria-selected={mainTab === 'reports'}
            onClick={() => onChangeTab('reports')}
          >
            Reports
          </button>
          <button
            type="button"
            className={`tabButton ${mainTab === 'validation' ? 'isActive' : ''}`}
            role="tab"
            aria-selected={mainTab === 'validation'}
            onClick={() => onChangeTab('validation')}
          >
            Validation
          </button>
        </div>
      </div>

      {mainTab === 'diagram' ? (
        <div className="modelWorkspaceCanvas" aria-label="Diagram area">
          <DiagramCanvas selection={selection} onSelect={onSelect} />
        </div>
      ) : mainTab === 'reports' ? (
        <ReportsWorkspace />
      ) : (
        <ValidationWorkspace onSelect={onSelect} onGoToDiagram={() => onChangeTab('diagram')} />
      )}
    </div>
  );
}

export default function WorkspacePage() {
  const [selection, setSelection] = useState<Selection>(noSelection);
  const [modelPropsOpen, setModelPropsOpen] = useState(false);
  const [mainTab, setMainTab] = useState<'diagram' | 'reports' | 'validation'>('diagram');
  const model = useModelStore((s) => s.model);

  // Step 13: basic keyboard shortcuts
  useEffect(() => {
    function requestSave() {
      window.dispatchEvent(new CustomEvent('pwa-modeller:request-save'));
    }

    function deleteSelection() {
      if (!model) return;
      switch (selection.kind) {
        case 'viewNode':
          modelStore.removeElementFromView(selection.viewId, selection.elementId);
          setSelection({ kind: 'view', viewId: selection.viewId });
          return;
        case 'relationship': {
          const ok = window.confirm('Delete this relationship?');
          if (ok) {
            modelStore.deleteRelationship(selection.relationshipId);
            setSelection(noSelection);
          }
          return;
        }
        case 'element': {
          const ok = window.confirm('Delete this element? Relationships referencing it will also be removed.');
          if (ok) {
            modelStore.deleteElement(selection.elementId);
            setSelection(noSelection);
          }
          return;
        }
        case 'view': {
          const ok = window.confirm('Delete this view?');
          if (ok) {
            modelStore.deleteView(selection.viewId);
            setSelection(noSelection);
          }
          return;
        }
        default:
          return;
      }
    }

    function onKeyDown(ev: KeyboardEvent) {
      // Save: Ctrl+S / Cmd+S
      const key = ev.key.toLowerCase();
      if ((ev.metaKey || ev.ctrlKey) && key === 's') {
        ev.preventDefault();
        requestSave();
        return;
      }

      // Delete: Delete / Backspace
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        // Allow Delete to remove the selected entity even if focus is in a text field,
        // but keep Backspace for normal text editing.
        if (ev.key === 'Backspace' && isEditableTarget(ev.target)) return;
        deleteSelection();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [model, selection]);

  return (
    <>
      <AppShell
        title="PWA Modeller"
        subtitle="Enterprise Architecture Modeling PWA (ArchiMate® 3.2)"
        actions={<ModelActions onEditModelProps={() => setModelPropsOpen(true)} />}
        leftSidebar={<ModelNavigator selection={selection} onSelect={setSelection} />}
        rightSidebar={
          <PropertiesPanel
            selection={selection}
            onSelect={setSelection}
            onEditModelProps={() => setModelPropsOpen(true)}
          />
        }
      >
        <WorkspaceMainPlaceholder
          selection={selection}
          mainTab={mainTab}
          onChangeTab={setMainTab}
          onSelect={setSelection}
        />
      </AppShell>

      <ModelPropertiesDialog isOpen={modelPropsOpen} onClose={() => setModelPropsOpen(false)} />
    </>
  );
}
