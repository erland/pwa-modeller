import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import { useModelStore } from './store';
import { useUnsavedChangesGuard } from './hooks/useUnsavedChangesGuard';

import AboutPage from './pages/AboutPage';
import AnalysisPage from './pages/AnalysisPage';
import OverlayPage from './pages/OverlayPage';
import WorkspacePage from './pages/WorkspacePage';

import PublisherPage from './publisher/pages/PublisherPage';

import PortalShell from './portal/PortalShell';
import PortalElementPage from './portal/pages/PortalElementPage';
import PortalHomePage from './portal/pages/PortalHomePage';
import PortalViewPage from './portal/pages/PortalViewPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<WorkspacePage />} />
      <Route path="/analysis" element={<AnalysisPage />} />
      <Route path="/overlay" element={<OverlayPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/publisher" element={<PublisherPage />} />

      {/* Read-only portal (publisher/published dataset routes added in later steps) */}
      <Route path="/portal" element={<PortalShell />}>
        <Route index element={<PortalHomePage />} />
        <Route path="e/:id" element={<PortalElementPage mode="internalId" />} />
        <Route path="e/ext/:externalId" element={<PortalElementPage mode="externalId" />} />
        <Route path="v/:id" element={<PortalViewPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const isDirty = useModelStore((s) => s.isDirty);
  useUnsavedChangesGuard(isDirty, { markTitle: true });

  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
