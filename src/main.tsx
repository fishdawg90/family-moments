import { createRoot } from 'react-dom/client';
import App from './App';
import { BASE, profileFromPath } from './config';
import './style.css';
const p = profileFromPath(location.pathname);
document
  .querySelector('link[rel="manifest"]')
  ?.setAttribute('href', `${BASE}${p.id}/manifest.webmanifest`);
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.accent);
document.title = p.name;
createRoot(document.getElementById('root')!).render(<App />);
if (import.meta.env.PROD && 'serviceWorker' in navigator)
  void navigator.serviceWorker
    .register(`${BASE}sw.js`, { scope: BASE, updateViaCache: 'none' })
    .catch(() => {
      /* Capture remains available; installation status appears in Chrome. */
    });
