
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from './AppContext';

// Suppress benign WebSocket and AbortError messages from console
const originalConsoleError = console.error;
console.error = (...args) => {
  const msg = args.map(String).join(' ').toLowerCase();
  if (
    msg.includes('aborted') ||
    msg.includes('the user aborted a request') ||
    msg.includes('websocket closed without opened') ||
    msg.includes('failed to connect to websocket')
  ) {
    return;
  }
  originalConsoleError(...args);
};

// Global handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason;
  const errorMessage = error?.message || String(error);
  
  if (errorMessage.toLowerCase().includes('aborted') || 
      error?.name === 'AbortError' || 
      errorMessage.includes('the user aborted a request') ||
      errorMessage.toLowerCase().includes('websocket closed without opened') ||
      errorMessage.toLowerCase().includes('failed to connect to websocket')) {
    event.preventDefault(); // Prevent the error from showing in the console
  }
});

// Global handler for uncaught errors
window.addEventListener('error', (event) => {
  const error = event.error;
  const errorMessage = error?.message || String(error) || event.message;
  
  if (errorMessage.toLowerCase().includes('aborted') || 
      error?.name === 'AbortError' || 
      errorMessage.includes('the user aborted a request') ||
      errorMessage.toLowerCase().includes('websocket closed without opened') ||
      errorMessage.toLowerCase().includes('failed to connect to websocket')) {
    event.preventDefault(); // Prevent the error from showing in the console
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
