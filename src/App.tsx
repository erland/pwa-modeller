import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useEffect, useState } from 'react';

import { useModelStore } from './store';
import { useUnsavedChangesGuard } from './hooks/useUnsavedChangesGuard';

import AboutPage from './pages/AboutPage';
import AnalysisPage from './pages/AnalysisPage';
import OverlayPage from './pages/OverlayPage';
import WorkspacePage from './pages/WorkspacePage';

import PublisherPage from './publisher/pages/PublisherPage';

import { PortalShell } from './portal/PortalShell';
import PortalElementPage from './portal/pages/PortalElementPage';
import PortalHomePage from './portal/pages/PortalHomePage';
import PortalViewPage from './portal/pages/PortalViewPage';

import { handleRedirectCallbackIfPresent } from './auth/oidcPkceAuth';

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
  const [authReady, setAuthReady] = useState(false);
  const isDirty = useModelStore((s) => s.isDirty);
  useUnsavedChangesGuard(isDirty, { markTitle: true });

  // Handle OIDC PKCE redirect callback (if present) before the user interacts further.
  useEffect(() => {
    void (async () => {
      try {
        await handleRedirectCallbackIfPresent();
      } catch (e) {
        // Keep this non-fatal; the Remote datasets dialog will surface auth problems.
        // eslint-disable-next-line no-console
        console.warn('OIDC callback handling failed', e);
      } finally {
        setAuthReady(true);
      }
    })();
  }, []);

  if (!authReady) return null;

  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
