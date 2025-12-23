import { useMemo, useState } from 'react';

import { ModelActions } from '../components/model/ModelActions';
import { ModelNavigator } from '../components/model/ModelNavigator';
import { ModelPalette } from '../components/model/ModelPalette';
import { ModelPropertiesDialog } from '../components/model/ModelPropertiesDialog';
import { PropertiesPanel } from '../components/model/PropertiesPanel';
import { noSelection, type Selection } from '../components/model/selection';
import { AppShell } from '../components/shell/AppShell';
import { VIEWPOINTS } from '../domain';
import { useModelStore } from '../store/useModelStore';

function WorkspaceMainPlaceholder({ selection }: { selection: Selection }) {
  const model = useModelStore((s) => s.model);
  const currentView = useMemo(() => {
    if (!model) return null;
    if (selection.kind === 'view') return model.views[selection.viewId] ?? null;
    // If a view exists, show the first one as context even if nothing is selected.
    return Object.values(model.views)[0] ?? null;
  }, [model, selection]);

  const currentViewpointTitle = useMemo(() => {
    if (!currentView) return null;
    return VIEWPOINTS.find((v) => v.id === currentView.viewpointId)?.title ?? currentView.viewpointId;
  }, [currentView]);

  return (
    <div className="workspace">
      <div className="workspaceHeader">
        <h1 className="workspaceTitle">Model workspace</h1>
        <div className="workspaceTabs" role="tablist" aria-label="Workspace tabs">
          <button type="button" className="tabButton isActive" role="tab" aria-selected="true">
            Diagram
          </button>
          <button type="button" className="tabButton" role="tab" aria-selected="false" disabled>
            Reports
          </button>
        </div>
      </div>

      <div className="canvasPlaceholder" aria-label="Diagram canvas placeholder">
        <div className="canvasPlaceholderInner">
          <p className="canvasTitle">Diagram canvas</p>
          {currentView ? (
            <p className="canvasHint" style={{ marginBottom: 10 }}>
              <strong>Current view:</strong> {currentView.name}
              {currentViewpointTitle ? ` — ${currentViewpointTitle}` : ''}
            </p>
          ) : (
            <p className="canvasHint" style={{ marginBottom: 10 }}>
              No views yet — create one from the <strong>Views</strong> tab in the palette.
            </p>
          )}
          <p className="canvasHint">
            In later steps this area will render the current view and allow creating/moving diagram nodes and
            relationships.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  const [selection, setSelection] = useState<Selection>(noSelection);
  const [modelPropsOpen, setModelPropsOpen] = useState(false);

  return (
    <>
      <AppShell
        title="PWA Modeller"
        subtitle="Enterprise Architecture Modeling PWA (ArchiMate® 3.2)"
        actions={<ModelActions onEditModelProps={() => setModelPropsOpen(true)} />}
        leftSidebar={<ModelNavigator selection={selection} onSelect={setSelection} />}
        rightSidebar={<PropertiesPanel selection={selection} onEditModelProps={() => setModelPropsOpen(true)} />}
      >
        <ModelPalette onSelect={setSelection} />
            <WorkspaceMainPlaceholder selection={selection} />
      </AppShell>

      <ModelPropertiesDialog isOpen={modelPropsOpen} onClose={() => setModelPropsOpen(false)} />
    </>
  );
}
