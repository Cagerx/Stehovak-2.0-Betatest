
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Global handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason;
  const errorMessage = error?.message || String(error);
  
  if (errorMessage.toLowerCase().includes('aborted') || 
      error?.name === 'AbortError' || 
      errorMessage.includes('The user aborted a request.')) {
    event.preventDefault(); // Prevent the error from showing in the console
  }
});

// Global handler for uncaught errors
window.addEventListener('error', (event) => {
  const error = event.error;
  const errorMessage = error?.message || String(error) || event.message;
  
  if (errorMessage.toLowerCase().includes('aborted') || 
      error?.name === 'AbortError' || 
      errorMessage.includes('The user aborted a request.')) {
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
    <App />
  </React.StrictMode>
);
