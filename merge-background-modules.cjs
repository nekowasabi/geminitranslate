#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const distDir = process.argv[2] || './dist-chrome';
const openrouterPath = path.join(distDir, 'openrouter.js');
const backgroundPath = path.join(distDir, 'background.js');

console.log('🔗 Merging background.js modules...');

// Validate files exist
if (!fs.existsSync(openrouterPath)) {
  console.error(`❌ Error: ${openrouterPath} not found`);
  process.exit(1);
}

if (!fs.existsSync(backgroundPath)) {
  console.error(`❌ Error: ${backgroundPath} not found`);
  process.exit(1);
}

try {
  // Read openrouter.js and remove export statements
  let openrouterContent = fs.readFileSync(openrouterPath, 'utf8');
  openrouterContent = openrouterContent.replace(/^export /gm, '');

  // Read background.js
  let backgroundContent = fs.readFileSync(backgroundPath, 'utf8');

  // Remove import statement (line 13 or nearby)
  backgroundContent = backgroundContent.replace(
    /^import .* from ['"]\.\/openrouter\.js['"];?\s*$/m,
    ''
  );

  // Find insertion point - after polyfill code, before main logic
  // Look for a marker comment or insert after the polyfill block
  const polyfillEnd = backgroundContent.indexOf('// Original background.js');

  if (polyfillEnd === -1) {
    // If no marker found, insert after polyfill variable declarations
    const insertionPoint = backgroundContent.indexOf('\n', backgroundContent.indexOf('globalThis.browser')) + 1;

    const mergedContent =
      backgroundContent.slice(0, insertionPoint) +
      '\n// =======================\n' +
      '// OpenRouter Client (merged from openrouter.js)\n' +
      '// =======================\n\n' +
      openrouterContent +
      '\n\n// =======================\n' +
      '// Background Script Logic\n' +
      '// =======================\n' +
      backgroundContent.slice(insertionPoint);

    fs.writeFileSync(backgroundPath, mergedContent, 'utf8');
  } else {
    // Insert after the marker
    const insertionPoint = polyfillEnd + '// Original background.js\n'.length;

    const mergedContent =
      backgroundContent.slice(0, insertionPoint) +
      '\n// =======================\n' +
      '// OpenRouter Client (merged from openrouter.js)\n' +
      '// =======================\n\n' +
      openrouterContent +
      '\n\n// =======================\n' +
      '// Background Script Logic\n' +
      '// =======================\n' +
      backgroundContent.slice(insertionPoint);

    fs.writeFileSync(backgroundPath, mergedContent, 'utf8');
  }

  // Remove standalone openrouter.js (no longer needed)
  fs.unlinkSync(openrouterPath);

  console.log('✅ Modules merged successfully!');
  console.log(`   - Merged ${path.basename(openrouterPath)} into ${path.basename(backgroundPath)}`);
  console.log(`   - Removed standalone openrouter.js`);

  const finalSize = fs.statSync(backgroundPath).size;
  console.log(`   - Final size: ${(finalSize / 1024).toFixed(2)} KB`);
} catch (error) {
  console.error('❌ Error merging modules:', error.message);
  process.exit(1);
}
