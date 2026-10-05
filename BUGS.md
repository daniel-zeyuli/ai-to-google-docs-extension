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

### BUG-021: ChatGPT export produces only metadata header (no body content)
**Date:** 2026-09-13
**Symptom:** Exporting a ChatGPT response (especially math-heavy ones) produced a Google Doc with only the italic metadata/citation header — the actual AI response text was missing.
**Root cause:** ChatGPT changed the markdown container class from a single `markdown` class to a compound Tailwind-style class (`markdown prose w-full break-words flex-col gap-y-1`). `querySelector('.markdown')` was an exact class-name match and returned `null`. The fallback `|| messageEl` used the raw `[data-message-author-role="assistant"]` container, which caused `processNode` to iterate the full message DOM including structure-only wrappers. This produced valid-looking extraction for plain text but failed silently for math content where the KaTeX elements were nested several levels deeper than the direct children of the message element.
**Fix:** Changed all 6 ChatGPT `.markdown` selectors in `content.js` to a three-step fallback chain: `.markdown` → `[class*="markdown"]` → `article` → messageEl. The `[class*="markdown"]` substring match catches the compound class name regardless of what other Tailwind classes are appended (commit following BUG-021).
**Lesson:** Never use exact `.className` selectors for platform DOM elements that use utility-class frameworks (Tailwind). ChatGPT, Perplexity, and others compose classes dynamically. Always use `[class*="keyword"]` as the first fallback. This pattern already existed for Claude (`.standard-markdown` → `[class*="markdown"]`) but was missed for the ChatGPT branch.
**Related files:** `content.js` (`extractMarkdown`, `getLastAIMessage`, `exportFullConversation`, `getAllAIMessages`, `addChatGPTButtons`). **BUG-018 has a similar lesson for Claude.**

---

### BUG-022: ChatGPT "Ask ChatGPT / Start writing" bar visually overlaps export button
**Date:** 2026-09-13
**Symptom:** ChatGPT's new contextual "Ask ChatGPT" / "开始写作" (Start writing) composition bar appears near AI responses and partially obscures the injected export button. The extension bar is partially visible but not fully accessible.
**Root cause:** Unknown — requires live DOM inspection on a ChatGPT page showing the bar. Hypothesis: ChatGPT injected a new floating or inline bar into the `role="group"` action container (or near it), which pushes our button out of the visible area, or overlaps it with a higher z-index element. This may also be related to ChatGPT's "Canvas" composition feature.
**Fix:** NOT YET FIXED — needs live DOM investigation. Steps: open ChatGPT, trigger the "Ask ChatGPT" bar, inspect the element hierarchy to find which container it belongs to and whether it collides with `div[role="group"][aria-label]`. Once identified, either: (a) filter out the new bar's container in `findChatGPTActionBar`, or (b) adjust button injection order (insert before the new bar, not after it).
**Lesson:** Any time ChatGPT ships a new inline feature (Canvas, composition bar, tool-use widgets), re-run `findChatGPTActionBar` in the console on a live page to verify it's still selecting the right element.
**Related files:** `content.js` (`findChatGPTActionBar`, `addChatGPTButtons`, `insertBeforeMoreButton`).

---

### BUG-023: ChatGPT complex/display math exports as raw LaTeX text with a stray "]"
**Date:** 2026-09-19
**Symptom:** Exporting ChatGPT responses containing display math (e.g. solving equations, calculus) to Notion/Obsidian produced numbered items like `2x^2+5x-3=0` and `\frac{3x+2}{x-1}=4` as plain text — no `$$...$$` wrapping — each followed by a stray `]` on its own line. Inline math and Claude exports were unaffected.
**Root cause:** Live DOM inspection showed ChatGPT's `span[role="math"]` wrapper (added for BUG's earlier Strategy 0b fix) has `data-math-source=""` — an empty string, which is falsy in JS, so Strategy 0b's `if (src)` check silently skipped it. The actual raw TeX source lives as a separate text node inside a sibling/nearby `<p dir="auto">` element, followed by `<br>` and a literal `]` text node (a ChatGPT-side rendering/accessibility artifact). `processNode`'s generic `<p>` handler had no knowledge of this pattern and just emitted the raw text nodes verbatim.
**Fix:** Added a targeted check in `processNode` before the generic `<p>` handler: if a `<p dir="auto">` ends with `<br>` followed by a lone `]` text node, and a `span[role="math"]` exists in the paragraph or its previous sibling, extract the text before the `<br>` as the TeX source and wrap it in `$$...$$` (or `$...$` for inline, detected via `.katex-display` presence).
**Lesson:** An empty string attribute (`data-math-source=""`) is falsy and silently bypasses `if (src)` guards — don't assume "attribute present" means "attribute has content" when a platform's DOM occasionally ships a placeholder/empty value during a rendering fallback state.
**Related files:** `content.js` (`processNode`).

---

### BUG-024: ChatGPT export button stuck in wrong location if injected while response was still generating
**Date:** 2026-09-19
**Symptom:** During active response generation (streaming), the export button appeared misplaced — off to the right on an earlier line, not next to the three-dot menu at the bottom. Reloading the page after generation finished fixed the placement, but waiting for generation to finish (without reloading) did not.
**Root cause:** `findChatGPTActionBar` returns `null` while a response is still streaming — ChatGPT hasn't rendered the copy/thumbs/more buttons yet (only a "Stop generating" control exists). `addChatGPTButtons` fell back to appending the button directly into the message content (`contentEl`) in that case. Once generation finished and the real action bar rendered, the existing `container.querySelector('.' + BUTTON_CLASS)` skip-check prevented the button from ever being re-evaluated or moved — it stayed stuck in the fallback spot until a full page reload re-ran the scan from scratch on settled DOM.
**Fix:** Buttons placed via the fallback path are now tagged with `dataset.cgdFallback = '1'` and wrapped in a `.cgd-fallback-wrapper` div. On every subsequent `addChatGPTButtons` pass (MutationObserver-triggered, ~200ms debounce), if a tagged button is found AND a reliable action bar (verified by checking for a `more`/`thumbs`/`copy` button inside it, not just any `div[role="group"]`) now exists, the same button element is relocated into it via `insertBeforeMoreButton` and the fallback wrapper/tag are removed.
**Lesson:** Any "inject now, else fall back" pattern keyed off a `container.querySelector('.' + BUTTON_CLASS)` skip-check needs a reconciliation path — otherwise a fallback placement made during a transient DOM state (streaming, still-loading) becomes permanent even after the real target renders.
**Related files:** `content.js` (`addChatGPTButtons`, `findChatGPTActionBar`).

---

### BUG-025: `https://*/*` shipped as a required host permission instead of optional
**Date:** 2026-09-19
**Symptom:** Chrome Web Store flagged the listing for in-depth review over broad host permissions. `manifest.json` had `https://*/*` in `host_permissions` (required, granted silently at install) instead of `optional_host_permissions` as `ARCH.md` already documented it should be. It was also the only thing making Notion export work, since `api.notion.com` was never listed explicitly, and it was masking a separate bug: `https://oaiusercontent.com/*` doesn't match subdomains like `files.oaiusercontent.com`, where ChatGPT actually serves images (`https://*.oaiusercontent.com/*` is required to match subdomains).
**Root cause:** Manifest drifted out of sync with the documented architecture — `ARCH.md` line 218 already specified `<all_urls>` as optional, but `manifest.json` never matched it. Nobody calls `chrome.permissions.request()` anywhere, so the "optional" grant, if it had been optional, would never have been requested — it just happened to already be present as a required permission, hiding both issues.
**Fix:** Moved `https://*/*` to `optional_host_permissions`. Added `https://api.notion.com/*` explicitly to `host_permissions`. Changed `https://oaiusercontent.com/*` to `https://*.oaiusercontent.com/*`. Added `_ensureImageFetchPermission()` in `content.js`, called lazily inside `_captureImages()` only when an image actually needs the cross-origin fetch fallback (Strategy 1 canvas capture already failed). This runs inside the user-gesture chain from the Export button click — **not** in `background.js`, since `chrome.permissions.request()` silently fails from a service worker (see `~/.claude/CLAUDE.md` Chrome Extension Notes).
**Lesson:** A documented "optional permission" design (in `ARCH.md`) is not the same as an implemented one — if the manifest still lists it as required and nothing ever calls `chrome.permissions.request()`, the docs are aspirational, not accurate. Check the manifest against the docs, not just the docs against memory. Also: MV3 host permission match patterns are exact-host by default — `example.com/*` does NOT cover `sub.example.com`; always use `*.example.com/*` unless you've confirmed the API is served from the bare domain.
**Related files:** `manifest.json`, `content.js` (`_captureImages`, `_ensureImageFetchPermission`), `ARCH.md`.

---

### BUG-026: DeepSeek/Perplexity export button lands bottom-right, not aligned with the native action bar
**Date:** 2026-09-27
**Symptom:** During re-verification of DeepSeek/Perplexity (pulled from the v4.3 release for instability — see PLATFORM-001), the export button consistently appeared at the bottom-right of the response content instead of next to the native copy/action buttons.
**Root cause:** Same class of bug as BUG-024, never ported to these two platforms. `addDeepSeekButtons`/`addPerplexityButtons` only looked for a copy button once per pass; during generation, no copy button exists yet (only appears once the response finishes), so the button was placed in a permanent fallback wrapper appended after the response content. Once the real copy/action bar rendered post-generation, nothing re-evaluated placement — the button-presence check (`container.querySelector('.' + BUTTON_CLASS)`) short-circuited all future passes, same as BUG-024's `container.querySelector` skip-check.
**Fix:** Extracted the copy-button walk-up into a shared `_findCopyActionBar(container)` helper. Both `addDeepSeekButtons` and `addPerplexityButtons` now tag fallback-placed buttons with `dataset.cgdFallback = '1'` wrapped in `.cgd-fallback-wrapper`, and relocate them into the real action bar once one renders — identical pattern to BUG-024's ChatGPT fix. Removed the now-redundant `resp.dataset.cgdInjected` flag; button presence in `container` is the single source of truth for "already handled."
**Lesson:** A fix for one platform's "provisional placement never gets corrected" bug does not automatically apply to structurally-similar platforms — each one needs the fix ported explicitly. When multiple platforms share near-identical button-injection code (as DeepSeek/Perplexity did, nearly copy-pasted), a bug found in one is very likely already present in the others; check all copies, not just the one that was reported.
**Related files:** `content.js` (`addDeepSeekButtons`, `addPerplexityButtons`, `_findCopyActionBar`).

**Note:** A related but separate symptom was also found during this same testing round — DeepSeek/Perplexity exports of long, citation-heavy responses sometimes produce content that doesn't match either the main answer or expected follow-up (e.g. a Perplexity export whose title matched the main answer but whose body was a single citation-card sentence). Root cause not yet confirmed — under investigation, not fixed by BUG-026. If reproduced again, capture the exported output alongside a live DOM snapshot of the response (including any inline citation cards) before diagnosing further.

---

### BUG-027: BUG-026's fix caused infinite duplicate export buttons to stack up on DeepSeek
**Date:** 2026-09-27
**Symptom:** Immediately after shipping BUG-026's fix, DeepSeek started piling up many export buttons in the same corner of a response instead of just one.
**Root cause:** Self-inflicted regression. The BUG-026 rewrite replaced the original dedup check (`resp.dataset.cgdInjected`, set directly on the response node) with `container.querySelector('.' + BUTTON_CLASS)`. But `container = resp.closest('[class*="message"]') || ...` uses `closest()`, which returns `resp` itself if `resp`'s own class list happens to match `[class*="message"]`. When `container === resp`, the fallback-placed button — inserted as `resp.parentElement.insertBefore(wrapper, resp.nextSibling)`, i.e. a **sibling** of resp — sits outside `container`, so `container.querySelector` could never find it. Every ~200ms MutationObserver pass then saw "no button yet" and added another one.
**Fix:** Restored `resp.dataset.cgdInjected` as the primary dedup guard (set on the response node itself, immune to the container-vs-sibling mismatch), while keeping BUG-026's relocation behavior by searching `resp.parentElement.querySelector(...)` instead of `container.querySelector(...)` — `resp.parentElement` covers both placements (inside container as a descendant, or as container's/resp's sibling in the fallback wrapper) regardless of whether `container === resp`.
**Lesson:** A flag set directly on the node you're iterating (`resp.dataset.x`) is more robust against selector/topology surprises than a query scoped to a computed ancestor (`container.querySelector`) — the ancestor computation itself can silently collapse to the node you started from. Don't remove an existing dedup flag as "redundant" without checking whether the replacement check can actually see everywhere the flag's effects could land.
**Related files:** `content.js` (`addDeepSeekButtons`, `addPerplexityButtons`).

---

### BUG-028: DeepSeek/Perplexity localized or out-of-scope action bars are not detected
**Date:** 2026-09-27
**Symptom:** The export button falls back below the response instead of joining the native action bar on DeepSeek or Perplexity.
**Root cause:** `_findCopyActionBar` only recognized English `copy` labels within a narrowly selected response container. Perplexity localizes the Share button label (confirmed as `分享`) and its toolbar can live outside that container.
**Fix:** Keep the existing localized-independent copy-label path when available. Otherwise, inspect icon-only SVG buttons within the nearest ancestor that contains just the current response; on Perplexity, prefer the confirmed `#pplx-icon-upload` share icon, then find its surrounding icon-button group. This avoids pairing responses and toolbars by document order. DeepSeek toolbar discovery remains mutation-driven; a toolbar only created after real hover is moved into when it appears.
**Verification:** PARTIALLY VERIFIED. Live testing confirmed the button reliably appears (BUG-030/031's fixes on top of this), consistently landing on the right side of the response area on both platforms — but not pixel-aligned with the native action bar itself. **Reopened 2026-09-30:** maintainer now wants it embedded in the native action row on DeepSeek and Perplexity; the previous “good enough” acceptance is superseded.
**Related files:** `content.js` (`_findCopyActionBar`, `addDeepSeekButtons`, `addPerplexityButtons`).

---

### BUG-029: Select panel doesn't close on outside click on DeepSeek
**Date:** 2026-09-28
**Symptom:** On DeepSeek, clicking outside the export selection panel (`showSelectPanel`) does not close it. The identical panel closes correctly on ChatGPT/Gemini/Claude/Perplexity.
**Root cause:** Unconfirmed with certainty (no live DOM access this session), but the panel's `outsideClickHandler` was attached to `document` in the default bubble phase. DeepSeek's own React click handlers plausibly call `stopPropagation()` during the bubble phase for elements the user clicks, which would prevent the event from ever reaching our `document`-level listener — a platform-specific host page interfering with a listener that works fine everywhere else.
**Fix:** Attach/detach `outsideClickHandler` in the capture phase (`{capture: true}` / `true` third arg) instead of the default bubble phase, at all four call sites (initial attach, drag-temporary-detach, drag-reattach, close-detach). Capture-phase listeners fire before the target's own handlers run, so a page calling `stopPropagation()` during bubble can no longer suppress it.
**Verification:** VERIFIED live by the maintainer on DeepSeek (including after dragging the panel by its title bar), plus a ChatGPT regression spot-check (shared panel code) confirming panel open/inside-click/outside-close all still work correctly there.
**Related files:** `content.js` (`showSelectPanel`'s `outsideClickHandler`).

---

### BUG-030: `_findCopyActionBar` could throw and silently kill button placement for later responses in the same pass
**Date:** 2026-09-28
**Symptom:** On Perplexity, the newest conversation turn had no export button at all, while the previous turn's button was still present and correctly placed.
**Root cause:** `_findCopyActionBar` (added in BUG-028's fix) had no internal error handling. `addDeepSeekButtons`/`addPerplexityButtons` call it inside a `for...of` loop over all responses with no surrounding try/catch; an uncaught exception for any one response would abort the entire loop for that pass, leaving that response (and any others after it in iteration order) without a button. Responses already handled in an earlier, successful pass keep their buttons, producing exactly the observed "newest missing, previous one fine" pattern. Exact throw condition unconfirmed (no live repro captured), but plausible given `_findCopyActionBar`'s new scope-widening logic hadn't been exercised against a real newest-turn DOM state.
**Fix:** Wrapped the implementation in `_findCopyActionBarImpl` and made `_findCopyActionBar` a thin try/catch shim that returns `null` on any internal error, guaranteeing the caller always falls back to fallback-wrapper placement instead of getting no button at all.
**Lesson:** Any per-item loop that injects UI into third-party pages needs a failure mode of "this one item degrades to its fallback," never "this exception kills every remaining item in the batch." A helper called from inside such a loop must not be allowed to throw past its own boundary.
**Related files:** `content.js` (`_findCopyActionBar`, `_findCopyActionBarImpl`, `addDeepSeekButtons`, `addPerplexityButtons`).

---

### BUG-031: Perplexity's newest response still has no export button after BUG-030
**Date:** 2026-09-28
**Symptom:** In a conversation with more than three responses, older Perplexity responses have export buttons, but the newest response does not. Buttons that are present can export successfully.
**Root cause:** Confirmed via live diagnostic. `_perplexityFindResponses()` correctly returned the newest response, and its `resp.dataset.cgdInjected` flag was already `'1'` — meaning `addPerplexityButtons` had already run for it and placed a button — but no button existed in the DOM near it anymore. `cgdInjected` is a one-time boolean: once set, every later pass trusted it and skipped re-checking whether the button was still there. On React-driven pages, the response's parent can be reconciled again after the button was inserted (e.g. a citation count or related-content section finishing asynchronously after the visible text looks done), and React discards DOM children it doesn't recognize — including our manually-inserted button — while reusing the response node itself, so the flag survived but the button didn't. Newer turns are more likely to still receive such follow-up re-renders than older, "settled" ones, which is why only the newest turn showed the symptom.
**Fix:** Replaced the boolean `dataset.cgdInjected` flag with a `WeakMap` (`_platformButtonMap`) keyed by the response element, storing a direct reference to its button. Every pass now checks `document.body.contains(trackedBtn)` on that specific element instead of trusting a flag — if the button was silently removed, it's recreated instead of being assumed to still exist. `addDeepSeekButtons` and `addPerplexityButtons` now share this logic via a new `_addPlatformButton(resp, container)` helper (same underlying bug class, same fix, avoiding duplicated logic drifting apart again per the BUG-026 lesson).
**Verification:** VERIFIED live by the maintainer — Perplexity multi-turn conversation (including the newest turn, after waiting for async content like citations to finish loading) keeps its export button; BUG-030's action-bar try/catch and this fix confirmed together.
**Related files:** `content.js` (`_addPlatformButton`, `_platformButtonMap`, `addDeepSeekButtons`, `addPerplexityButtons`).

---

### BUG-032: DeepSeek single-response export contains only the introduction line
**Date:** 2026-09-28
**Symptom:** After generation completed, exporting a DeepSeek response from its own button produced a document whose body began “Here are some easy math equations with citations:” and contained nothing after that line.
**Root cause:** Confirmed by the supplied live-DOM description and call path. `_deepSeekFindResponses()` returns the top-level `.ds-markdown.ds-assistant-message-main-content` element itself, but `extractMarkdown()` searched inside `messageEl` first. The broad `[class*="markdown"]` descendant match could select the first `p.ds-markdown-paragraph`, which contains only the introduction sentence; the remaining paragraphs and headings are siblings outside that selected node. The failure was in choosing the extraction root, not in KaTeX parsing.
**Fix:** The DeepSeek branch now checks whether `messageEl` itself matches `.ds-markdown` and uses it as `contentDiv` before querying descendants. Existing `processNode()` handles KaTeX and reads TeX from its annotation; no alternate text scraper was added.
**Current evidence:** Maintainer reproduced via the single-response button after generation ended and provided the complete answer plus the live target container classes. The code change matches that DOM shape.
**Verification:** VERIFIED live by the maintainer — exported DeepSeek document now contains full content (headings, prose, math, citations), not just the opening line.
**Related files:** `content.js` (`extractMarkdown`, `processNode`, DeepSeek button click handler).

---

### BUG-033: ChatGPT redesign (Sept 2026) removed data-message-author-role and all data-testid attributes — export button and content extraction stopped working entirely, on the live production build
**Date:** 2026-09-30
**Severity:** P0 — affected the published Chrome Web Store version, not just local dev builds.
**Symptom:** Export button missing entirely on ChatGPT (not misplaced — absent). Console showed no errors. Affected `getLastAIMessage`, `getAllAIMessages` (used by Last/Full/Pick export modes), and `addChatGPTButtons`.
**Root cause:** Confirmed via live DevTools diagnostics: ChatGPT shipped a frontend rewrite that removed `data-message-author-role="assistant"` and every `data-testid` attribute our selectors depended on (`copy-turn-action-button`, `conversation-turn`, `thumbs-*-button`, `more-options-*`, etc.) — all now `null`. The new markdown content root is `[data-markdown-text-style="assistant-message"]`. Action buttons carry no `data-testid` and their `aria-label`s are localized (confirmed live: "复制消息" not "Copy message", "更多操作" not "More actions"), so no English-text-matching fallback could work either. `addChatGPTButtons`'s `container = msg.closest('.group\\/conversation-turn') || msg.closest('[data-testid^="conversation-turn"]')` resolved to `null` for every message once `data-testid` vanished, hitting `if (!container) continue;` and silently skipping every response — no exception, no console output, matching the "no button anywhere, no error" report exactly.
**Fix:**
- `_chatGPTFindResponses()`: new primary selector `[data-markdown-text-style="assistant-message"]`, with the legacy `data-message-author-role` lookup kept as a fallback (staged-rollout safety net).
- `_widenChatGPTScope(msg)`: when both `.closest()` turn-boundary selectors fail, fall back to a fixed 7-level walk-up from the message content as the search scope, since no turn-boundary attribute survived to replace `data-testid^="conversation-turn"`.
- `_iconButtonCount(el)`: counts icon-only buttons (`button:has(svg)` with empty text) — a language- and attribute-independent way to recognize the action bar. Confirmed live: the real bar has ~8 buttons (复制消息/编辑消息/评价回复/分享/添加到项目来源/朗读/重新生成回复/更多操作); a response's own inline tools (e.g. table copy/expand) only ever have 2. Threshold of 4 reliably distinguishes them.
- `findChatGPTActionBar` and the `reliable` check in `addChatGPTButtons` both gained this icon-count strategy as an addition alongside (not a replacement for) the existing `data-testid`-based checks.
- `getAllAIMessages`/`getLastAIMessage`'s ChatGPT branches now call `_chatGPTFindResponses()` instead of querying `data-message-author-role` directly.
**Verification:** Root cause fully confirmed via live console diagnostics (multiple rounds — see session transcript). Code fix written but **not yet live-tested** — needs an emergency-priority retest and, if the extension is already published, an urgent point release, since the currently-live Chrome Web Store version has zero working ChatGPT export until this ships.
**Lesson:** Same recurring lesson as BUG-003/011/018/021: ChatGPT's frontend is redesigned periodically without warning, and past redesigns have removed `data-testid` incrementally — this one removed it (and the role attribute) entirely in one pass. Any ChatGPT selector strategy needs a non-attribute, non-English-text fallback (icon/structural counting, as now used here and already proven for DeepSeek/Perplexity in BUG-028) rather than assuming `data-testid` will always exist in some form.
**Related files:** `content.js` (`_chatGPTFindResponses`, `_widenChatGPTScope`, `_iconButtonCount`, `findChatGPTActionBar`, `addChatGPTButtons`, `getAllAIMessages`, `getLastAIMessage`).

---

### BUG-034: BUG-033's ChatGPT fix placed the button on its own full-width line instead of inline with the action bar
**Date:** 2026-09-30
**Symptom:** After BUG-033 shipped, the export button reappeared on ChatGPT (and had the same symptom on Claude, tracked separately) but rendered as a full-width row below the icon bar instead of inline with copy/thumbs/share.
**Root cause:** BUG-033's icon-button-count strategy walked up from `msg` (the message content) directly, counting icon buttons in each ancestor. The first ancestor to reach the ≥4 threshold was a `flex flex-col` (vertical) wrapper that merely *contains* the actual button row further down, not the row itself. Appending into a column-flex container stacks the new child on its own line rather than inline.
**Fix:** Find the icon-only buttons first, then walk up *from one of those buttons* (mirroring the already-correct legacy `copyBtn.parentElement` pattern and the DeepSeek/Perplexity `_findCopyActionBarImpl` approach) instead of from the message content. This reliably lands on the buttons' own immediate flex-row container.
**Related files:** `content.js` (`findChatGPTActionBar`).

---

### BUG-035: BUG-034's fix could grab an adjacent turn's action bar, making the button jump to the wrong message
**Date:** 2026-09-30
**Symptom:** On refresh, the export button briefly appeared correctly (bottom-right, near the intended message), then a moment later jumped to a completely different position — the top of the conversation, on an earlier/different message.
**Root cause:** BUG-034's fix searched for icon buttons within `_widenChatGPTScope(msg)`, a fixed 7-level walk-up from the message. On pages where multiple turns share a common ancestor within 7 levels (likely, given ChatGPT's current DOM nests turns fairly shallowly), that scope could contain icon buttons belonging to a *different* message entirely. The first pass placed the button provisionally (fallback wrapper) near the right message; a later re-scan then found a "reliable" action bar via this over-wide search, but the bar it found belonged to the wrong turn, and `insertBeforeMoreButton` relocated the button there — matching the "briefly correct, then jumps" symptom exactly (see BUG-024's relocate-on-later-pass mechanism, which this inherited).
**Fix:** `_widenChatGPTScope` now finds the smallest ancestor containing **only one** `[data-markdown-text-style="assistant-message"]` (the same bounding technique `_findCopyActionBarImpl` already used for DeepSeek/Perplexity), falling back to the old fixed-depth widen only if that search can't resolve cleanly. Both the "does this message already have a button" check in `addChatGPTButtons` and the icon-button search in `findChatGPTActionBar` now share this single, turn-bounded scope function, so neither can bleed into an adjacent turn.
**Lesson:** A fixed-depth ancestor walk is never safe on its own once there's no structural marker for the boundary you actually care about — it has to be bounded by a positive check (e.g. "exactly one of X in scope"), not just a depth number that happened to work in one observed case.
**Related files:** `content.js` (`_widenChatGPTScope`, `findChatGPTActionBar`, `addChatGPTButtons`).

---

### BUG-036: BUG-034/035's icon-count heuristic still landed one wrapper too high — button rendered on its own line above the icon row
**Date:** 2026-09-30
**Symptom:** After BUG-035 shipped, the button no longer jumped between messages and wasn't full-width, but still rendered on its own row directly above the native copy/thumbs/share icon row instead of inline with it.
**Root cause:** Live diagnostic starting from the actual "复制消息" (copy) button found a clean, semantic, non-hashed class name one level up: `turn-action-controls` — the true flex-row container holding the real action icons (only 2 buttons in that immediate group, well under BUG-034's ≥4 threshold). The icon-counting walk-up kept climbing past this correct row looking for 4+ buttons and landed on an outer wrapper that merely stacks it above the row.
**Fix:** Prefer `[class*="turn-action-controls"]` as a direct match within the message's bounded scope — when multiple such groups exist per turn (e.g. one for copy/edit, another for thumbs/share/regenerate/more), pick the one with the most icon buttons (the main action row). The icon-button-count walk-up from BUG-034/035 is kept as a fallback only if this class is ever removed too.
**Lesson:** When a redesign strips `data-testid` and localizes labels, check for any remaining semantic (non-hashed) class names before falling back to generic structural heuristics (counting/walking) — a stable class name, when present, is far more precise than any depth- or count-based guess.
**Related files:** `content.js` (`findChatGPTActionBar`).

---

### BUG-037: BUG-036's precise turn-action-controls match was found but then rejected by the reliable-count gate, still falling back to the isolated-row layout
**Date:** 2026-09-30
**Symptom:** After BUG-036 shipped, the button still rendered on its own line above the icon row on ChatGPT — same visual symptom as before, despite `findChatGPTActionBar` now correctly returning the `turn-action-controls` element.
**Root cause:** `addChatGPTButtons`'s `reliable` check requires `_iconButtonCount(actionArea) >= 4` as one of its conditions (tuned for the coarser BUG-034/035 icon-counting fallback). The precise `turn-action-controls` group BUG-036 finds only has 2-3 buttons in that specific group (e.g. just copy+edit), so `reliable` evaluated false even though `actionArea` was now correct — sending the button down the fallback-wrapper path anyway, identical in appearance to the "not found at all" case.
**Fix:** `reliable` now also accepts `actionArea.className` containing `turn-action-controls` as sufficient on its own, independent of button count — a class-name match from BUG-036 is a higher-confidence signal than a generic count threshold and must not be gated behind it.
**Lesson:** When adding a more precise detection strategy, audit every downstream consumer of its result (here, a separate `reliable` gate) — a stricter/different-shaped signal from the new strategy can be silently rejected by a threshold tuned for the old one.
**Related files:** `content.js` (`addChatGPTButtons`).

---

### BUG-038: ChatGPT toolbar is a sibling of the Markdown root, outside the smallest assistant-only scope
**Date:** 2026-09-30
**Symptom:** ChatGPT Export remains inside `.cgd-fallback-wrapper` after a response has finished, so it sits on a separate right-aligned line instead of inside the native action toolbar.
**Root cause:** A live DevTools ancestor trace showed the fallback wrapper inside ChatGPT's `MarkdownRoot-*` node. `_widenChatGPTScope()` returned the smallest ancestor containing one assistant response; the native `turn-action-controls` toolbar is rendered beside the Markdown root, so `findChatGPTActionBar()` could not see it from that narrow scope and kept the button in fallback.
**Fix:** Expand the search scope to the widest ancestor that still contains exactly one assistant response. This includes sibling action controls while stopping before a neighboring assistant turn enters the scope; the existing fallback-button relocation then moves the button into the detected toolbar.
**Verification:** Source change and syntax check completed; live placement still needs verification after reloading the unpacked extension and refreshing ChatGPT.
**Related files:** `content.js` (`_chatGPTResponsesInScope`, `_widenChatGPTScope`, `findChatGPTActionBar`).

---

### BUG-039: DeepSeek and Perplexity action-bar search scope can stop before sibling controls
**Date:** 2026-09-30
**Symptom:** The export button remains in the right-aligned fallback row instead of joining the native action toolbar.
**Root cause:** `_findCopyActionBarImpl()` searched the nearest ancestor containing exactly one top-level response. The toolbar can be a sibling of the response prose outside that narrow ancestor, so icon-based lookup returned `null` and the response stayed in fallback.
**Fix:** Search outward to the widest ancestor that still contains exactly the current top-level response. Stop widening before a neighboring answer enters scope.
**Verification:** Source change and syntax check completed; live placement on both platforms still needs verification.
**Related files:** `content.js` (`_findCopyActionBarImpl`).

---

### BUG-040: DeepSeek and Perplexity action-bar lookup can select a vertical wrapper
**Date:** 2026-09-30
**Symptom:** Export appears on a separate right-aligned row while the native action icons remain on another line.
**Root cause:** Two misses combined on DeepSeek. First, `_findCopyActionBarImpl()` accepted ancestors by button count without checking horizontal layout. After that was tightened, `addDeepSeekButtons()` still used `resp.closest('[class*="message"]')`; DeepSeek's response node itself has a `ds-assistant-message-*` class, so the search scope stopped at the prose and omitted its sibling toolbar. DeepSeek also exposes some controls as `[role="button"]`, which the icon-only fallback did not include.
**Fix:** `_findHorizontalActionRow()` validates controls' rendered positions and rejects column-flex wrappers. DeepSeek now avoids using the prose node as its own message container, and icon/copy discovery includes role buttons.
**Verification:** First positioning attempt did not fix DeepSeek; maintainer confirmed it remained in the same position. Latest source change addresses the excluded-sibling scope and role-button gaps; live placement still needs verification after reloading the unpacked extension.
**Related files:** `content.js` (`_findHorizontalActionRow`, `_findCopyActionBarImpl`).

---

### BUG-041: Claude export button is appended to a broad wrapper instead of its native toolbar row
**Date:** 2026-09-30
**Symptom:** Claude's Export control appears on its own row under the native copy/audio/rating toolbar.
**Root cause:** The `.text-text-300` selector can match a broad ancestor that contains the toolbar but is not the toolbar itself. Appending a wrapper there places Export on a separate line.
**Fix:** Locate the horizontal action row from Claude's non-code-block Copy button using `_findHorizontalActionRow()` and append Export directly to that row.
**Verification:** Source checks completed; live placement on Claude still needs verification after reloading the unpacked extension.
**Related files:** `content.js` (`addClaudeButtons`, `_findHorizontalActionRow`).

---

### BUG-042: Claude export button also appears under the user's own message, not just under the AI reply
**Date:** 2026-10-03
**Symptom:** Maintainer reported (no live DOM access this session): for one exchange on Claude, two export buttons appear — one incorrectly under the user's own question, one correctly under Claude's reply action bar.
**Root cause (hypothesis, not live-confirmed):** `addClaudeButtons` iterates every `button[aria-label="Copy"]` on the page, including the user's own message's Copy button. To tell user messages apart from AI replies, it walked up to 10 levels from the action bar looking for a `.standard-markdown` descendant, then excluded the result only if `[class*="font-user-message"]` was also found inside it. Two ways this fails: (a) 10 levels is generous enough that, for a user message's own Copy button, the walk can overshoot into a shared ancestor that also contains the *next* turn's `.standard-markdown` (Claude's reply), incorrectly treating the user's own button as belonging to that reply; (b) the `font-user-message` class name is the *only* signal excluding user messages, and this project has repeatedly seen host platforms rename classes across redesigns (BUG-018 for Claude specifically, BUG-033 for ChatGPT) — if Claude renamed it, this exclusion silently stops firing for every user message.
**Fix:** Tightened the walk-up budget from 10 to 6 levels, and — more importantly — added a class-name-independent structural check: the assistant's own Copy button can never precede its own response's `.standard-markdown` in document order (`Node.DOCUMENT_POSITION_PRECEDING`). A user message's Copy button that walked into the *next* turn's markdown would necessarily come before it in the DOM, so this check rejects it regardless of whether the `font-user-message` class still exists or matches. This fix holds even if the class-name hypothesis above is wrong.
**Not yet investigated:** Four other call sites use the same `font-user-message` class to identify Claude user messages (`extractMarkdown`'s ancestor-walk fallback, `exportFullConversation`'s role labeling, `_claudeFindResponses`'s fallback path, `getAllUserMessages`). If the class really has been renamed, `exportFullConversation`'s Claude branch would silently omit "You" turns from full-conversation exports (a content-correctness bug, not just a placement one) and `getAllUserMessages` would return an empty array. **Not changed without live confirmation** — scope was kept to the one reported symptom. If the maintainer confirms this class is stale when testing BUG-042's fix, these four locations need the same scrutiny.
**Verification:** Not live-tested — maintainer was away from testing when this was written; needs confirmation on an actual Claude conversation (ask a question, check only one export button appears, under the reply).
**Related files:** `content.js` (`addClaudeButtons`; related but untouched: `extractMarkdown`, `exportFullConversation`, `_claudeFindResponses`, `getAllUserMessages`).

---

### BUG-043: exportFullConversation silently drops every user turn on Claude if font-user-message ever stops matching
**Date:** 2026-10-03
**Follow-up to:** BUG-042's investigation, which found four other call sites relying on the same possibly-stale `font-user-message` class and deliberately left them unchanged pending live confirmation (see BUG-042's "Not yet investigated" note).
**Impact assessment:** Of the four, only this one was judged worth a code change without live data: `getAllUserMessages` only feeds a small cosmetic preview string in the picker panel (blank if missing, not wrong), `_claudeFindResponses`'s fallback is dead code under current conditions (the primary `.standard-markdown` path is confirmed working), and `extractMarkdown`'s ancestor-walk fallback only triggers on an already-degraded extraction. `exportFullConversation`'s Claude branch is different: if `font-user-message` matched zero elements, the exported "full conversation" document would silently contain only Claude's replies with every question missing, and a reader has no way to know content is missing.
**Fix:** If `userEls.length === 0` while `aiEls.length > 0` (AI replies found but no user turns — structurally implausible in a real conversation), insert a `⚠️ Notice` section at the top of the exported document explaining that user messages could not be detected, instead of silently producing an incomplete-looking-complete document.
**Verification:** Not live-tested. This is a safety net for an unconfirmed hypothesis, not a fix for a confirmed bug — if the class name turns out to still be valid, this code never triggers.
**Related files:** `content.js` (`exportFullConversation`).

---

### IMPROVEMENT: Scoped the "Export to Docs" right-click menu to supported platforms only
**Date:** 2026-10-03
**Previous behavior:** The context menu item appeared when selecting text on *any* website (no `documentUrlPatterns`), doing nothing if clicked anywhere other than the 5 supported AI platforms — functional, but confusing clutter in the context menu everywhere else, and broader than necessary for the `contextMenus` permission's stated purpose.
**Change:** Added `documentUrlPatterns` to the `chrome.contextMenus.create()` call, matching the same 5 hosts as `manifest.json`'s `content_scripts.matches` (keep these two lists in sync if either changes).
**Action needed:** The CWS dashboard's `contextMenus` permission justification text described the old (unscoped) behavior — "appears everywhere, only functions on supported pages." That text is now inaccurate and needs updating before the next store submission; `privacy.html`'s wording was already generic enough to not need a change.
**Related files:** `background.js` (`registerSelectionContextMenu`).

---

### BUG-044: Text-selection floating "Export" button overlaps the selected text
**Date:** 2026-10-04
**Symptom:** Maintainer screenshot (Claude, multi-line text selection): the floating "→ Append to..." button that appears on text selection rendered directly on top of the selected paragraph instead of floating above it, obscuring the text.
**Root cause:** The button's vertical position was a fixed `rect.top - 40px` offset with no check for whether there was actually room above the selection. On a selection whose top edge sits close to the top of the viewport or close to preceding text (tight paragraph spacing), subtracting 40px can land inside that preceding content instead of in clear space.
**Fix:** Added a collision check: if there's at least `button height + 8px` of room above the selection, float above as before; otherwise flip to below the selection (`rect.bottom + 8px`) — the same pattern selection toolbars (Google Docs, Medium highlight menu) use.
**Verification:** Not live-tested — found from a screenshot, not reproduced interactively this session.
**Related files:** `content.js` (the `mouseup` listener building the floating selection button).

---

### BUG-045: "Export Full Conversation" on ChatGPT was completely broken (confirmed, not hypothetical)
**Date:** 2026-10-04
**Severity:** High — confirmed via code read, not a hypothesis like BUG-043's DeepSeek/Perplexity notices.
**Symptom (not yet live-confirmed, but logically certain given BUG-033):** Clicking "Export Full Conversation" on ChatGPT would show "❌ No conversation content found" and export nothing.
**Root cause:** `exportFullConversation`'s ChatGPT branch was never updated during the BUG-033 emergency response — it still called `document.querySelectorAll('[data-message-author-role]')` directly instead of going through `_chatGPTFindResponses()`. Since BUG-033 confirmed this attribute no longer exists anywhere on the page, this query always returned zero elements, `turns` stayed empty, and the function hit its own "no content found" early-return. The button-injection and Last/Pick-mode code paths were fixed at the time (they already routed through `_chatGPTFindResponses()`/`getAllAIMessages()`); this one direct, unrouted query was missed.
**Fix:** Added `_chatGPTFindUserMessages()` (counterpart to `_chatGPTFindResponses()`): tries the legacy `data-message-author-role="user"` attribute first, then falls back to a best-effort guess — `h4[data-conversation-role="user"]`, hypothesized to mirror the confirmed assistant landmark `h4[data-conversation-role="assistant"]` found during BUG-033's live diagnostics (unconfirmed live, since no further DOM access was available this session). That landmark is `sr-only`, so the function walks up from it to the nearest ancestor with more text than the landmark itself. `exportFullConversation`'s ChatGPT branch now uses this plus `_chatGPTFindResponses()`, with BUG-043's "⚠️ Notice" fallback if the user-side guess also comes up empty. `getAllUserMessages`'s ChatGPT branch (previously the same bare `data-message-author-role="user"` query) now calls the same shared helper instead of duplicating the logic.
**Verification:** Not live-tested. The assistant side is confirmed solid (same selector verified working for buttons/Last/Pick since BUG-033). The user-message selector is an educated guess; if wrong, the "⚠️ Notice" fallback means the export still succeeds with ChatGPT's replies rather than failing outright — a clear improvement over the current total failure either way.
**Related files:** `content.js` (`exportFullConversation`, `getAllUserMessages`, new `_chatGPTFindUserMessages`).

### IMPROVEMENT: Same defensive "⚠️ Notice" pattern applied to DeepSeek and Perplexity exports
**Date:** 2026-10-04
**What:** `exportFullConversation`'s DeepSeek and Perplexity branches use class-based selectors (`[class*="user-message"]`, `[class*="user"]`) to find user turns — the same fragile-class-name risk as BUG-043 on Claude. Added the identical "if zero user turns but AI turns exist, insert a notice instead of silently omitting questions" check to both, for consistency.
**Verification:** Not live-tested — same unconfirmed-hypothesis caveat as BUG-043.
**Related files:** `content.js` (`exportFullConversation`).

---

### BUG-046: Recent-docs scroll fix showed up to 8 in the UI, but the underlying storage still capped at 5
**Date:** 2026-10-05
**Symptom:** Maintainer live-tested the BUG-042-era "scrollable recents" fix: created 6+ exports across different conversations, but the panel never showed more than 5, and no scrollbar ever appeared.
**Root cause:** The UI-side `.slice(0, 8)` (content.js, the panel's `recents` computation) was never the bottleneck — `globalRecentDocs` itself was persisted with a hard `.slice(0, 5)` at the point it's *saved* to `chrome.storage.local`. When exports happen across different conversations (so each conversation's own `lastExports` history contributes little), almost all of the panel's "recent" list comes from this shared, 5-capped array — so the UI could never have more than 5 to display no matter how high its own slice limit was raised.
**Fix:** Raised the storage-side cap to `.slice(0, 8)` to match the UI's actual display capacity. Updated `CLAUDE.md`'s storage schema table (§ 2.6) accordingly.
**Verification:** Not re-tested after this fix — needs re-confirmation with 6+ exports across different conversations.
**Related files:** `content.js` (the `globalRecentDocs` save path), `CLAUDE.md` (§ 2.6).

---

### BUG-047: Unrecognized LaTeX commands (e.g. `\boxed{}`) render as garbled text in exported Word/Docs math
**Date:** 2026-10-05
**Symptom:** Maintainer screenshot: ChatGPT's `\boxed{3390}` (boxing a final numeric answer, a common LaTeX convention) exported as literal text "boxed3,390" with no box, directly adjacent with no space. A chemistry formula wrapped in `\boxed{}` showed the same class of corruption.
**Root cause:** `converter.js`'s LaTeX parser (`parseAtom`) has no case for `\boxed`. Its final fallback for any unrecognized command returns `{type:'text', value: cmd.substring(1)}` — i.e. the command name literally, as text — and critically does **not** consume the command's `{...}` argument. The argument then gets parsed as a separate, subsequent expression by the caller's loop, producing two adjacent text nodes with no separator: the bare command name immediately followed by its argument's content.
**Fix:** Added a dedicated case: `\boxed` now produces a `{type:'borderbox', content: parseGroup()}` AST node, rendered via a new `astToOmml` case using Office Math ML's `<m:borderBox>` element — the same structural pattern (`*Pr` properties child + `<m:e>` content child) already used by the existing, working `accent`/`radical` cases in this file. Purely additive — no existing case or fallback behavior was changed.
**Verification:** Syntax-checked only (`node --check converter.js`). **Not verified to actually render a box in Word or Google Docs** — this session has no way to open a produced `.docx` and visually confirm OOXML rendering. If the box doesn't render as expected, the AST/OMML mapping needs rechecking against a real Office Math ML reference, not another guess.
**Lesson:** `converter.js`'s "unrecognized command" fallback silently drops a fallthrough path that regularly produces wrong, glued-together output rather than something merely incomplete — any *other* unhandled LaTeX wrapper command (one that takes a `{...}` argument) will hit the exact same failure mode. `\boxed` was fixed because it was reported; the fallback itself is still structurally the same trap for the next one.
**Related files:** `converter.js` (`parseAtom`, `astToOmml`).

---

## v4.3 planned features

### High priority
1. **PDF/citation artifact fix** — Gemini DOM extraction produces `^^` and drops citation text when AI cites sources inline. Root cause: `<sup>` citation markers in Gemini DOM. Queued since v4.2.
2. **Uninstall feedback URL** — `chrome.runtime.setUninstallURL()` pointing to a Google Form asking "why did you uninstall?"
   - Industry standard pattern
   - 10 uninstalls/day on 5/26 = reliable signal source
   - ~30 min implementation in background.js
