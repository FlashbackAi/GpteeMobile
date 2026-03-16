#!/usr/bin/env node
/**
 * Postinstall script to disable OpenCL in llama.rn
 * This prevents crashes on devices that don't support OpenCL
 */

const fs = require('fs');
const path = require('path');

const cmakePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'llama.rn',
  'android',
  'src',
  'main',
  'CMakeLists.txt'
);

const javaPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'llama.rn',
  'android',
  'src',
  'main',
  'java',
  'com',
  'rnllama',
  'LlamaContext.java'
);

function disableOpenCLBuild() {
  if (!fs.existsSync(cmakePath)) {
    console.log('⚠️  llama.rn CMakeLists.txt not found, skipping OpenCL patch');
    return;
  }

  let content = fs.readFileSync(cmakePath, 'utf8');

  // Check if already patched
  if (content.includes('# OpenCL variant disabled')) {
    console.log('ℹ️  OpenCL build already disabled in CMakeLists.txt');
    return;
  }

  // Comment out the OpenCL build line
  const openclLine = 'build_rnllama_jni("rnllama_jni_v8_2_dotprod_i8mm_opencl"';
  if (content.includes(openclLine)) {
    content = content.replace(
      /(\s+)(build_rnllama_jni\("rnllama_jni_v8_2_dotprod_i8mm_opencl"[^\n]+)/,
      '$1# OpenCL variant disabled - causes crashes on devices without OpenCL support\n$1# $2'
    );

    fs.writeFileSync(cmakePath, content, 'utf8');
    console.log('✅ Disabled OpenCL build in CMakeLists.txt');
  } else {
    console.log('ℹ️  OpenCL build line not found (may already be removed)');
  }
}

function disableOpenCLRuntime() {
  if (!fs.existsSync(javaPath)) {
    console.log('⚠️  llama.rn LlamaContext.java not found, skipping runtime patch');
    return;
  }

  let content = fs.readFileSync(javaPath, 'utf8');

  // Check if already patched
  if (content.includes('// OpenCL variant disabled')) {
    console.log('ℹ️  OpenCL runtime already disabled in LlamaContext.java');
    return;
  }

  // Remove the OpenCL library loading code
  const openclCheck = 'if (hasDotProd && hasI8mm && hasAdreno)';
  if (content.includes(openclCheck)) {
    content = content.replace(
      /if \(hasDotProd && hasI8mm && hasAdreno\) \{[\s\S]*?loadedLibrary = "rnllama_jni_v8_2_dotprod_i8mm_opencl";[\s\S]*?\} else if \(hasDotProd && hasI8mm\)/,
      '// OpenCL variant disabled - skip Adreno check and use CPU-only\n      if (hasDotProd && hasI8mm)'
    );

    fs.writeFileSync(javaPath, content, 'utf8');
    console.log('✅ Disabled OpenCL runtime loading in LlamaContext.java');
  } else {
    console.log('ℹ️  OpenCL runtime check not found (may already be removed)');
  }
}

console.log('🔧 [Postinstall] Disabling OpenCL in llama.rn...\n');
disableOpenCLBuild();
disableOpenCLRuntime();
console.log('\n✨ Done! OpenCL support disabled.');
