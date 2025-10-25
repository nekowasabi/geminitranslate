/**
 * Popup Entry Point
 * Initializes and renders the popup React application
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('root');

  if (!container) {
    console.error('Root element not found');
    return;
  }

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
