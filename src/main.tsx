declare global { interface Window { __removeLoader?: () => void; } }

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Remove o skeleton HTML assim que o React montar
if (typeof window.__removeLoader === 'function') {
  window.__removeLoader();
}

