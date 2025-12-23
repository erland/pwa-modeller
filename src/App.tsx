import './styles/app.css';

export default function App() {
  return (
    <div className="app">
      <header className="appHeader">
        <h1 className="appTitle">Hello, EA Tool</h1>
        <p className="appSubtitle">Enterprise Architecture Modeling PWA (ArchiMate® 3.2)</p>
      </header>

      <main className="appMain">
        <p>
          This is the project skeleton. Next steps will add the domain model, store, and the application shell.
        </p>

        <section className="appSection">
          <h2>Folders created</h2>
          <ul>
            <li><code>src/domain</code></li>
            <li><code>src/store</code></li>
            <li><code>src/components</code></li>
            <li><code>src/pages</code></li>
            <li><code>src/pwa</code></li>
          </ul>
        </section>
      </main>
    </div>
  );
}
