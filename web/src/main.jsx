import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Global error handler to debug black screen on old tablets
window.onerror = function(msg, url, lineNo, columnNo, error) {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:red;color:white;z-index:9999;padding:20px;font-family:sans-serif;word-wrap:break-word;overflow:auto;max-height:100vh;';
  errorDiv.innerHTML = `<h3>Global Error</h3><p><b>Message:</b> ${msg}</p><p><b>URL:</b> ${url}</p><p><b>Line:</b> ${lineNo}:${columnNo}</p><pre>${error && error.stack ? error.stack : ''}</pre>`;
  document.body.appendChild(errorDiv);
  return false;
};

window.addEventListener('unhandledrejection', function(event) {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:orange;color:black;z-index:9998;padding:20px;font-family:sans-serif;word-wrap:break-word;overflow:auto;max-height:50vh;';
  errorDiv.innerHTML = `<h3>Unhandled Promise Rejection</h3><pre>${event.reason ? (event.reason.stack || event.reason) : 'Unknown reason'}</pre>`;
  document.body.appendChild(errorDiv);
});

import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

