#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const backgroundPath = process.argv[2] || './dist-chrome/background.js';

console.log('Adding Chrome compatibility polyfill...');

// Read the background.js
let content = fs.readFileSync(backgroundPath, 'utf8');

// Check if polyfill already exists
if (content.includes('var browser = chrome')) {
  console.log('⚠️  Polyfill already exists, skipping...');
  return;
}

// Add polyfill at the beginning
const polyfill = `// Chrome compatibility polyfill
if (typeof browser === "undefined") {
  var browser = chrome;
}

`;

content = polyfill + content;

// Write back
fs.writeFileSync(backgroundPath, content);

console.log('✅ Chrome polyfill added successfully!');
