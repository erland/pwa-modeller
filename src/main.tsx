import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import './styles/index.css';

import { registerServiceWorker } from './pwa/registerServiceWorker';
import { initStorePersistenceAsync } from './store/initStorePersistence';
import { initOverlayPersistence } from './store/overlay';

registerServiceWorker();

(async () => {
  await initStorePersistenceAsync();
  initOverlayPersistence();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
})();
