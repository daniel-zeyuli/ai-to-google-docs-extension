# CLAUDE.md — Project Constitution (AI Chat Exporter for Google Docs)

> Project-specific rules. **Read `~/.claude/CLAUDE.md` first** — it sets the universal work protocol, scope discipline, UX discipline, and self-critique rules. This file extends those for this Chrome extension.

**Read this file at the start of EVERY task before touching any code.** It supersedes any general instinct or pattern-match.

When you finish a task, the last thing you do is update `BUGS.md` if a bug was fixed, and reconfirm `TESTING.md` smoke tests pass.

---

## 1. PROJECT IDENTITY

**What it is:** A Chrome MV3 extension that adds a one-click "Export to Docs" button next to AI responses on ChatGPT, Gemini, and Claude. The response is converted to a `.docx` (preserving Markdown, LaTeX math, tables, code blocks, and images) and uploaded to Google Drive as a Google Docs file. Falls back to local `.docx` download if Drive upload fails.

**Target users:** Students (high school, university), researchers, teachers — people who want AI conversations preserved as editable, shareable, archive-quality documents. The maintainer (Daniel Li) is a student building this for his own school workflow.

**Single purpose:** Convert one AI response (or a whole conversation) into a high-fidelity Google Doc, with one click, with no friction.

**OUT OF SCOPE — do not build these without explicit user approval:**
- Conversation search, tagging, organizing UI inside the extension.
- Cloud sync of the user's chat history.
- Multi-account support.
- Analytics, telemetry, usage tracking.
- Editor / preview UI for the exported document.
- Anything that requires a backend server. This extension is 100% client-side except for Google's APIs.
- Support for AI platforms beyond ChatGPT, Gemini, Claude (until those three are rock-solid).

---

## 2. NON-NEGOTIABLE RULES (red lines)

These are not style preferences. Each one was learned the hard way — see `BUGS.md` for the incident.

### 2.1 Never reintroduce these OAuth scopes
- `https://www.googleapis.com/auth/drive.metadata.readonly` — sensitive scope, fails Web Store review, forces re-consent.
- `https://www.googleapis.com/auth/documents` — was removed for triggering Google's "App security" warning (commit `602a16b` / BUG-004).
- The only allowed scope is `drive.file`. If a feature seems to require a broader scope, the answer is **almost always Google Picker API**, not a wider scope. **Ask the user before adding any scope.**

### 2.2 Content scripts have NO access to these APIs
- `chrome.windows`, `chrome.tabs`, `chrome.identity`. They are **not available** in `content.js`. Any code path that needs them must `chrome.runtime.sendMessage` to `background.js` and have a handler there. If you find yourself wanting to call one of these in `content.js`, stop — you are about to repeat a bug.

### 2.3 OAuth interactive flow constraints
- `chrome.identity.getAuthToken({ interactive: true })` from a programmatically-opened extension window (`chrome.windows.create`) **does not reliably show the consent UI**; the callback may never fire and the page hangs at "Loading…" (BUG-008).
- Reliable contexts for `interactive: true`: (a) background service worker, triggered by any message; (b) popup pages, in a user-gesture click handler.
- **Pattern:** auth in background or popup FIRST → then open the picker window with `interactive: false` for any subsequent token reads.

### 2.4 Manifest V3 specifics
- `python3 -m json.tool manifest.json` must succeed before every commit.
- If a `sandbox` block is present: `content_security_policy.sandbox` lives at the **top level**, not inside the `sandbox` object. The `sandbox` object only takes `pages: [...]`. Wrong placement = extension fails to load (BUG-006).
- Chrome MV3 rejects `blob:` and `data:` in sandbox `script-src` (BUG-014). Don't add them back.
- Any new `chrome.windows.create` size has to be updated in **every** call site (`background.js` AND `popup.js`). They drifted before.

### 2.5 Drive API query rules
- `'root' in parents` restricts to root-level folders only — most user folders are nested deeper, so this returns empty. **Default folder query is `trashed=false` only.**
- `drive.file` scope + `files.list` returns EMPTY for user-created folders (only files the extension itself touched). Do not "fix" empty folder lists by widening the scope (see 2.1) — use Google Picker API.
- Listing page size: **100+** (currently 200). Don't drop to 50.

### 2.6 Storage schema (must stay consistent — wrong key = silent bug)
```
ExportEntry: { fileName, url, fileId, exportedAt? }   // exportedAt = ms; absent on legacy entries — handle gracefully
lastExports:        { [hostname+pathname]: ExportEntry[] }   // ≤ 3 per conversation
globalRecentDocs:   ExportEntry[]                            // ≤ 5 globally
exportDest:         'drive' | 'local' | 'markdown'           // 'markdown' added v1.0
defaultExportMode:  'last' | 'full' | 'select'
exportFolderId:     auto-created "AI Chat Exports" parent folder ID
exportFolderIds:    { [platformName]: subfolderId }          // per-platform subfolder IDs (v1.0)
customFolderId / customFolderName:  REMOVED in v1.0 — auto-cleared on first run by background.js
pickerState:        REMOVED in v1.0 (picker dropped — see Path B memory)
```
Before adding a new key: search the codebase to confirm no existing key collides. Update this table in the same commit.

### 2.7 `.innerHTML` discipline
Any string interpolated into `.innerHTML` MUST go through `escHtml()` if it contains user-controlled or API-returned data (folder names, file names, error messages from Drive/Docs APIs). The pattern is fragile by design — if you forget once, it's stored XSS in the privileged content-script context. When in doubt, build with `document.createElement` and `textContent`.

### 2.8 Things to never touch without asking
- `manifest.json` `oauth2.client_id` — switching between test and production client IDs has caused real auth outages for shipped users (BUG-005).
- The version number in `manifest.json` and `popup.html` (the badge). The maintainer bumps these.
- `converter.js` — it has subtle CRC32, ZIP, OOXML, and LaTeX rendering invariants. Do not "clean up" or "modernize" it. Treat as a black box unless the task specifically targets it.
- `privacy.html`, `LICENSE`, `README.md` — content/legal artifacts, only edit when the user explicitly asks.

### 2.9 Architecture decisions to respect
- **`content.js` stays as a single ~1700-line IIFE.** Content scripts can't use ES modules without bundling, and bundling adds toolchain complexity that's not worth it.
- **No build step** (npm, webpack, TypeScript). Zero deps; ships exactly the source you write.
- **No frameworks** (React, Vue) in the popup or panel. Plain DOM only.
- **No backend.** All cloud calls go directly to Google's APIs from the extension.

---

## 3. KNOWN PITFALLS (lessons from past bugs)

If a symptom in your current task matches one of these, **stop and re-read the entry** in `BUGS.md` before applying a fix.

### Pitfall A — "Picker hangs at Loading…" (BUG-008)
Past root cause: `chrome.identity.getAuthToken({ interactive: true })` from a window opened via `chrome.windows.create`. Fix: pre-auth in background/popup, then open the picker window. Don't try to auth inside the picker page interactively.

### Pitfall B — "Folder picker shows only AI Chat Exports" (BUG-007)
Past root cause: `drive.file` scope can't list user-created folders. Fix: use Google Picker API. **Do not** add `drive.metadata.readonly` to make the symptom go away.

### Pitfall C — "Sandbox CSP placement / Chrome rejects manifest" (BUG-006, BUG-014)
Past root cause: putting `content_security_policy` inside the `sandbox` object, or including `blob:` / `data:` in sandbox `script-src`. Fix: top-level `content_security_policy.sandbox` only, no `blob:`/`data:`.

### Pitfall D — "Export button appears in the wrong place / multiple times" (BUG-003, BUG-011)
Past root cause: ChatGPT uses `data-testid="more-options-turn-action-button"` (not `aria-label`) for the three-dots menu; platform DOMs change. Fix: use the platform-specific selectors documented in section 5; verify by inspecting the live page.

### Pitfall E — "Math equations rendered twice" (BUG-002)
Past root cause: KaTeX strategy 3 had a guard logic bug that double-extracted math. Fix is in place; do not refactor `processNode` strategies in `content.js` without re-running math regression tests on all three platforms.

### Pitfall F — "Panel closes immediately after picker Select" (BUG-015)
Past root cause: clicking Select in the picker overlay called `chrome.storage.local.set(..., callback)`; the click bubbled to `outsideClickHandler` synchronously while the overlay was still in the DOM, and `panel.contains(target)` was false → panel closed before storage write resolved. Fix: `outsideClickHandler` must short-circuit on `e.target.closest('.cgd-pk-overlay')` AND on `!document.body.contains(e.target)`. Both checks are needed.

### Pitfall G — "Recent docs chips show duplicates" (BUG-016)
Past root cause: deduplicating only by `fileId` misses the common case where two separate exports create different Docs with the same auto-generated filename. Dedup by **both** `fileId` and `fileName` in both the save path AND the display path.

### Pitfall H — "OAuth works for me but not for shipped users" (BUG-005)
Past root cause: `oauth2.client_id` swapped between development extension ID and the published Web Store extension ID. The client_id must match the extension ID in Google Cloud Console.

### Pitfall I — "Picker window opens fullscreen on macOS" (BUG-010)
Past root cause: `chrome.windows.create` ignores `width`/`height`/`state` when Chrome itself is in macOS fullscreen. There is no reliable workaround at the windows API. Solution chosen: in-page `position: fixed` modal overlay instead of a separate window.

### Pitfall J — "Shadow DOM traversal silently no-ops" (BUG-019)
Past root cause: `_deepQueryAll` had `if (!node || node.nodeType !== 1) return`. `shadowRoot` is a DocumentFragment (nodeType 11), not an Element (nodeType 1). Calling `walk(node.shadowRoot)` immediately returned — the function appeared to pierce shadow DOM but silently traversed nothing. Fix: allow nodeType 11 (DocumentFragment) and 9 (Document) to iterate `.children` while only calling `matches()` on Elements. Mental test before shipping any shadow-piercing traversal: *if `walk()` receives a DocumentFragment, will it proceed past the guard?*

---

## 4. PLATFORM-SPECIFIC DOM SELECTORS (current truth)

Update this section whenever a platform redesign forces a selector change. Verify on the live page before relying on these.

- **ChatGPT:** `[data-message-author-role="assistant"]`; action bar via `button[data-testid="copy-turn-action-button"]`; insert before `[data-testid*="more"]`.
- **Gemini:** `model-response`, `.model-response-text`; copy button via `aria-label="Copy"`.
- **Claude:** non-code-block `button[aria-label="Copy"]`; **content via `.standard-markdown`** (verified on `chat-ui-core` / Opus 4.7 era). ⚠️ Do NOT use `[class*="font-claude-response"]` — that matches 1000+ unrelated elements (BUG-018). `.prose` is also gone (0 matches). The correct pattern is `.standard-markdown` (one per AI response) plus a walk-up-from-Copy-button fallback.

When designing UI for this project, draw references from: **Google Drive's Move dialog** (folder picker), **Notion's "Move to"** (search + recents), **Gmail's label picker** (compact, fast). The folder picker in this extension explicitly mirrors Google Drive's Move dialog so users have zero learning curve.

---

## 5. PROJECT-SPECIFIC SCOPE GUARDRAILS

Beyond the universal scope rules in `~/.claude/CLAUDE.md`:

- Don't restructure `content.js` into modules (see § 2.9).
- Don't introduce a build step or framework (see § 2.9).
- Don't add features the user didn't ask for. This is a single-purpose tool — the discipline is what makes it work.
- Don't redesign UI surfaces "while you're here." If you spot a UX issue while fixing a bug, log it in `IDEAS.md`, not in the same diff.

---

## 6. THE SELF-CHECK BEFORE EVERY COMMIT

```
[ ] python3 -m json.tool manifest.json   → OK
[ ] grep -n "chrome.windows\|chrome.tabs\|chrome.identity" content.js   → no matches
[ ] No new OAuth scope added (or, if added, user explicitly approved)
[ ] Storage schema (§ 2.6) updated if any new/changed key
[ ] Smoke test in TESTING.md walked through (or stated as not run)
[ ] Diff re-read by me (not just the summary)
[ ] BUGS.md entry added if a bug was fixed
[ ] CLAUDE.md, ARCH.md, TESTING.md updated if any new pattern / pitfall / scenario
```

---

## 7. PROJECT REFERENCES

- **`BUGS.md`** — every fixed bug, indexed `BUG-NNN`. Search by symptom before diagnosing.
- **`ARCH.md`** — module responsibilities, data flow, dependency graph (blast radius), state locations, permissions map.
- **`TESTING.md`** — smoke test, per-feature tests, regression tests pinned to `BUGS.md` entries.
- **`IDEAS.md`** (created on demand) — out-of-scope observations to revisit later.
- **`SETUP_GUIDE.md`** — user-facing setup docs.
