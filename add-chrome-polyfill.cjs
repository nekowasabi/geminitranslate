#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const backgroundPath = process.argv[2] || './dist-chrome/background.js';
const polyfillSourcePath = path.join(__dirname, 'browser-polyfill.min.js');

console.log('📝 Adding WebExtension Polyfill to background.js...');

// Validate input file exists
if (!fs.existsSync(backgroundPath)) {
  console.error(`❌ Error: Background script not found at ${backgroundPath}`);
  process.exit(1);
}

// Validate polyfill source exists
if (!fs.existsSync(polyfillSourcePath)) {
  console.error(`❌ Error: Polyfill source not found at ${polyfillSourcePath}`);
  console.error('   Please ensure browser-polyfill.min.js exists in the project root');
  process.exit(1);
}

try {
  // Read the background.js
  let content = fs.readFileSync(backgroundPath, 'utf8');

  // Check if polyfill already exists
  if (content.includes('webextension-polyfill') || content.includes('var browser = chrome')) {
    console.log('⚠️  Polyfill already exists, skipping...');
    return;
  }

  // Read the polyfill content
  const polyfillContent = fs.readFileSync(polyfillSourcePath, 'utf8');

  // Add polyfill at the beginning with clear markers
  const polyfillWrapper = `// =======================
// WebExtension Polyfill
// Auto-injected by add-chrome-polyfill.cjs
// =======================
${polyfillContent}

// =======================
// Original background.js
// =======================

`;

  content = polyfillWrapper + content;

  // Write back
  fs.writeFileSync(backgroundPath, content, 'utf8');

  console.log('✅ WebExtension Polyfill added successfully!');
  console.log(`   Target: ${backgroundPath}`);
  console.log(`   Size: ${(content.length / 1024).toFixed(2)} KB`);
} catch (error) {
  console.error('❌ Error adding polyfill:', error.message);
  process.exit(1);
}
