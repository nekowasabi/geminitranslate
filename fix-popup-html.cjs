#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const htmlPath = process.argv[2] || './dist-chrome/popup/popup.html';

console.log('🔧 Fixing popup.html...');

// Validate file exists
if (!fs.existsSync(htmlPath)) {
  console.error(`❌ Error: ${htmlPath} not found`);
  process.exit(1);
}

try {
  let html = fs.readFileSync(htmlPath, 'utf8');

  // Check if polyfill script tag already exists
  if (html.includes('browser-polyfill.min.js')) {
    console.log('✅ popup.html already has polyfill script tag, skipping...');
    process.exit(0);
  }

  // Add polyfill script tag before popup.js
  html = html.replace(
    /<script src="popup\.js"><\/script>/,
    '<script src="browser-polyfill.min.js"></script>\n  <script src="popup.js"></script>'
  );

  // Verify the replacement was successful
  if (!html.includes('browser-polyfill.min.js')) {
    console.error('❌ Error: Failed to add polyfill script tag');
    console.error('   Could not find <script src="popup.js"></script> pattern');
    process.exit(1);
  }

  // Write the fixed HTML
  fs.writeFileSync(htmlPath, html, 'utf8');

  console.log('✅ Added polyfill script tag to popup.html');
  console.log(`   - Target: ${htmlPath}`);
} catch (error) {
  console.error('❌ Error fixing popup.html:', error.message);
  process.exit(1);
}
