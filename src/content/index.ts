// Content Script entry point
console.log('DoganayLab Translate - Content Script initialized');

// Determine browser API
const browserAPI = typeof chrome !== 'undefined' && chrome.runtime ? chrome : browser;

// Basic message listener
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);

  if (sendResponse) {
    sendResponse({ status: 'ok' });
  }

  return true; // Async response
});

export {};
