# Zotero Watch Folder — Zotero 10+ Compatible

[![Zotero target version](https://img.shields.io/badge/Zotero-10%2B-CC2936?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![License: GPL v3](https://img.shields.io/github/license/jayeshmbhagat/zotero-watch-folder-zotero10?style=flat-square)](LICENSE)

**A watch folder plugin for Zotero 10+** — Drop a PDF into a folder on your computer, and it shows up in Zotero a few seconds later, with its metadata filled in and a tidy filename.

This is a **community fork** of [josesiqueira/zotero-watch-folder](https://github.com/josesiqueira/zotero-watch-folder) updated for **Zotero 10 and later versions**.

## What is this?

Zotero Watch Folder is a plugin that turns a plain folder on your disk into an **inbox for your library**: anything you save there is pulled into Zotero automatically, organised, and (optionally) kept in two-way sync with your collections.

It is built to be:

- **Safe by default** — out of the box it only ever *adds* things; nothing is moved or deleted until you opt in.
- **Recoverable** — even in the delete-capable mode, removed files go to a recoverable trash, never a permanent erase.
- **Out of your way** — set it once; new files just appear in Zotero.
- **All local** — the plugin runs on your computer; your existing Zotero sync carries things to your other devices.

## What can it do?

- **Auto-import PDFs from a watched folder** — drop a file in, it becomes a Zotero item within seconds, metadata looked up and filename cleaned up
- **Mirror folders and Zotero collections** — make a subfolder, get a subcollection; rename one, the other follows (two-way, optional)
- **Never make duplicates** — save the same paper twice and it's recognised by content hash and skipped
- **Delete safely** — in the delete-capable mode, removals go to a recoverable trash and can be put back
- **Choose where your PDFs live** — store them in Zotero (synced everywhere), link them from your folder, or both
- **Smart rules** — match on title / author / DOI / tags / filename and auto-tag or file into a collection
- **Won't run away with your library** — pauses if the folder goes missing instead of treating "everything vanished" as "delete everything"

## Installation

### For Zotero 10+

1. Download the latest `.xpi` from the **[Releases page](https://github.com/jayeshmbhagat/zotero-watch-folder-zotero10/releases)**
2. In Zotero, open **Tools → Add-ons**
3. Click the gear icon → **Install Add-on From File…**
4. Choose the `.xpi` and restart Zotero if asked
5. Open **Edit → Preferences → Watch Folder** and click **Set up Watch Folder…**

### Quick Start (2 minutes)

1. **Run the setup wizard** (Preferences → Watch Folder → *Set up Watch Folder…*)
   - Choose your watch folder
   - Pick your Zotero collection
   - Start with **Mode 1 (Import only)** — safest option
   - Choose **Store PDFs in Zotero** (default)

2. **Turn it on** and drop a PDF into your watch folder

3. Within seconds it appears in your collection with metadata fetched and filename cleaned

## Three Operating Modes

| Mode | What it does | Who it's for |
|------|-------------|----------|
| **Mode 1 — Import only** | New files get imported. Nothing is ever moved or deleted. | Most people. **Start here.** |
| **Mode 2 — Mirror, no deleting** | Folders and Zotero collections mirror each other both ways; deletes are warn-only. | People who organize with folder structure |
| **Mode 3 — Mirror with safe delete** | Full two-way sync including deletions → recoverable trash | Advanced users wanting full sync |

## PDF Storage Strategies

| Strategy | What it does | Best for |
|---|---|---|
| **Store PDFs in Zotero** *(default)* | Zotero keeps the file and syncs it | Most people and WebDAV/cloud sync users |
| **Link PDFs from watch folder** | Zotero points at the file; no copy | Single-machine setups with folder backup |
| **Store + Mirror** | Synced copy + local backup copy | Redundant backup workflows |

## ⚠️ Before You Start

**Back up everything first:**
1. Copy your watch folder to a backup drive
2. Back up Zotero: `File → Export Library… → Zotero RDF`
3. **Start in Mode 1** (import only) — it's the safest

## Development

Plain ES modules bundled with esbuild — no framework, no heavy toolchain.

```bash
git clone https://github.com/jayeshmbhagat/zotero-watch-folder-zotero10.git
cd zotero-watch-folder-zotero10
npm install
npm run build && npm run bundle   # produces dist/ + the runnable bundle
npm run package                   # zips the .xpi + writes update.json
npm test                          # Vitest unit suite
```

## Key Changes from Original (v2.x)

### Zotero 10 API Updates
- Updated manifest version to v3 (new Zotero 10+ requirement)
- Updated `strict_max_version` from `9.*` to `10.*`
- Updated plugin ID to avoid conflicts: `watch-folder-v10@zotero-plugin.org`
- Zotero 10 uses updated APIs for:
  - Preference panes registration
  - File operations (IOUtils, PathUtils compatibility)
  - Item creation and attachment handling
  - Collection and library operations

### Compatibility Notes
- Chrome/Firefox modernization (ESM modules)
- Zotero 10's new data models for items and attachments
- Updated UI patterns for Zotero 10's interface
- Modernized event handling and lifecycle hooks

## Status & Roadmap

- ✅ Mode 1 import, Mode 2 mirror, Mode 3 safe-delete + recoverable trash
- ✅ Content-hash dedup, metadata retrieval, template rename, smart rules
- ✅ PDF storage strategy (stored / linked / mirror)
- ✅ Drive-disconnect safety, bulk-delete confirmation
- 🔄 Zotero 10 testing and field verification
- 📋 Next: broader Windows / macOS field-testing with Zotero 10

## Credits

**Original Plugin:** [Jose Siqueira — josesiqueira/zotero-watch-folder](https://github.com/josesiqueira/zotero-watch-folder)

This fork maintains the original GPL-3.0 license and builds on Jose's excellent work to support Zotero 10+.

## License

GNU GPL v3.0 — free and open source. See [`LICENSE`](LICENSE) for the full text.

## Issues & Support

- **Found a bug?** [Open an issue](https://github.com/jayeshmbhagat/zotero-watch-folder-zotero10/issues)
- **Zotero 10 specific problem?** Make sure you've updated to the latest version
- **Original plugin issues?** Check the [original repo](https://github.com/josesiqueira/zotero-watch-folder)

---

*Want to contribute?* Pull requests welcome! Please run `npm test` before submitting.
