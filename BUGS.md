# BUGS.md — Institutional Memory

A running ledger of every non-trivial bug fixed in this project. Search this file by symptom **before** diagnosing a new bug.

**Protocol:**
- Before fixing: `grep -i "<symptom keyword>" BUGS.md`. If a match exists, read that entry first. Do not silently re-apply a fix.
- After fixing: append a new `BUG-NNN` entry below. Use the next free number.
- Each entry pairs with one or more steps in `TESTING.md` § Regression Tests.

---

### BUG-001: Manifest missing `identity` permission, no OAuth config
**Date:** 2026-04-20
**Symptom:** Drive upload throws auth errors / OAuth never triggers.
**Root cause:** Initial `manifest.json` shipped without `permissions: ["identity"]`, no `oauth2` block, no host permissions for `googleapis.com`.
**Fix:** Added `identity` + `storage` permissions, `oauth2.client_id` + `scopes`, `host_permissions` for `https://www.googleapis.com/*` (commit `615b198`).
**Lesson:** MV3 OAuth requires three things in concert — `identity` permission, `oauth2` block (with the matching client_id from Google Cloud Console), and host permissions for the API origin. Missing any one is silent.
**Related files:** `manifest.json`, `background.js`.

---

### BUG-002: KaTeX math equations rendered twice
**Date:** 2026-04-21
**Symptom:** Exported `.docx` shows the same equation twice in a row.
**Root cause:** `directExtractWithMath()` walked descendants without skipping subtrees already processed by an ancestor; KaTeX has multiple inline annotations (`.katex-mathml annotation`, `.katex-display`, `<math>` element) which all matched, so a single equation was extracted by multiple strategies.
**Fix:** Rewrote with an `ancestor-set` skip-list; tightened Strategy 3 to use `:scope > .katex-mathml annotation` only (commit `0800d10`).
**Lesson:** When walking the DOM with multiple "fallback" extraction strategies, always carry a "subtree already handled" set to avoid double-counting. New strategies must opt into this set.
**Related files:** `content.js` (`processNode`, `directExtractWithMath`).

---

### BUG-003: Export button placement wrong on all three platforms
**Date:** 2026-04-21
**Symptom:** Button injected too far right, after the "more options" three-dots, or floating above the action bar.
**Root cause:** Each platform's action bar uses different markers — ChatGPT uses `data-testid` (not `aria-label`), Gemini puts the copy button in a separate row, Claude wraps copy buttons inside code blocks too.
**Fix:** Per-platform `findXxxActionBar` + `insertBeforeMoreButton` that walks up from the copy button to confirm the bar contains the more-button before insertion (commits `4500264`, `331fcbb`, `a9c38f4`, `c151578`).
**Lesson:** Don't write platform DOM selectors from memory. Inspect the live page for the current task. Add the new selector to CLAUDE.md § 5 if it's stable.
**Related files:** `content.js` (`addChatGPTButtons`, `addGeminiButtons`, `addClaudeButtons`, `findChatGPTActionBar`, `findGeminiActionBar`, `insertBeforeMoreButton`).

---

### BUG-004: Drive upload triggered "App security" warning on Google's consent screen
**Date:** 2026-04-30
**Symptom:** Users saw a yellow Google warning during OAuth consent, dropped off without authorizing.
**Root cause:** Manifest requested `https://www.googleapis.com/auth/documents` even though the app no longer used the Docs API for document creation (only for `appendToDoc`, which works fine with `drive.file`).
**Fix:** Removed `documents` scope (commit `602a16b`).
**Lesson:** Every scope is a tax — review-friction tax (Web Store), consent-friction tax (users), re-consent tax (existing users when scope changes). Audit scopes vs. actual API calls regularly. **See CLAUDE.md § 2.1.**
**Related files:** `manifest.json`.

---

### BUG-005: Drive auth fails for shipped users but works in dev
**Date:** 2026-04-30
**Symptom:** `getAuthToken` returns "could not sign in" for production extension users; works locally.
**Root cause:** `manifest.json` `oauth2.client_id` was set to the development extension's client ID. The production extension has a different ID in the Web Store, requiring its own client_id in Google Cloud Console.
**Fix:** Bumped to v3.9.1 with corrected production client_id (commit `791cae3`).
**Lesson:** Test extension ID and production extension ID are different. Each needs its own OAuth client in Google Cloud Console with the correct extension ID registered. **Never edit `oauth2.client_id` casually** — see CLAUDE.md § 2.8.
**Related files:** `manifest.json`.

---

### BUG-006: Sandbox CSP rejected by Chrome — extension fails to load
**Date:** 2026-04-30
**Symptom:** `chrome://extensions/` shows "Could not load manifest. Invalid value for 'content_security_policy'."
**Root cause:** `content_security_policy` was placed inside the `sandbox` object instead of at the top level. MV3's schema requires `content_security_policy.sandbox` (a sibling of `permissions`, etc.), and the `sandbox` object only takes `pages: [...]`.
**Fix:** Moved CSP to top level (commit `95fb1a4`).
**Lesson:** Manifest V3 has surprising structural rules. After any manifest edit: `python3 -m json.tool` then load the unpacked extension before claiming the change works.
**Related files:** `manifest.json`.

---

### BUG-007: Folder picker shows only "AI Chat Exports", not user's actual folders
**Date:** 2026-04-30
**Symptom:** Custom picker lists exactly one folder (the auto-created one), regardless of how many folders the user has.
**Root cause:** `drive.file` scope restricts `files.list` to files the extension itself created or opened. User-created folders are invisible to it.
**Fix initially attempted:** Add `drive.metadata.readonly` scope. **Wrong direction** — that's a sensitive scope and triggers Web Store review.
**Correct fix (current):** Use Google Picker API for folder browsing (no extra scope needed) — see commit `31ae17e`. Picker UI was ultimately replaced with an in-page modal that calls Drive API directly under whatever scope is granted; production must reinstate Picker if the metadata scope is removed.
**Lesson:** "Empty list" from `drive.file` is a scope semantics issue, not a bug in the query. Don't widen scope to fix. **Pitfall B in CLAUDE.md.**
**Related files:** `background.js` (`listFolders`), `manifest.json`, `picker-host.js`.

---

### BUG-008: Picker window stuck at "Loading…" forever
**Date:** 2026-04-30
**Symptom:** User clicks the Drive button, picker window opens but never shows the folder list. No error, no progress.
**Root cause:** Picker page called `chrome.identity.getAuthToken({ interactive: true })` on load. When the auth token isn't already cached, the OAuth callback never fires for windows opened via `chrome.windows.create`, so the picker hangs.
**Fix:** Pre-auth in background (or popup) BEFORE opening the picker window. Picker uses `interactive: false` only — token is already cached by the time it loads (commit `ddf1b7c`).
**Lesson:** Interactive OAuth from extension-spawned windows is unreliable. The reliable contexts are background service worker and popup pages (with user gesture). **Pitfall A in CLAUDE.md.**
**Related files:** `background.js` (`ensureAuth`), `content.js` (`_pickDriveFolder`), `popup.js`, `picker-host.js`.

---

### BUG-009: Picker window opens at center of screen instead of next to browser
**Date:** 2026-05-01
**Symptom:** Picker pops up in the middle of the primary monitor, not over the browser.
**Root cause:** Used `chrome.windows.getLastFocused()` which returns `(0,0)` on macOS for some window states, leading to (0,0) positioning.
**Fix:** Content script passes its own `window.screenX/Y/outerWidth/outerHeight` in the `openPickerWindow` message; background uses those directly (commit `821e98a`).
**Lesson:** The content script knows its own window's actual screen position. Don't ask Chrome's windows API across processes when the originator already has the answer.
**Related files:** `background.js`, `content.js`, `popup.js`.

---

### BUG-010: Picker window goes fullscreen on macOS, ignoring `width`/`height`
**Date:** 2026-05-02
**Symptom:** Picker fills the entire screen instead of opening at 480×560.
**Root cause:** When Chrome itself is in macOS native fullscreen, `chrome.windows.create` ignores `width`, `height`, `state: 'normal'`. There is no reliable workaround.
**Fix:** Replaced separate window with an in-page `position: fixed` modal overlay (`.cgd-pk-overlay` + `.cgd-pk-card`) injected into the host page. Bypasses all Chrome window management.
**Lesson:** When the platform's window API lies, escape to the page. In-page modals are also faster (no new window load) and respect host dark mode. **Pitfall I in CLAUDE.md.**
**Related files:** `content.js` (`_pickDriveFolder`), `styles.css` (`.cgd-pk-*`).

---

### BUG-011: ChatGPT button appears AFTER the three-dots menu instead of before
**Date:** 2026-04-21
**Symptom:** Export button is the rightmost icon in ChatGPT's action bar, instead of sitting between Copy and "more options."
**Root cause:** `insertBeforeMoreButton` selector was `[aria-label*="more"]`; ChatGPT actually marks the three-dots with `data-testid="more-options-turn-action-button"`.
**Fix:** Added `data-testid*="more"` to the selector; also walk up from the copy button to confirm the bar actually contains a three-dots before inserting (commit `c151578`).
**Lesson:** Platform DOM markers vary — `aria-label`, `data-testid`, class names. Verify on the live page; don't assume.
**Related files:** `content.js`.

---

### BUG-012: Append-mode Pick panel never appears
**Date:** 2026-05-01
**Symptom:** From a recent-chip's `[+↩]` dropdown, clicking "Pick responses" closed the existing panel without opening the append panel.
**Root cause:** `showSelectPanel` had a "toggle close" guard at the top: if a panel already existed, it was removed and the function returned. That guard fired even when the call was for append mode.
**Fix:** Toggle-close only in normal mode; append mode (`appendTarget != null`) continues to build the panel (commit `4ad2645`).
**Lesson:** Toggle-style guards must check the current call's intent, not just "is a panel open."
**Related files:** `content.js` (`showSelectPanel`).

---

### BUG-013: Append dropdown invisible in dark mode
**Date:** 2026-05-01
**Symptom:** `cgd-append-drop` dropdown appears as a white-on-white blob on dark sites.
**Root cause:** Hardcoded `#fff` background and `#333` text; no `.cgd-dark` rule.
**Fix:** Added `.cgd-append-drop.cgd-dark` rules in `styles.css`; constructor wires `isDarkMode()` (commit `4ad2645`).
**Lesson:** Every new in-page UI element must use the existing `cgd-dark` pattern. Walk through `isDarkMode()` consumers before adding a new colored element.
**Related files:** `content.js` (`_showAppendDropdown`), `styles.css`.

---

### BUG-014: Sandbox manifest invalid — `blob:` and `data:` rejected
**Date:** 2026-05-01
**Symptom:** Chrome rejects manifest with `Invalid value for 'content_security_policy.sandbox'`.
**Root cause:** Sandbox CSP included `blob:` and `data:` in `script-src`. MV3 forbids both.
**Fix:** Removed both; added `allow-popups` to the sandbox flag set for OAuth popups (commit `9ca5179`).
**Lesson:** Don't copy CSP fragments from web app contexts — extension MV3 has stricter rules. **Pitfall C in CLAUDE.md.**
**Related files:** `manifest.json`.

---

### BUG-015: Panel closes immediately after picker Select
**Date:** 2026-05-02
**Symptom:** User clicks Select in the folder picker; folder is saved correctly, but the export panel disappears, forcing the user to re-open it before they can hit Last/Full.
**Root cause:** `outsideClickHandler` ran on the bubbling click event. The picker's Select handler called `chrome.storage.local.set(..., () => finish('done'))` — `finish` (which removes the overlay) was inside the async callback. Meanwhile the click was still bubbling to `document`. At that moment the overlay was still in the DOM and the click target was the Select button; `panel.contains(button)` was false → handler closed the panel.
**Fix:** `outsideClickHandler` now early-returns if `e.target.closest('.cgd-pk-overlay')` is truthy (click is inside the picker modal) AND if `!document.body.contains(e.target)` (target was already removed). Both checks are necessary — Cancel removes synchronously, Select removes async.
**Lesson:** Async storage callbacks change event timing. When any DOM-removing action is wrapped in an async callback, outside-click handlers must defend against the "still in DOM at bubble time" case explicitly. **Pitfall F in CLAUDE.md.**
**Related files:** `content.js` (`outsideClickHandler`, `_pickDriveFolder.btnSel`).

---

### BUG-016: Recent docs chips show duplicate entries
**Date:** 2026-05-02
**Symptom:** Two chips appear with the same filename ("Quadratic_Formula_Prac…", "Quadratic_Formula_Prac…") for what looks like the same file.
**Root cause:** Each Drive upload creates a new Doc with a fresh `fileId`, even when the auto-generated filename is identical. Save-path dedup was filtering only by `fileId`, so two exports of the same response produced two entries with same name + different IDs. Display path also only deduped by `fileId`.
**Fix:** Both save path (`lastExports`, `globalRecentDocs`) and display path now dedup by **both** `fileId` and `fileName`.
**Lesson:** "Same logical doc" in this app is identified by filename, not just `fileId`. Drive doesn't deduplicate filenames. **Pitfall G in CLAUDE.md.**
**Related files:** `content.js` (around save-on-upload, `_buildSelectPanel` recents construction).

---

### BUG-017: Folder picker showed flat list of every folder
**Date:** 2026-05-02
**Symptom:** Users with 50+ folders couldn't find the right one in an alphabetical wall of names.
**Root cause:** `listFolders` fetched ALL folders flat. The picker had no concept of hierarchy.
**Fix:** Picker now navigates hierarchically — starts at My Drive (`'root' in parents`), each click on a folder drills into it, breadcrumb at top is clickable to go back. Search reverts to a flat global search across all folders. `background.js` `listFolders` and `createFolder` now accept a `parentId` parameter.
**Lesson:** Match the user's mental model. They navigate folders the way they do in Drive's own UI; flat alphabetical isn't a folder picker, it's a cruel joke at scale.
**Related files:** `content.js` (`_pickDriveFolder`), `background.js` (`listFolders`, `createFolder`), `styles.css` (`.cgd-pk-breadcrumb`, `.cgd-pk-item-chevron`).

---

### BUG-018: Claude exports only the title, not the response body
**Date:** 2026-05-03
**Symptom:** User clicks Export on a Claude response. The resulting `.docx` contains only the metadata header (platform · date · title + MLA citation) and no actual response content.
**Root cause (verified via live-DOM diagnostic):** Claude's current design (chat-ui-core, Opus 4.7 era) uses **`font-claude-response`** as a generic styling token — `[class*="font-claude-response"]` matches **1416 elements** scattered across the entire page (CSS variable references, utility classes, etc.), not the AI response wrapper specifically. Our content selectors keyed off that pattern, so they returned the wrong (tiny) elements: the topmost match via `!parentElement?.closest()` filter ended up being a near-empty styling wrapper, not the response body. `processNode` then walked an almost-empty subtree → exported markdown was empty → only the prepended header survived.

The actual stable selector for Claude response content today is **`.standard-markdown`** (49 matches on a 49-message page — exactly one per response). `.prose` has been removed entirely (0 matches).

**Fix:**
  1. `_claudeFindResponses()` now uses `.standard-markdown` as primary; falls back to walking up from non-code-block Copy buttons to find the nearest ancestor containing a `.standard-markdown` descendant.
  2. `extractMarkdown` Claude branch keys off `.standard-markdown` first.
  3. `addClaudeButtons` walks up from the action bar to find the nearest `.standard-markdown` instead of the broken pattern; click handler runs against `.standard-markdown` directly.
  4. Defense-in-depth fallbacks added in `extractMarkdown`: if walk yields < 20 chars trimmed, retry with `messageEl` itself, then walk up looking for an ancestor with substantial text, then fall back to `textContent`.

**Lesson — TWO important ones:**
  - **Don't trust `[class*="..."]` on Tailwind/utility-class apps.** Generic substrings will match hundreds of unrelated elements. Always confirm the match count with a console diagnostic before shipping a substring selector.
  - **Live-DOM diagnostic is faster than guessing.** A 14-line console one-liner (walk up from a known anchor, log textLen + class at each level) pinpoints the right selector in seconds. See the diagnostic snippet in this session's transcript for the template.

**Related files:** `content.js` (`extractMarkdown`, `_claudeFindResponses`, `addClaudeButtons`, `getLastAIMessage`, `getAllAIMessages`, `exportFullConversation`).

---

### BUG-019: Gemini AI-generated images not exported — shadow DOM traversal no-op
**Date:** 2026-05-21
**Symptom:** Exporting a Gemini response containing AI-generated images produced text-only Google Docs. No `[[IMG:N]]` placeholder in markdown, no `(Image: url)` fallback text — the image element was never discovered.
**Root cause:** `_deepQueryAll(root, 'img')` had `if (!node || node.nodeType !== 1) return`. When the function called `walk(node.shadowRoot)`, it passed a DocumentFragment (nodeType 11). The guard treated 11 as an invalid node type and returned immediately — silently no-op'ing on every shadow root without error. Gemini's `single-image` custom element (Polymer) keeps `<img class="hero-image">` inside an open `#shadow-root`, so it was unreachable.
**Fix (content.js):**
- Restructured `_deepQueryAll`: Element (1) → call `matches` + recurse into `shadowRoot`; DocumentFragment (11) / Document (9) → skip `matches` but iterate `.children`; all other nodeTypes → return early.
- Added `_deepContains(root, node)`: composed-tree containment via `getRootNode().host` chain, because `element.contains()` does not cross shadow boundaries.
- Added `_getImageSrc(imgEl)`: checks `currentSrc`, `src`, `dataset.src`, `dataset.originalSrc`, `srcset` — handles lazy-loaded and srcset-only images.
- Added `_addImageCapture(imgEl, alt)`: consolidates dedup + push + `[[IMG:N]]` generation.
- Added `_isLikelyGeminiGeneratedImage(imgEl)`: class name + CDN host + size heuristic, used by page-wide defensive fallback scan.
- Tiny-text retry guard (line ~414): `!md.includes('[[IMG:')` prevents overwriting markdown that already has captured image placeholders.

**Fix (background.js):** `fetchImageAsBase64` fetch gets `{ credentials: 'include' }` for session-protected image URLs.

**Lesson — shadow DOM traversal:**
1. `shadowRoot` is a DocumentFragment (nodeType 11), not an Element (nodeType 1). Any `nodeType !== 1` guard will silently block shadow DOM traversal.
2. Mental test: if your `walk()` receives `node.shadowRoot`, will it proceed? If your guard is "only continue for nodeType 1", the answer is no.
3. Map symptoms to pipeline stages before guessing at selectors: "no `[[IMG:N]]`" means discovery failed; "`(Image: url)` text appears" means discovery succeeded but capture failed; "embedded image" means full success.
4. `element.contains(shadowChild)` returns false — use composed-tree traversal (`getRootNode().host`) for containment checks across shadow boundaries.

**Related files:** `content.js` (`_deepQueryAll`, `_deepContains`, `_getImageSrc`, `_addImageCapture`, `_isLikelyGeminiGeneratedImage`, `extractMarkdown` Gemini block). **Pitfall J in CLAUDE.md.**

---

### BUG-020: Bengali math exports `^5C_2` literal text and `^^` separators
**Date:** 2026-05-22
**Symptom:** User-reported (Bengali feedback form): exporting a Gemini math response containing combination notation (⁵C₂) and fractions produced `^5C_2 × ^3C_1` as literal text in the Google Doc, plus `^^` appearing as paragraph-level separators.
**Root cause (two independent issues):**
1. `extractTeX()` returned raw LaTeX like `^5C_2` (combination notation where `^` is the first character, with no preceding base atom). `converter.js`'s OMML parser requires a base atom before `^`; without one it fails and falls back to literal text. The literal `^5C_2` doesn't match the closing-`^` regex `\^[^^]+\^` in converter.js, so it passes through verbatim.
2. `processNode` line 304: `<sup></sup>` (empty superscript element) produced `^^` because `getInner(node)` returned `''`, yielding `` `^${''}^` `` = `^^`. Same issue with `<sub></sub>` → `~~`.
**Fix (content.js):**
- Added `normalizeTeX(tex)`: prepends `{}` when `tex` starts with `^` or `_`, making `^5C_2` → `{}^5C_2` (valid LaTeX pre-superscript / combination notation).
- Wired `normalizeTeX` into all four return paths in `extractTeX()`.
- Guarded `processNode` sup/sub handlers: return `''` when inner content is empty instead of `^^` / `~~`.
**Lesson:** LaTeX starting with `^` or `_` is valid LaTeX (pre-superscript, e.g. `{}^nC_r` in combination notation) but requires an explicit empty base `{}` for OMML parsers. Always normalize before passing to converter. Empty inline-formatting wrappers (`<sup></sup>`) silently produce artifact characters; guard the inner-content check.
**Related files:** `content.js` (`extractTeX`, `normalizeTeX`, `processNode` lines 303–304).

---

### v1.0 release changes (2026-05-02) — not bugs, but big context shifts

These are **deliberate** changes for the Web Store v1.0 launch. Documented here so future sessions see the rationale instead of "fixing" them back.

- **Folder picker REMOVED.** Reason: the picker required `drive.metadata.readonly`, a sensitive scope that triggers Google's OAuth verification process and blocks Web Store launch. Path A: drop the picker entirely; always export to `AI Chat Exports/<Platform>/`. Path B (post-launch): restore via Google Picker API. See memory entry `path_b_picker_api.md`.
- **Dead picker files DELETED.** `picker-host.html`, `picker-host.js`, `picker-sandbox.html`, `picker-sandbox.js` removed in v1.0 cleanup.
- **OAuth scope shrunk** to only `drive.file`. `drive.metadata.readonly` removed.
- **Storage keys removed:** `customFolderId`, `customFolderName`, `pickerState` are no longer written by anything. `background.js` `getOrCreateExportFolder` clears the first two on every export for legacy users.
- **New storage key:** `exportFolderIds = { ChatGPT, Gemini, Claude }` — per-platform subfolder IDs under `exportFolderId` (see `ARCH.md` state map).
- **Citation (MLA) now in header.** Auto-appended to every export's italic header so the citation survives appends.
- **Markdown `.md` export added** as a third destination. Skips the `.docx` converter entirely; downloads raw markdown via `downloadLocal` action with `mime: 'text/markdown;charset=utf-8'`.
- **i18n added** for popup only. `_locales/en/messages.json` + `_locales/zh_CN/messages.json`. Chrome auto-detects browser locale. Other surfaces (toast, panel, etc.) remain English-only for v1.0.
- **Auto-organize folders** by platform: every Drive upload now lands in `AI Chat Exports/<ChatGPT|Gemini|Claude>/`.

## How to add a new entry

```markdown
### BUG-NNN: [≤8-word title]
**Date:** YYYY-MM-DD
**Symptom:** What the user / developer observed (verbatim if possible).
**Root cause:** The actual underlying issue.
**Fix:** What changed (file + brief description, commit SHA if available).
**Lesson:** Pattern to recognize next time.
**Related files:** [list].
```

If the lesson generalizes to a new red line, also add it to `CLAUDE.md` § 2 or § 3.

---

## v4.3 planned features

### High priority
1. **PDF/citation artifact fix** — Gemini DOM extraction produces `^^` and drops citation text when AI cites sources inline. Root cause: `<sup>` citation markers in Gemini DOM. Queued since v4.2.
2. **Uninstall feedback URL** — `chrome.runtime.setUninstallURL()` pointing to a Google Form asking "why did you uninstall?"
   - Industry standard pattern
   - 10 uninstalls/day on 5/26 = reliable signal source
   - ~30 min implementation in background.js
