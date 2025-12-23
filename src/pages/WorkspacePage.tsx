import { AppShell } from '../components/shell/AppShell';

function ModelNavigatorPlaceholder() {
  return (
    <div>
      <p className="panelHint">
        This is a placeholder for the model navigation tree (folders, elements, relationships, views).
      </p>
      <ul className="treeList" aria-label="Model tree placeholder">
        <li>
          <span className="treeNode">Model</span>
          <ul>
            <li>
              <span className="treeNode">Elements</span>
              <ul>
                <li className="treeLeaf">(none yet)</li>
              </ul>
            </li>
            <li>
              <span className="treeNode">Relationships</span>
              <ul>
                <li className="treeLeaf">(none yet)</li>
              </ul>
            </li>
            <li>
              <span className="treeNode">Views</span>
              <ul>
                <li className="treeLeaf">(none yet)</li>
              </ul>
            </li>
          </ul>
        </li>
      </ul>
    </div>
  );
}

function PropertiesPlaceholder() {
  return (
    <div>
      <p className="panelHint">
        This is a placeholder for the properties/details panel. In later steps it will show the selected element,
        relationship, view, or model metadata.
      </p>
      <div className="propertiesGrid" aria-label="Properties placeholder">
        <div className="propertiesRow">
          <div className="propertiesKey">Selection</div>
          <div className="propertiesValue">None</div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Type</div>
          <div className="propertiesValue">—</div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Name</div>
          <div className="propertiesValue">—</div>
        </div>
      </div>
    </div>
  );
}

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
  return (
    <AppShell
      title="PWA Modeller"
      subtitle="Enterprise Architecture Modeling PWA (ArchiMate® 3.2)"
      leftSidebar={<ModelNavigatorPlaceholder />}
      rightSidebar={<PropertiesPlaceholder />}
    >
      <WorkspaceMainPlaceholder />
    </AppShell>
  );
}
