import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { startSync } from './ui/sync/sync';

// logged in (the online app): pull and merge first, so every page starts with the synced data;
// no server or not logged in: local only, as before
void startSync().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);

// works offline (the home game's wifi): the built app keeps its files on the device
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
