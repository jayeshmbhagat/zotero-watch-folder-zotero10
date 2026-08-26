/**
 * Build script for Zotero Watch Folder plugin
 * Copies source files to dist/ directory
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);
const distDir = path.join(rootDir, 'dist');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy source files to dist
function copyDir(src, dest, exclude = []) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (exclude.includes(entry.name)) continue;

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, exclude);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`✓ Copied: ${path.relative(rootDir, destPath)}`);
    }
  }
}

console.log('📦 Building plugin...\n');

// Copy content files
const contentSrc = path.join(rootDir, 'content');
const contentDest = path.join(distDir, 'content');
if (fs.existsSync(contentSrc)) {
  copyDir(contentSrc, contentDest);
}

// Copy manifest
const manifestSrc = path.join(rootDir, 'manifest.json');
if (fs.existsSync(manifestSrc)) {
  fs.copyFileSync(manifestSrc, path.join(distDir, 'manifest.json'));
  console.log(`✓ Copied: manifest.json`);
}

// Copy LICENSE
const licenseSrc = path.join(rootDir, 'LICENSE');
if (fs.existsSync(licenseSrc)) {
  fs.copyFileSync(licenseSrc, path.join(distDir, 'LICENSE'));
  console.log(`✓ Copied: LICENSE`);
}

// Copy README if exists
const readmeSrc = path.join(rootDir, 'README.md');
if (fs.existsSync(readmeSrc)) {
  fs.copyFileSync(readmeSrc, path.join(distDir, 'README.md'));
  console.log(`✓ Copied: README.md`);
}

console.log('\n✅ Build complete! Files ready in dist/');
