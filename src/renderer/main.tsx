import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { removeWebRtc } from './security/disable-webrtc';
import './styles/app.css';

removeWebRtc(globalThis);

const root = document.getElementById('root');
if (!root) throw new Error('missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
