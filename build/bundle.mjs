/**
 * Bundle script for Zotero Watch Folder plugin
 * Creates a .xpi (ZIP) file from dist/ directory
 */

import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);
const distDir = path.join(rootDir, 'dist');
const outputFile = path.join(rootDir, 'zotero-watch-folder-zotero10.xpi');

// Check if dist directory exists
if (!fs.existsSync(distDir)) {
  console.error('❌ Error: dist/ directory not found. Run "npm run build" first.');
  process.exit(1);
}

// Create output stream
const output = fs.createWriteStream(outputFile);
const archive = archiver('zip', { zlib: { level: 9 } });

console.log('📦 Bundling plugin into .xpi...\n');

output.on('close', () => {
  const sizeKB = (archive.pointer() / 1024).toFixed(2);
  console.log(`✅ Bundle complete!`);
  console.log(`📦 File: ${path.basename(outputFile)}`);
  console.log(`📊 Size: ${sizeKB} KB\n`);
  console.log('📥 Installation:');
  console.log('  1. Open Zotero 10+');
  console.log('  2. Settings → Extensions (gear icon, bottom right)');
  console.log('  3. Click ⚙️ → "Install Add-on from File..."');
  console.log(`  4. Select: ${path.basename(outputFile)}\n`);
});

output.on('error', (err) => {
  console.error('❌ Bundle error:', err.message);
  process.exit(1);
});

archive.on('error', (err) => {
  console.error('❌ Archive error:', err.message);
  process.exit(1);
});

// Pipe archive to output
archive.pipe(output);

// Add files from dist directory
console.log('Adding files:');
archive.directory(distDir + '/', false);

// Finalize archive
archive.finalize();
