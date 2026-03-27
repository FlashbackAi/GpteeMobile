#!/usr/bin/env node

/**
 * Post-install script to fix Solana Mobile Wallet Adapter
 *
 * Issue: MWA uses TurboModuleRegistry.getEnforcing() which fails when TurboModules aren't loaded
 * Fix: Add fallback to NativeModules for compatibility
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@solana-mobile',
  'mobile-wallet-adapter-protocol',
  'lib',
  'cjs',
  'index.native.js'
);

console.log('[PostInstall] Patching Solana Mobile Wallet Adapter...');

if (!fs.existsSync(filePath)) {
  console.warn('[PostInstall] MWA file not found, skipping patch');
  process.exit(0);
}

let content = fs.readFileSync(filePath, 'utf8');

// Check if already patched
if (content.includes('NativeModules.SolanaMobileWalletAdapter')) {
  console.log('[PostInstall] MWA already patched, skipping');
  process.exit(0);
}

// Apply the patch
const oldCode = "var NativeSolanaMobileWalletAdapter = reactNative.TurboModuleRegistry.getEnforcing('SolanaMobileWalletAdapter');";
const newCode = `var NativeSolanaMobileWalletAdapter = reactNative.TurboModuleRegistry.get && reactNative.TurboModuleRegistry.get('SolanaMobileWalletAdapter')
    ? reactNative.TurboModuleRegistry.get('SolanaMobileWalletAdapter')
    : reactNative.NativeModules.SolanaMobileWalletAdapter;`;

if (!content.includes(oldCode)) {
  console.warn('[PostInstall] Expected code pattern not found in MWA, skipping patch');
  process.exit(0);
}

content = content.replace(oldCode, newCode);
fs.writeFileSync(filePath, content, 'utf8');

console.log('[PostInstall] ✅ MWA patched successfully!');
