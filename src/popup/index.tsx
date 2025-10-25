// Popup entry point
import React from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return (
    <div style={{ padding: '20px', minWidth: '400px' }}>
      <h1 style={{ fontSize: '18px', marginBottom: '16px' }}>DoganayLab Translate</h1>
      <p style={{ fontSize: '14px', color: '#666' }}>
        Popup UI - React implementation coming soon
      </p>
      <button
        style={{
          padding: '8px 16px',
          marginTop: '12px',
          backgroundColor: '#6b46c1',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
        onClick={() => console.log('Button clicked')}
      >
        Translate Page
      </button>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
