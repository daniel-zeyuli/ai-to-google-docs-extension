# ARCH.md — Architecture & Dependency Map

A technical map of the project. Read the section that matches the file you're about to touch — especially the **dependency graph** to assess blast radius before editing.

---

## High-level view

```
┌────────────────────────────────────────────────────────────────────┐
│ Host page (chatgpt.com / gemini.google.com / claude.ai)            │
│                                                                    │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │ content.js (injected; runs in page's content-script world)  │  │
│   │   ├─ MutationObserver → injects "Export to Docs" buttons    │  │
│   │   ├─ extractMarkdown() walks DOM → markdown + image markers │  │
│   │   ├─ showSelectPanel() → in-page right-side panel UI        │  │
│   │   └─ _pickDriveFolder() → in-page folder-picker modal       │  │
│   └─────────────────────────────────────────────────────────────┘  │
│            │ chrome.runtime.sendMessage                            │
└────────────┼───────────────────────────────────────────────────────┘
             ▼
┌────────────────────────────────────────────────────────────────────┐
│ background.js (service worker)                                     │
│   ├─ uploadToDrive    → multipart POST to drive/v3/upload          │
│   ├─ appendToDoc      → docs/v1/...:batchUpdate insertText         │
│   ├─ listFolders      → drive/v3/files?q=...                       │
│   ├─ createFolder     → drive/v3/files POST                        │
│   ├─ ensureAuth       → chrome.identity.getAuthToken({interactive})│
│   ├─ fetchImage       → fetch + canvas → base64 PNG                │
│   ├─ downloadLocal    → chrome.downloads.download(data: URL)       │
│   └─ command listener → forwards Cmd-Shift-E to active tab         │
└────────────────────────────────────────────────────────────────────┘
             │
             ▼
   ┌──────────────────────┐    ┌────────────────────────┐
   │ Google Drive API     │    │ Google Docs API        │
   │ (drive.file scope)   │    │ (drive.file scope)     │
   └──────────────────────┘    └────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ popup.html / popup.js (toolbar icon)                               │
│   ├─ Save-to: Drive | Local                                        │
│   ├─ Default mode: Last | Full | Pick                              │
│   └─ Change folder → opens picker-host.html (legacy path)          │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ picker-host.html / picker-host.js (legacy popup picker)            │
│ Currently *unused* by content.js (in-page modal replaced it).      │
│ Still triggered from popup.js's "Change folder" button.            │
└────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow — "User clicks Export to Docs" (the canonical journey)

1. **`content.js : MutationObserver`** sees a new AI message DOM, runs `addButtons()` → `addChatGPTButtons` / `addGeminiButtons` / `addClaudeButtons` injects a `<button class="cgd-export-btn">` into the action bar.
2. **User clicks the button.** `handleExportClick(e, messageEl)` reads `defaultExportMode` from `chrome.storage.local`. Default mode is `select` (open panel); other modes (`last`, `full`) export immediately.
3. **`showSelectPanel(messageEl)`** builds the right-side panel: destination row (Drive/Local), recent chips (from `lastExports[convKey]` + `globalRecentDocs`), Last/Full/Pick buttons, optional checkbox list of all responses.
4. **User clicks Last (typical case).** `exportMessage(el)` → `extractMarkdown(el)` walks the DOM:
   - `processNode(node)` recurses, applying 6 math-extraction strategies (Gemini `data-math`, KaTeX wrappers, MathJax, `<math>` element, etc.) and emitting Markdown with `[[IMG:n]]` placeholders.
   - `_captureImages()` runs canvas-based capture for any `<img>` with `naturalWidth`. CORS-blocked images fall back to `chrome.runtime.sendMessage({ action: 'fetchImage' })` → background fetches and re-encodes as PNG base64.
5. **`exportMarkdown(markdown, suffix, imageMap)`**:
   - Prepends a metadata header (`*Platform · YYYY-MM-DD · convTitle*\n*sourceUrl*`).
   - Calls `window.convertChatGPTToDocx(markdown, imageMap)` (in `converter.js`) → produces a `.docx` Blob with native OOXML math from LaTeX.
   - `blobToBase64()` → base64 string.
6. **Routes by `exportDest`:**
   - `local`: `chrome.runtime.sendMessage({ action: 'downloadLocal', docxBase64, filename })` → background calls `chrome.downloads.download({ url: 'data:application/...;base64,...', saveAs: true })`.
   - `drive`: `chrome.runtime.sendMessage({ action: 'uploadToDrive', docxBase64, filename })` → background:
     - `getAuthToken(interactive=true)` (cached after first sign-in).
     - `getOrCreateExportFolder(token)` resolves: `customFolderId` (if set & not trashed) → `exportFolderId` (auto-created "AI Chat Exports") → root.
     - Builds `multipart/related` body with metadata `{ name, mimeType: application/vnd.google-apps.document, parents: [folderId] }` and the `.docx` bytes.
     - POST `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink`.
     - Drive auto-converts the `.docx` to Google Docs format because `mimeType` is `application/vnd.google-apps.document`.
     - Returns `{ fileId, fileName, url }`.
7. **`content.js`** receives the upload result, `showToast(✅)`, `window.open(url)` after 500 ms, and writes a new entry to `lastExports[convKey]` (≤ 3) and `globalRecentDocs` (≤ 5), deduplicated by both `fileId` and `fileName`.

### Variant: append to existing doc
- User clicks a recent chip's `[+↩]` button → `_showAppendDropdown` → choosing "Last response" calls `_appendToRecent(exp)` → `chrome.runtime.sendMessage({ action: 'appendToDoc', fileId, text })` → background `appendContent` does `docs/v1/documents/{fileId}:batchUpdate` with an `insertText` request appended at end-of-segment, prefixed with a date separator. **Note:** `appendToDoc` calls Docs API, which works under `drive.file` because the doc was extension-created.

### Variant: keyboard shortcut
- `Cmd+Shift+E` → background's `chrome.commands` listener forwards to active tab's content script as `{ action: 'triggerDefault' }` → content reads `defaultExportMode` and acts.

### Variant: folder pick
- User clicks Drive button when already in Drive mode → `_pickDriveFolder()` builds in-page modal → `ensureAuth` → `listFolders({ parentId })` → renders breadcrumb + folder list → user clicks "Select" → writes `customFolderId`/`customFolderName` to storage → modal closes → next export uses that folder.

---

## Module Responsibilities

### `manifest.json`
**Owns:** declared permissions, scopes, host permissions, content-script registration, OAuth client_id, popup binding, icon set, version number, command shortcut.
**Does NOT own:** any logic.
**Touch this file only when:** you're adding/removing a permission, scope, host permission, content-script target, or shortcut. Update CLAUDE.md § 2 if you change red-line items.

### `background.js` (service worker)
**Owns:** OAuth (`chrome.identity`), Drive API calls (upload, list folders, create folder), Docs API call (append), local file download, image fetch-via-fetch-API. Also owns the Cmd-Shift-E command forwarder.
**Does NOT own:** any DOM extraction, Markdown→docx conversion, panel UI, button injection.
**Touch when:** adding a new API call, fixing OAuth, changing folder logic, adjusting upload error handling.

### `content.js` (1700+ lines, single IIFE — intentionally not modularized; see CLAUDE.md § 6)
**Owns:** platform detection (`isChatGPT`/`isGemini`/`isClaude`), DOM extraction (`extractMarkdown`, `processNode`, `directExtractWithMath`, `extractTeX`, `processTable`), image capture (`_captureImages`), button injection (`createExportButton`, `addChatGPTButtons`, etc., `MutationObserver`), panel UI (`showSelectPanel`, `_buildSelectPanel`), folder picker modal (`_pickDriveFolder`), append flows (`_appendToRecent`, `_appendFullToDoc`, `_showAppendDropdown`), toast (`showToast`), per-conversation/global recent storage on success.
**Does NOT own:** OAuth, Drive API calls, file download, .docx generation.
**Touch when:** anything UI-visible on the host page; anything DOM-extraction-related.

### `converter.js`
**Owns:** Markdown parser, LaTeX tokenizer + parser → OOXML math, table → OOXML, inline image embedding, ZIP packaging (zero-deps; manual CRC32 + DEFLATE), `window.convertChatGPTToDocx` entry point.
**Does NOT own:** anything network-related, DOM-related, UI-related.
**Touch with extreme caution.** ZIP/CRC32/OOXML invariants are subtle. Run the math-regression tests after any change. **See CLAUDE.md § 2.8.**

### `popup.html` / `popup.js`
**Owns:** the toolbar-icon settings UI: Save-to (Drive/Local), Default-mode (Last/Full/Pick), keyboard-shortcut display, Change-folder entry point. Reads/writes `chrome.storage.local`.
**Does NOT own:** export logic. Triggers the content script's listener via `chrome.runtime.sendMessage` (not currently — popup is settings-only).
**Touch when:** adding/changing a user-facing setting or popup affordance.

### `styles.css`
**Owns:** all in-page UI styling: `.cgd-export-btn`, `.cgd-toast`, `.cgd-panel`, `.cgd-recent-*`, `.cgd-pk-*` (picker modal), `.cgd-append-drop*`. Both light- and dark-mode variants via `.cgd-dark` and `[data-cgd-theme="dark"]` selectors.
**Does NOT own:** `popup.html` styles (those are inline in `popup.html`).
**Touch when:** any visual change. Always add a `.cgd-dark` companion rule for new colored elements.

### `picker-host.html` / `picker-host.js`
**Owns:** legacy folder-picker as a separate Chrome window (still wired from `popup.js`'s Change-folder button).
**Status:** in-page modal in `content.js` superseded this for the in-flow case. Keep until popup is rewired or the path is verified dead.
**Touch when:** popup folder picker breaks.

### `picker-sandbox.html` / `picker-sandbox.js`
**Status:** dead code from the abandoned Google Picker API path. Not loaded by current `manifest.json`. **Candidate for deletion** — flag it in `IDEAS.md` next time you're in this area; do not delete inline.

### `privacy.html`
**Owns:** privacy policy text (legally required). **Do not edit without explicit user request** (CLAUDE.md § 2.8).

---

## Dependency Graph (blast radius map)

```
manifest.json ───changes touch every layer (load-time fatal if invalid)
    │
    ├──▶ background.js   (permissions/scopes/oauth2/host_permissions)
    ├──▶ content.js      (content_scripts.matches)
    ├──▶ popup.html      (action.default_popup)
    └──▶ keyboard cmds   (commands.trigger-export)

background.js ◀──── content.js, popup.js, picker-host.js (all senders)
    Changes to a message action MUST update every sender.
    Changes to upload error format are surfaced in content.js's toasts.

content.js ──▶ converter.js  (calls window.convertChatGPTToDocx)
content.js ──▶ background.js (sendMessage)
content.js ──▶ styles.css    (every .cgd-* class must exist in styles.css)
    A new .cgd-* class added here → must add CSS rule (light + dark).

popup.js ──▶ background.js (no — popup is settings-only currently)
popup.js ──▶ chrome.storage.local
    Changes to storage keys read here must match writes in content.js.

converter.js — leaf. No imports. Anything depending on it imports via window.*.

styles.css — leaf. Consumed by content.js and popup.html (popup uses inline).
```

### "If I touch X, what else must I check?"

| You change…                              | Check also…                                                                |
|------------------------------------------|----------------------------------------------------------------------------|
| `manifest.json` permissions/scopes       | OAuth re-consent for existing users; Web Store review risk; `BUGS.md` ent. |
| `manifest.json` content-script `matches` | `isChatGPT/isGemini/isClaude` detection in `content.js`                    |
| Storage key name                         | every `chrome.storage.local.{get,set}` call in `content.js` and `popup.js` |
| Message action name                      | every `sendMessage` and every `onMessage.addListener` branch               |
| Window size in `chrome.windows.create`   | EVERY call site (`background.js` AND `popup.js`) — they drifted before     |
| `chrome.windows.create` flags            | macOS fullscreen behavior (BUG-010); test on macOS                         |
| Drive query string                       | `'root' in parents` returns empty for nested folders (CLAUDE.md § 2.5)     |
| `cgd-pk-*` class                         | `.cgd-pk-*` rule + `.cgd-pk-card.cgd-dark .cgd-pk-*` rule both required    |
| `_pickDriveFolder()` flow                | `outsideClickHandler` in `_buildSelectPanel` (BUG-015 lives here)          |
| Save path for `lastExports`              | display-path dedup in `_buildSelectPanel` (BUG-016)                        |
| `extractMarkdown` / `processNode`        | math regression on all 3 platforms (BUG-002)                               |
| Button injection selector                | live page DOM on the affected platform (BUG-003, BUG-011)                  |
| `oauth2.client_id`                       | the matching extension ID in Google Cloud Console (BUG-005)                |

---

## State Locations

| Where                        | Key / variable             | Written by                                | Read by                              |
|------------------------------|----------------------------|-------------------------------------------|--------------------------------------|
| `chrome.storage.local`       | `exportDest`               | popup.js, content.js (panel toggle)       | content.js, popup.js                 |
| `chrome.storage.local`       | `defaultExportMode`        | popup.js                                  | content.js (`triggerDefault`)        |
| `chrome.storage.local`       | `customFolderId`           | content.js (`_pickDriveFolder.btnSel`), picker-host.js | background.js (`getOrCreateExportFolder`), popup.js (display) |
| `chrome.storage.local`       | `customFolderName`         | same writers                              | popup.js, content.js                 |
| `chrome.storage.local`       | `exportFolderId`           | background.js (`getOrCreateExportFolder`) | background.js                        |
| `chrome.storage.local`       | `lastExports`              | content.js (post-upload)                  | content.js (panel build)             |
| `chrome.storage.local`       | `globalRecentDocs`         | content.js                                | content.js                           |
| `chrome.storage.local`       | `pickerState`              | picker-host.js (legacy)                   | content.js (legacy listener)         |
| In-memory (content.js IIFE)  | `exportDest`               | onChanged listener                        | every export call                    |
| In-memory (content.js IIFE)  | `_imgCaptures`, `_imgIdx`  | `processNode` (image markers)             | `_captureImages`, `exportMarkdown`   |
| DOM                          | `.cgd-export-btn`          | button injection                          | MutationObserver dedup (presence)    |
| DOM                          | `.cgd-panel`               | `showSelectPanel`                         | `outsideClickHandler`, `close()`     |
| DOM                          | `.cgd-pk-overlay`          | `_pickDriveFolder`                        | `outsideClickHandler` short-circuit  |

**Rules:**
- A storage key written in one file must be read with the EXACT same string elsewhere. Typos = silent.
- A storage shape change (e.g., `lastExports` going from object to array) must include a one-pass migration in the read path that handles both shapes.
- In-memory state inside the `content.js` IIFE persists for the page's lifetime; cross-page state must use `chrome.storage`.

---

## Permissions Map

| `manifest.json` field                          | Why it's there                                          | Code that uses it                                      |
|-----------------------------------------------|---------------------------------------------------------|--------------------------------------------------------|
| `permissions: identity`                        | OAuth via `chrome.identity.getAuthToken`               | `background.js` (`getAuthToken`); `popup.js` pre-auth  |
| `permissions: storage`                         | All settings + recents persistence                      | content.js, background.js, popup.js                    |
| `permissions: downloads`                       | Local `.docx` save                                     | `background.js` (`downloadLocal` action)               |
| `host_permissions: googleapis.com/*`          | Drive multipart upload, files.list, Docs batchUpdate   | `background.js` (every API call)                        |
| `host_permissions: docs.googleapis.com/*`     | Docs API append (separate origin)                      | `background.js` (`appendContent`)                       |
| `optional_host_permissions: <all_urls>`       | Image fetch fallback (CORS bypass via background)      | `background.js` (`fetchImageAsBase64`)                  |
| `oauth2.client_id`                             | Identifies extension to Google's OAuth                 | implicit (used by `chrome.identity`)                    |
| `oauth2.scopes: drive.file`                    | Upload + list + append files this extension created    | every Drive/Docs call                                   |
| `commands.trigger-export`                      | Cmd/Ctrl+Shift+E global shortcut                       | `background.js` `chrome.commands.onCommand`             |
| `content_scripts.matches: chatgpt.com, gemini.google.com, claude.ai` | Inject content.js + converter.js on these | `content.js`, `converter.js`                           |
| `action.default_popup: popup.html`             | Toolbar-icon click → popup                             | `popup.js`                                              |

**Audit reminder:** if a permission has no code that uses it, REMOVE it. Bloat = consent friction + Web Store review risk.
