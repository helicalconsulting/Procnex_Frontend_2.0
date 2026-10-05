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

createRoot(document.getElementById('root')!).render(
  <App />,
)

