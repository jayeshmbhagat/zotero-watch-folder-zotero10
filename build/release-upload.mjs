/**
 * Release upload script for Zotero Watch Folder plugin
 * Uploads .xpi file to GitHub releases
 * 
 * Usage: GITHUB_TOKEN=<token> npm run release:upload
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);

async function uploadRelease() {
  const xpiFile = path.join(rootDir, 'zotero-watch-folder-zotero10.xpi');
  const token = process.env.GITHUB_TOKEN;

  if (!fs.existsSync(xpiFile)) {
    console.error('❌ Error: .xpi file not found. Run "npm run bundle" first.');
    process.exit(1);
  }

  if (!token) {
    console.error('❌ Error: GITHUB_TOKEN environment variable not set.');
    console.error('Usage: GITHUB_TOKEN=<token> npm run release:upload');
    process.exit(1);
  }

  console.log('📤 Uploading to GitHub releases...');
  console.log('ℹ️  This feature requires GitHub CLI (gh) to be installed and authenticated.');
  console.log('    Or manually upload the .xpi file via GitHub web interface.\n');

  try {
    // Try using gh CLI if available
    const { stdout } = await execAsync('gh --version');
    console.log('✓ GitHub CLI found:', stdout.trim());
    console.log('📤 Run: gh release create v3.0.0 zotero-watch-folder-zotero10.xpi');
  } catch (error) {
    console.log('ℹ️  GitHub CLI not found. Manual upload instructions:');
    console.log('   1. Go to: https://github.com/jayeshmbhagat/zotero-watch-folder-zotero10/releases');
    console.log('   2. Create a new release for version 3.0.0');
    console.log(`   3. Upload: ${path.basename(xpiFile)}`);
  }
}

uploadRelease().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
