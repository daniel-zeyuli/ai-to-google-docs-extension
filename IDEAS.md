# IDEAS.md — Deferred Observations & Future Work

Items logged here instead of fixing inline. Each entry: date, file:line, observation.

---

## Pending Bugs (confirmed, needs fix in future version)

### CHATGPT-001 — DALL-E/image-generation responses likely have no export button at all (post-BUG-033 DOM)
**Date:** 2026-10-04
**Status:** Confirmed broken by code read, NOT fixed — no live DOM data to fix it from.
**Root cause:** `addChatGPTButtons`'s dedicated pass for image-generation turns (`document.querySelectorAll('[data-testid="good-image-turn-action-button"]')`) and the catch-all third pass are both still keyed entirely off `data-testid`/`data-message-author-role`, which BUG-033 confirmed ChatGPT removed site-wide. Both passes now query against attributes that don't exist, so they silently process zero turns. Text responses are unaffected (fixed via `_chatGPTFindResponses()` in BUG-033/045), but a response that's *just* a generated image, with no markdown text, likely gets no button injected by any pass.
**Why not fixed now:** Every other post-BUG-033 fix this session had an anchor to reason from — a landmark found in live diagnostics (`turn-action-controls`, `data-markdown-text-style`, the `h4[data-conversation-role]` symmetry guess). There is no equivalent for the image-generation case; nobody has inspected the live DOM of a ChatGPT image response since the redesign. Guessing a selector with zero anchor risks writing something confidently wrong rather than admitting the gap.
**Next step:** Generate an image with ChatGPT, inspect the response's action bar (right-click the download/regenerate button → Inspect → Copy outerHTML, same method that worked for BUG-033/036), and hand that over before attempting a fix.
**Related files:** `content.js` (`addChatGPTButtons` — "Second pass: DALL-E" and "Third pass: catch-all").

### IMAGE-001 — Claude image search results: third-party images export as URL references, not embedded
**Date:** 2026-05-13
**Updated:** 2026-10-07 — real root cause found; maintainer deprioritized the fix
**Status:** Won't-fix for now (maintainer call, low frequency). Text description exports correctly; the image itself falls back to the existing `(Image: url)` text reference (`content.js:711`) instead of being embedded.
**Real root cause (confirmed 2026-10-07):** `_ensureImageFetchPermission()` (`content.js` ~line 181) calls `chrome.permissions.contains()`/`.request()` directly from a content script. Per Chrome's own docs, content scripts only have direct access to `chrome.dom`/`chrome.i18n`/`chrome.storage`/a subset of `chrome.runtime` — `chrome.permissions` is not among them, so the call throws and is silently swallowed by the surrounding try/catch, meaning the optional `https://*/*` permission is never actually granted. This only matters for images on domains NOT already in `host_permissions` — ChatGPT (`*.oaiusercontent.com`) and Gemini (`*.googleusercontent.com`) are already covered and unaffected; Claude/Perplexity frequently reference truly arbitrary third-party image domains that can't be pre-declared, so they're the ones that hit this path.
**Why not fixed:** The only context where `chrome.permissions.request()` both exists AND satisfies Chrome's user-gesture requirement is a popup-page click handler (background.js has the API but loses the gesture across the async `sendMessage` hop — same class of issue as the project's existing service-worker lesson). Fixing this needs a dedicated "enable image export" button in `popup.html` plus a storage flag content.js checks before attempting the fetch. Maintainer assessed image-export frequency as low and chose to keep the current graceful text-link fallback rather than add that extra UI step.
**Files:** `content.js` (`_ensureImageFetchPermission`, `_captureImages`, `extractMarkdown`), `popup.html`/`popup.js` (if revisited).

### IMAGE-002 — ChatGPT DALL-E image-only conversation: "no chats found" in panel / button detection still unreliable
**Date:** 2026-05-13
**Status:** Fixed in v4.2.0 — `getAllAIMessages()` now includes DALL-E turns (turns with action bar but no `[data-message-author-role="assistant"]`) via a supplementary pass.
**Files:** `content.js` (`getAllAIMessages`)

### PLATFORM-001 — Re-enable DeepSeek and Perplexity once selectors are verified stable
**Date:** 2026-09-19
**Resolved:** 2026-09-28
**Status:** RESOLVED — shipping in this release. `chat.deepseek.com` / `perplexity.ai` restored to `manifest.json` `content_scripts.matches` after a full bug-fix and live-verification cycle: BUG-027 (duplicate buttons), BUG-028 (localized/out-of-scope action bar detection), BUG-029 (DeepSeek panel outside-click), BUG-030/031 (button silently removed by host page re-renders), and BUG-032 (DeepSeek extraction root) were all found, fixed, and verified live by the maintainer. Button placement lands reliably on the right side of the response area on both platforms but is not pixel-aligned with the native action bar — maintainer has accepted this as good enough (see BUG-028's verification note).
**Store disclosure:** Ship with a "beta" mention in the store listing's "What it does" and "What's new" sections per the original plan — do not add to the extension name or short summary; main platforms (ChatGPT, Gemini, Claude) stay front and center there.
**Files:** `manifest.json`, `content.js`.

### ADOBE-001 — Browser extension injected links (e.g. Adobe) get swept into the export
**Date:** 2026-10-07
**Status:** Not fixed — not even scoped yet.
**Observation:** When the user has a third-party browser extension (reported: an Adobe extension) active on the AI chat page, that extension injects its own links/UI into the page DOM. `extractMarkdown`'s DOM walk doesn't distinguish these from the AI platform's own content, so they get swept into the export — one reported case ballooned a single response into an 11-page document full of unrelated links.
**Why not fixed:** No generic way to distinguish "content injected by an unrelated browser extension" from legitimate page content without a specific DOM signature to anchor on (e.g. a known class/attribute the injecting extension uses). Maintainer considers this low priority / hard to generalize.
**Next step (if revisited):** Get the specific extension name + a DOM inspection of the injected markup to find an anchor to filter on.

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
