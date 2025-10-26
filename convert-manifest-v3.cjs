#!/usr/bin/env node

const fs = require('fs');

const manifestPath = process.argv[2] || './dist-chrome/manifest.json';

console.log('Converting manifest.json to v3...');

// Read the manifest
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Convert to v3
const manifestV3 = {
  manifest_version: 3,
  name: manifest.name,
  version: manifest.version,
  description: manifest.description,
  icons: manifest.icons,

  // Convert browser_action to action
  action: {
    default_icon: manifest.browser_action.default_icon,
    default_title: manifest.browser_action.default_title,
    default_popup: manifest.browser_action.default_popup
  },

  // Convert background scripts to service_worker
  background: {
    service_worker: manifest.background.scripts[0]
  },

  // Content scripts with polyfill for Chrome compatibility
  content_scripts: manifest.content_scripts.map(cs => ({
    ...cs,
    js: cs.js.includes('browser-polyfill.min.js')
      ? cs.js  // Already has polyfill, keep as-is
      : ['browser-polyfill.min.js', ...cs.js]  // Add polyfill first
  })),

  // Separate permissions and host_permissions
  // Note: webRequest and webRequestBlocking are removed as they're deprecated in v3
  permissions: manifest.permissions.filter(p =>
    !p.includes('://') &&
    p !== '<all_urls>' &&
    p !== 'webRequest' &&
    p !== 'webRequestBlocking'
  ),
  host_permissions: ['<all_urls>'],

  // Web accessible resources (v3 format)
  web_accessible_resources: [{
    resources: manifest.web_accessible_resources,
    matches: ['<all_urls>']
  }],

  // Commands remain the same
  commands: manifest.commands
};

// Write the converted manifest
fs.writeFileSync(manifestPath, JSON.stringify(manifestV3, null, 2));

console.log('✅ Manifest converted to v3 successfully!');
console.log('📝 Changes:');
console.log('  - manifest_version: 2 → 3');
console.log('  - browser_action → action');
console.log('  - background.scripts → background.service_worker');
console.log('  - permissions split into permissions + host_permissions');
console.log('  - webRequest/webRequestBlocking removed (deprecated in v3)');
console.log('  - web_accessible_resources updated to v3 format');
