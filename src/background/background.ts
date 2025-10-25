// Firefox Background Script entry point (Manifest V2)
console.log('DoganayLab Translate - Background Script initialized (Firefox)');

// Basic message listener
browser.runtime.onMessage.addListener((message, sender) => {
  console.log('Message received:', message);
  return Promise.resolve({ status: 'ok' });
});

// Command listener
browser.commands.onCommand.addListener((command) => {
  console.log('Command received:', command);
});

export {};
