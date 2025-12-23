import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import AboutPage from './pages/AboutPage';
import WorkspacePage from './pages/WorkspacePage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<WorkspacePage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
