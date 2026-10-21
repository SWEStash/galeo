import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { markStart } from './perf';
import { removeWebRtc } from './security/disable-webrtc';
import { installDefaultPolicy } from './security/trusted-types';
import './styles/app.css';

// Every module above has loaded and run by now.
markStart('modules-loaded');
removeWebRtc(globalThis);
installDefaultPolicy();

const root = document.getElementById('root');
if (!root) throw new Error('missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
