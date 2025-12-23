import './styles/app.css';

import { createElement, createRelationship, createView } from './domain/factories';
import { useModelStore } from './store/hooks';
import { modelStore } from './store/modelStore';

export default function App() {
  const model = useModelStore(s => s.model);

  const onNewModel = () => {
    modelStore.createEmptyModel({ name: 'My Model' });
  };

  const onAddSampleElement = () => {
    if (!model) return;
    const el = createElement({
      name: `Element ${Object.keys(model.elements).length + 1}`,
      layer: 'Business',
      type: 'BusinessActor'
    });
    modelStore.addElement(el);
  };

  const onAddSampleRelationship = () => {
    if (!model) return;
    const ids = Object.keys(model.elements);
    if (ids.length < 2) return;
    const rel = createRelationship({
      sourceElementId: ids[0],
      targetElementId: ids[1],
      type: 'Association'
    });
    modelStore.addRelationship(rel);
  };

  const onAddSampleView = () => {
    if (!model) return;
    const view = createView({ name: `View ${Object.keys(model.views).length + 1}`, viewpointId: 'layered' });
    modelStore.addView(view);
  };

  return (
    <div className="app">
      <header className="appHeader">
        <h1 className="appTitle">Hello, EA Tool</h1>
        <p className="appSubtitle">Enterprise Architecture Modeling PWA (ArchiMate® 3.2)</p>
      </header>

      <main className="appMain">
        <p>This is the project skeleton. Step 3 adds a basic in-memory model store + persistence helpers.</p>

        <section className="appSection">
          <h2>Debug panel (store)</h2>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button type="button" onClick={onNewModel}>
              New model
            </button>
            <button type="button" onClick={onAddSampleElement} disabled={!model}>
              Add sample element
            </button>
            <button type="button" onClick={onAddSampleRelationship} disabled={!model || Object.keys(model.elements).length < 2}>
              Add sample relationship
            </button>
            <button type="button" onClick={onAddSampleView} disabled={!model}>
              Add sample view
            </button>
          </div>

          <pre style={{ maxHeight: 420, overflow: 'auto', background: '#111', color: '#eee', padding: 12 }}>
            {model ? JSON.stringify(model, null, 2) : 'No model loaded'}
          </pre>
        </section>
      </main>
    </div>
  );
}
