/**
 * Options Page Entry Point
 * Renders the options UI with React
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '../styles/popup.css'; // Reuse popup styles

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
