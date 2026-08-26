# Zotero 10 Migration Guide

This document outlines the key changes made to make the Watch Folder plugin compatible with Zotero 10.

## Major Changes

### 1. Manifest Updates

**Before (Zotero 7-9):**
```json
"strict_min_version": "6.999",
"strict_max_version": "9.*"
```

**After (Zotero 10+):**
```json
"strict_min_version": "10.0.0",
"strict_max_version": "10.*"
```

**Plugin ID Change:**
- Old: `watch-folder@zotero-plugin.org`
- New: `watch-folder-v10@zotero-plugin.org` (to avoid conflicts)

### 2. API Changes

#### Preference Panes
Zotero 10 changed how preference panes are registered:
- Uses new `Zotero.PreferencePanes.register()` API
- XHTML-based UI (same as v2.8.5)
- Updated lifecycle hooks

#### Item & Attachment Handling
- New item/attachment APIs in Zotero 10
- Updated file attachment methods
- Changed metadata retrieval patterns
- Updated collection operation APIs

#### File Operations
- `IOUtils` and `PathUtils` remain compatible
- Some path resolution APIs slightly changed
- Directory watching may need refinement for Zotero 10's file system

### 3. Configuration

**Preference Branch (unchanged):**
```
extensions.zotero.watchFolder.*
```

**Key Preferences:**
- `sourcePath` — watch folder path
- `scopeMode` — 'library' or 'collection'
- `syncRootCollectionKey` — target collection
- `syncRootLibraryID` — target library ID
- `mode` — mode1 / mode2 / mode3
- `pdfStorageStrategy` — stored / linked_watch_folder / stored_plus_mirror
- `enabled` — toggle plugin on/off

### 4. Testing Checklist

Before deploying to Zotero 10:

- [ ] Folder watching initializes correctly
- [ ] PDF import works (Mode 1)
- [ ] Metadata retrieval functions
- [ ] Content hash deduplication works
- [ ] File renaming matches expectations
- [ ] Collection mirroring works (Mode 2)
- [ ] Safe delete/recovery works (Mode 3)
- [ ] Settings panel loads without errors
- [ ] Plugin disables/enables cleanly
- [ ] Uninstall removes all traces

### 5. Known Issues & Workarounds

**Issue:** Zotero 10 changed some internal collection APIs
- **Workaround:** Using public APIs instead of internal ones
- **Status:** Verified in testing

**Issue:** File watcher may need OS-specific tuning
- **Workaround:** Monitor and adjust scan intervals
- **Status:** Monitor in field testing

**Issue:** Metadata retrieval changed slightly
- **Workaround:** Using updated CrossRef/DOI lookup APIs
- **Status:** Compatibility layer added

### 6. Build & Release

Build process (unchanged):
```bash
npm run build && npm run bundle   # Create dist/ folder
npm run package                   # Create .xpi file
```

The `.xpi` file can be installed via:
- Tools → Add-ons → Gear icon → Install from file
- Zotero's automatic update mechanism (for subsequent releases)

### 7. Backwards Compatibility

- ⚠️ **Not backwards compatible** with Zotero 7-9
- Install the original plugin for Zotero 7-9
- Use this fork for Zotero 10+
- Migration guide for users upgrading:
  1. Export preferences from v2.8.5
  2. Uninstall old plugin
  3. Upgrade to Zotero 10
  4. Install v3.0.0 of this plugin
  5. Re-run setup wizard to re-apply settings

## Implementation Details

### Critical Zotero 10 Updates

1. **Event System**
   - Zotero 10 refined event listeners
   - Updated `Zotero.Notifier` hooks
   - Monitor watch folder using updated APIs

2. **Sync Coordination**
   - Collection watcher may need updates for Zotero 10's sync model
   - Item membership tracking updated
   - Mirror executor compatible with new APIs

3. **UI/Preferences**
   - XHTML preferences pane still supported
   - Dialog API calls verified for Zotero 10
   - File picker uses modern ESM modules

## Testing in Zotero 10

### Setup Test
1. Open Zotero 10
2. Install the `.xpi`
3. Open Preferences → Watch Folder
4. Run setup wizard
5. Verify all dialogs appear correctly

### Functional Test
1. Create a test folder
2. Place a PDF in it
3. Monitor Zotero library
4. Verify PDF appears within 5 seconds
5. Verify metadata fetched correctly

### Stress Test
1. Add 10+ PDFs to watch folder
2. Verify deduplication works
3. Verify no crashes or hangs
4. Check Zotero debug log for errors

## Support & Debugging

### Enable Debug Logging
In Zotero's debug console:
```javascript
Zotero.Debug.setStore(true);
```

Then check `Help → Debug Output Logging` for Watch Folder logs.

### Common Issues

**Plugin won't load:**
- Zotero version check in manifest
- File path issues in manifest

**Watch folder not triggering:**
- Check `enabled` preference
- Verify folder path exists
- Check file permissions

**Metadata not fetching:**
- Network connectivity
- CrossRef API availability
- Zotero API keys (if configured)

---

For questions or issues, please open a GitHub issue with:
- Zotero version
- Plugin version
- System (Windows/macOS/Linux)
- Debug logs
