# IDEAS.md — Deferred Observations & Future Work

Items logged here instead of fixing inline. Each entry: date, file:line, observation.

---

## Pending Bugs (confirmed, needs fix in future version)

### IMAGE-001 — Claude image search results: third-party images export as URL references, not embedded
**Date:** 2026-05-13
**Updated:** 2026-05-14 (v4.2.0)
**Status:** Partially fixed. Text description now exports correctly. Images from third-party domains (stockcake.com etc.) appear as `![alt](url)` markdown links in the export — CORS prevents direct embedding. Only images served from `anthropic.com` / `claude.ai` can be embedded.
**Limitation:** External CDN images are CORS-blocked; cannot embed without server-side proxy (out of scope).
**Files:** `content.js` (`extractMarkdown`)

### IMAGE-002 — ChatGPT DALL-E image-only conversation: "no chats found" in panel / button detection still unreliable
**Date:** 2026-05-13
**Status:** Fixed in v4.2.0 — `getAllAIMessages()` now includes DALL-E turns (turns with action bar but no `[data-message-author-role="assistant"]`) via a supplementary pass.
**Files:** `content.js` (`getAllAIMessages`)

---

## Future Feature Ideas

### FEATURE-001 — Text selection export (context menu)
**Date:** 2026-05-13
**Status:** Implemented in v4.2.0. Right-click selected text → "Export to Docs" → uses `window.getSelection()` + existing `exportMessage()` pipeline.
**Files:** `manifest.json` (contextMenus permission), `background.js` (menu create + click handler), `content.js` (exportSelection message handler)

### FEATURE-003 — Export Word (.docx) / PowerPoint (.pptx) directly to Google Drive
**Date:** 2026-05-21
**Source:** User feedback form (user 1)
**Request:** "The ability to export PowerPoint and Word docs directly to Google Drive" — currently extension uploads as Google Docs format only; local .docx download is separate.
**Approach:** Drive API supports uploading .docx without conversion (omit `mimeType: 'application/vnd.google-apps.document'` in metadata). Would need a new export destination option in settings.
**Out of scope for v4.2.0.**

### FEATURE-004 — Notion / Obsidian integration (Pro tier concept)
**Date:** 2026-05-21
**Source:** User feedback form (user 2) — most-wanted Pro feature; willing to pay $5–10/month
**Request:** Export directly to Notion pages or Obsidian vaults in addition to Google Docs.
**Approach:** Notion API (official); Obsidian via local REST plugin or file system access. Both would require backend or desktop-app-level access — significant scope expansion.
**Out of scope for v4.2.0. Revisit if pursuing a Pro/paid tier.**

### FEATURE-002 — Full Drive file search for "Append to"
**Date:** 2026-05-13
**Request:** User wants to append to any existing Google Drive file, not just recent chips.
**Approach:** Google Picker API (shows all Drive files without needing wider scope). Complex — requires loading Picker API JS and handling the picker overlay. Targeted for v4.3.0.
**Note:** `drive.file` scope + `files.list` returns only extension-created files. Full search requires Picker API.
**Files:** `content.js` (panel), `background.js` (Drive API)
