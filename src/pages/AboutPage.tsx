import { AppShell } from '../components/shell/AppShell';

export default function AboutPage() {
  return (
    <AppShell title="PWA Modeller" subtitle="Enterprise Architecture Modeling PWA (ArchiMate® 3.2)">
      <div className="about">
        <h1 className="workspaceTitle">About</h1>
        <p>
          This is a minimal EA modelling tool scaffold. The goal is to gradually add model lifecycle actions,
          element/relationship management, and a diagram editor aligned with ArchiMate® 3.2.
        </p>
        <section className="aboutSection">
          <h2 className="aboutHeading">What’s in this version</h2>
          <ul>
            <li>Application shell (header + placeholders for panels)</li>
            <li>Routing between workspace and about pages</li>
            <li>Responsive layout for desktop/tablet</li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
