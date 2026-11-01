import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Prevent accidental mouse wheel scroll from modifying input[type="number"] values
document.addEventListener(
  'wheel',
  (e: WheelEvent) => {
    const target = e.target as HTMLElement | null;
    if (target instanceof HTMLInputElement && target.type === 'number') {
      target.blur();
    } else if (document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'number') {
      document.activeElement.blur();
    }
  },
  { passive: true }
);

// Auto-reload on dynamic import failure (e.g. after a new deployment when chunk hashes change)
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const reloadKey = 'procnex_chunk_reload_attempted';
  const hasReloaded = sessionStorage.getItem(reloadKey);

  if (!hasReloaded) {
    sessionStorage.setItem(reloadKey, 'true');
    window.location.reload();
  }
});

window.addEventListener('load', () => {
  sessionStorage.removeItem('procnex_chunk_reload_attempted');
});

createRoot(document.getElementById('root')!).render(
  <App />,
)

