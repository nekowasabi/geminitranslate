// Options page entry point
import React from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '24px' }}>DoganayLab Translate - Settings</h1>
      <p style={{ fontSize: '14px', color: '#666' }}>
        Options UI - React implementation coming soon
      </p>
      <div style={{ marginTop: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>
          API Key
        </label>
        <input
          type="password"
          placeholder="Enter your OpenRouter API key"
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            fontSize: '14px',
          }}
        />
      </div>
      <button
        style={{
          padding: '10px 20px',
          marginTop: '20px',
          backgroundColor: '#6b46c1',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
        }}
        onClick={() => console.log('Save clicked')}
      >
        Save Settings
      </button>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
