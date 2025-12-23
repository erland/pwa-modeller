import { useState } from 'react';

import { ModelActions } from '../components/model/ModelActions';
import { ModelNavigator } from '../components/model/ModelNavigator';
import { ModelPropertiesDialog } from '../components/model/ModelPropertiesDialog';
import { PropertiesPanel } from '../components/model/PropertiesPanel';
import { noSelection, type Selection } from '../components/model/selection';
import { AppShell } from '../components/shell/AppShell';

function WorkspaceMainPlaceholder() {
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
        <WorkspaceMainPlaceholder />
      </AppShell>

      <ModelPropertiesDialog isOpen={modelPropsOpen} onClose={() => setModelPropsOpen(false)} />
    </>
  );
}
