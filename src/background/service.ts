// Chrome Service Worker entry point (Manifest V3)
console.log('DoganayLab Translate - Service Worker initialized (Chrome)');

// Basic message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message);
  sendResponse({ status: 'ok' });
  return true; // Async response
});

// Command listener
chrome.commands.onCommand.addListener((command) => {
  console.log('Command received:', command);
});

export {};
