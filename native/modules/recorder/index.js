'use strict';

const path = require('path');
const nodeGypBuild = require('node-gyp-build');

// Attempt to load precompiled binary
let binding;
try {
  binding = nodeGypBuild(path.join(__dirname));
} catch (e) {
  console.error('Failed to load recorder module:', e.message);
  console.error('This module requires prebuilt binaries. Ensure correct version is installed.');
  throw new Error(`Failed to load recorder module: ${e.message}`);
}

module.exports = binding; 