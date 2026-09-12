# TESTING.md — Verification Checklist

Walk through this file after any non-trivial change. Be honest: if you didn't run a test, mark it as **not run**, not as "should work."

> The format is "do this exact action, expect this exact result." If the result doesn't match exactly, the change is not done.

---

## A. Smoke Test (run after ANY change)

| # | Action | Expected | Common failure |
|---|--------|----------|----------------|
| A1 | Load unpacked at `chrome://extensions/` (with Developer mode on) | Loads cleanly. No red error banner. Version in `chrome://extensions/` AND in popup-badge AND in `manifest.json` all match. | Manifest JSON syntax error (forgot trailing comma); CSP/sandbox shape wrong (BUG-006, BUG-014); version drifted between `manifest.json` and `popup.html` badge. |
| A2 | Open ChatGPT, send a message, wait for response | "Export to Docs" button appears in the action bar, immediately to the **left** of the three-dots menu. | BUG-003, BUG-011 patterns (selector drift). |
| A3 | Open Gemini, send a message | Same: button appears next to copy. | Gemini DOM lazy-loads — wait 1–2 s. |
| A4 | Open claude.ai, send a message | Same. | Claude wraps copy buttons inside code blocks too — selector must exclude those. |
| A5 | Click Export → choose Last → click Last | Toast `⏳ Uploading…` → `✅ Created "<filename>"` → new Doc opens in a tab. | "Sign-in" toast on first run is fine; consent flow should complete. |
| A6 | Open DevTools → Console on host page | No red errors during steps A2–A5. (Yellow warnings from the host site are OK.) | Uncaught promise rejections; "Cannot read property of undefined" in `processNode`. |
| A7 | Open DevTools → "service worker" inspector for the extension | No red errors. | Background-side throws on token errors, multipart parse, etc. |
| A8 | `python3 -m json.tool manifest.json` | Prints reformatted JSON, no error. | Syntax error blocks load. |
| A9 | `grep -n "chrome.windows\|chrome.tabs\|chrome.identity" content.js` | **Empty output.** | CLAUDE.md § 2.2 violation. |

---

## B. Per-Feature Tests (run if you touched the relevant area)

### B1. Single-response export → Drive

**Setup:** Have a ChatGPT response with a mix of: paragraph text, a numbered list, a code block, an inline equation `$E=mc^2$`, a display equation `$$\int_0^1 x^2\,dx$$`, and a table.
**Action:** Click Export → Last (or use the export button on that specific message).
**Expected:**
- Toast progresses: `⏳ Uploading…` → `✅ Created "…" in Google Drive! Opening…`
- New tab opens to the Doc within ~500 ms.
- Doc contains: header line `*ChatGPT · YYYY-MM-DD · <conversation title>*`, source URL beneath it, then the response.
- Equations render as native Google Docs editable equations (not as LaTeX text or images).
- Table renders as a Google Docs table.
- Code block uses monospace.
- "AI Chat Exports" folder exists in Drive root and contains the new doc (unless `customFolderId` is set, in which case the new doc lives there).
**Common failure modes:** math rendered as raw `$...$` (converter.js regression), table flattened (table strategy fallback), header missing (suffix wiring).

### B2. Single-response export → Local

**Setup:** Same response. Set destination to "Local .docx" (in popup or panel).
**Action:** Click Last.
**Expected:** Browser shows "Save As" dialog (because `saveAs: true`). Saved file opens in Word/Pages/etc. and looks identical to the Doc above.
**Common failure modes:** corrupt zip (CRC32 broken in converter.js); wrong filename suffix.

### B3. Full conversation export

**Setup:** Conversation with at least 3 AI responses.
**Action:** Click Export → Full.
**Expected:**
- Doc contains all 3 responses.
- Each separated by `## Response N`.
- One metadata header at the top, not per-response.
**Common failure modes:** only the last response is captured (`getAllAIMessages()` selector drift); responses out of order.

### B4. Pick (multi-select) panel

**Setup:** Conversation with 5+ responses, including one containing a `<table>`.
**Action:** Click Export → Pick. Uncheck a couple. Click Export Selected.
**Expected:**
- Right-side panel opens showing all responses with checkboxes (all checked by default).
- 📊 CSV button appears on the row(s) with a table.
- Clicking 📊 downloads the CSV; clicking Export Selected creates one Doc with only the checked responses.
**Common failure modes:** panel toggle-close swallows the Pick action (BUG-012 pattern); checkbox state not respected.

### B5. Folder picker — hierarchical navigation

**Setup:** Drive account with at least one nested folder structure (e.g. `My Drive > School > Grade 12`). Open the export panel; verify Drive button is the active destination.
**Action:** Click the Drive button (it should be in Drive mode — re-click means "change folder").
**Expected:**
- In-page modal opens with title "Choose export folder".
- Breadcrumb shows just `My Drive`.
- List shows top-level folders only.
- Click into "School" → breadcrumb extends to `My Drive › School`, list shows School's children.
- Click "School" in the breadcrumb → goes back to root level.
- Type "grade" in search box → flat list of all folders matching "grade".
- Clear search → returns to current navigation level.
- Click "+ New folder" while inside School → new folder is created INSIDE School.
- Click Select while inside "Grade 12" → modal closes; export panel STAYS OPEN; path row updates to `📁 Grade 12`; Drive button label updates.
- Click Cancel → modal closes; panel stays; nothing changed.
**Common failure modes:**
- Flat list of all folders → BUG-017 reverted.
- Picker uses fullscreen window → BUG-010 reverted.
- Panel closes on Select → BUG-015 reverted (check `outsideClickHandler` `.closest('.cgd-pk-overlay')` short-circuit).
- Picker hangs at "Loading…" → BUG-008 (interactive auth from spawned window).

### B6. Append to existing doc

**Setup:** Have at least one prior export visible as a chip in the panel.
**Action:** Hover a chip → click `[+↩]` → choose "Last response".
**Expected:**
- Toast `⏳ Appending…` → `✅ Appended to "<name>"`.
- Open the doc → the new content is appended at the end with a separator `Added YYYY-MM-DD` and the response below.
**Common failure modes:** wrong fileId (storage key mismatch); 403 from Docs API (drive.file scope can't append to docs the extension didn't create).

### B7. Recent chips deduplication

**Setup:** Export the same response twice in a row (each export creates a new Doc with the same auto-generated filename).
**Action:** Open the panel.
**Expected:** **Only one** chip shown for that filename, not two. (Dedup by both `fileId` and `fileName`.)
**Common failure modes:** BUG-016 reverted.

### B8. Image embedding

**Setup:** A response containing at least one inline image (e.g. ChatGPT diagram or Gemini chart). Some images load same-origin; some are blocked by CORS.
**Action:** Export to Drive.
**Expected:**
- Same-origin images: embedded inline in the Doc as resized PNGs (max 1200 px wide).
- CORS-blocked images: extension prompts for site permission once; on grant, the image is fetched via background and embedded; on deny, replaced with `[Image: <alt>]` text.
**Common failure modes:** giant un-resized images blow past the 5 MB Drive multipart limit.

### B9. Keyboard shortcut

**Setup:** Bind `Cmd-Shift-E` (default) at `chrome://extensions/shortcuts`.
**Action:** On a chat page, press the shortcut.
**Expected:** Triggers the user's `defaultExportMode`. On a non-chat page: nothing happens (no toast, no error).
**Common failure modes:** "no receiver" error in console because the active tab isn't a content-script target — should be silently swallowed by the `void chrome.runtime.lastError` line.

### B10. Popup UI

**Action:** Click the toolbar icon.
**Expected:**
- Save-to: clicking Drive vs. Local toggles the radio and persists `exportDest`.
- Default mode: clicking Last/Full/Pick highlights and persists `defaultExportMode`.
- Folder display: `customFolderName` shown if set, else `AI Chat Exports`.
- Click `›` (change folder): opens picker window (legacy popup picker; in-page modal is from the host page only).
- Customize shortcut link → opens `chrome://extensions/shortcuts`.
**Common failure modes:** popup width drifted (must be 252 px); wrong storage key (silent no-op).

### B11.5. Markdown (`.md`) export (v4.0.0+)

**Setup:** Open the export panel on any AI page. Click the third destination button: **📝 Markdown**.

**Action:** Click Last (or Full / Pick).

**Expected:**
- Path row reads: `Saving as: 📝 Markdown (.md)`.
- Browser shows "Save As" dialog (because `saveAs: true` in `chrome.downloads.download`).
- Default filename ends in `.md` (e.g. `Quadratic_Formula_Practice.md`).
- Saved file opens cleanly in any text editor or Markdown viewer (Obsidian, Notion paste, VSCode, etc.).
- File contents:
  - Top: italic `*ChatGPT · YYYY-MM-DD · <conversation title>*` then italic `*Citation (MLA): ...*`
  - Body: raw markdown (no `.docx` conversion).
  - **No** trailing citation block (citation now lives in the header).

**Common failure modes:**
- File downloads as `.docx` instead of `.md` → check `mime` parameter passed in `downloadLocal` message; check `background.js` line ~38 reads `mime` from the request.
- File contents binary-corrupted → `TextEncoder` / `btoa` chunk loop in `exportMarkdown` is broken; check it produces single-byte chars.
- File saves but is empty → `markdown` variable was overwritten before encoding.

### B11.6. Per-platform folder organization (v4.0.0+)

**Setup:** Fresh install (or delete the "AI Chat Exports" folder in your Drive first). Drive destination active.

**Action:** Export from ChatGPT. Then export from Gemini. Then export from Claude.

**Expected:**
- After ChatGPT export: Drive contains `AI Chat Exports/ChatGPT/<filename>.docx`.
- After Gemini export: Drive contains `AI Chat Exports/Gemini/<filename>.docx`.
- After Claude export: Drive contains `AI Chat Exports/Claude/<filename>.docx`.
- All three subfolders live under the same `AI Chat Exports` parent.
- Path row in the panel shows `Saving to: 📁 AI Chat Exports / <Platform>` (matching the active page).
- `chrome.storage.local` contains `exportFolderIds: { ChatGPT: '...', Gemini: '...', Claude: '...' }` after exporting from each.

**Common failure modes:**
- Files all land in the parent `AI Chat Exports` folder (no subfolder) → `platform` not passed in `uploadToDrive` message; check `content.js` line ~513.
- Subfolder created twice → `_getOrCreateFolder` storage check is broken; verify it reads/writes the correct key.
- 403 from Drive API on subfolder creation → `drive.file` scope shouldn't matter (extension created the parent), but if you're seeing this, try deleting the AI Chat Exports folder in Drive and re-exporting.

### B11.7. Citation header (v4.0.0+)

**Setup:** Any platform.

**Action:** Export Last to Drive (or Local .docx).

**Expected:**
- Top of doc has TWO italic lines:
  1. `*ChatGPT · 2026-MM-DD · <conversation title>*`
  2. `*Citation (MLA): OpenAI. "<title>." ChatGPT, <D> <Mon>. <YYYY>, <URL>.*`
- The URL inside the citation is clickable (Google Docs auto-linkifies).
- For Gemini exports: vendor = "Google", platform = "Gemini".
- For Claude exports: vendor = "Anthropic", platform = "Claude".
- After **append** (chip → [+↩] → Last response): the appended content goes BELOW the original; the citation stays at the top, untouched.

**Common failure modes:**
- Citation appears at bottom and gets buried by appends → check `exportMarkdown` puts citation in the prepend, not the append.
- Conversation title shows underscores (`Quadratic_Formula_Practice`) → the `.replace(/_/g, ' ')` in citation construction was lost.

### B11.8. i18n popup (v4.0.0+)

**Setup:** Open `chrome://settings/languages` and move Chinese (Simplified) to the top of "Preferred languages."

**Action:** Click the extension toolbar icon to open the popup.

**Expected:**
- Header: `AI 聊天导出` / `Google 文档`.
- Section labels: `保存到`, `默认模式`, `键盘快捷键`.
- Mode tabs: `↩ 最新`, `≡ 全部`, `☑ 选择`.
- Mode hint switches per tab (Chinese sentence).
- Customize link: `自定义 →`.

**Then move English back to top, reload the popup:** All strings in English again.

**Common failure modes:**
- All strings stay English even with Chinese active → `default_locale` missing from manifest, or `data-i18n` attributes missing in popup.html.
- Empty popup → `popup.js` syntax error; check `chrome.i18n.getMessage` calls.

### B11. Dark mode

**Setup:** A host page that's currently in dark mode (Claude with dark theme, or system dark mode).
**Action:** Open the export panel; open the folder picker; trigger an append dropdown.
**Expected:** All in-page UI honors dark mode (`.cgd-dark` class applied; colors readable). No white blobs.
**Common failure modes:** BUG-013 pattern — new UI element added without `.cgd-dark` rule.

---

## C. Regression Tests (one per BUGS.md entry — these MUST pass)

> Each entry maps to a `BUG-NNN`. If symptom returns, you are looking at a **regression** — escalate per CLAUDE.md § 4.

- **BUG-001** (manifest perms): Step A1 + A5. If Drive upload fails with auth error, check manifest's `identity` perm and `oauth2` block.
- **BUG-002** (KaTeX duplicated math): Test B1 with display equation. If equation appears twice, BUG-002 is back; check `processNode`'s ancestor-skip logic and Strategy 3's `:scope > .katex-mathml annotation` selector.
- **BUG-003 / BUG-011** (button placement): Steps A2, A3, A4. Button must sit **before** the three-dots menu, not after, on all three platforms.
- **BUG-004** (App security warning): Open consent screen on first sign-in; Google must NOT show the yellow "App not verified" banner due to a sensitive scope. If it does, audit `manifest.json` `oauth2.scopes` against CLAUDE.md § 2.1.
- **BUG-005** (OAuth client_id): Step A5 should succeed for the production extension ID (verifiable only when packed and installed from Web Store; for dev, the dev client_id must match the unpacked extension's chrome-generated ID).
- **BUG-006 / BUG-014** (sandbox CSP): Step A1 + A8.
- **BUG-007** (folder picker shows only AI Chat Exports): Step B5. The picker must show the user's actual folders, not just the auto-created one.
- **BUG-008** (picker hangs at "Loading…"): Step B5 — picker must reach the folder list within a few seconds of clicking the Drive button. Hanging indefinitely = BUG-008 returned.
- **BUG-009** (picker positioning): N/A for in-page modal (BUG-010 superseded). Re-test only if the popup picker (`picker-host.html`) is re-enabled.
- **BUG-010** (picker fullscreen on macOS): Step B5 on macOS with Chrome in fullscreen mode. Modal must overlay the page, not take over the screen.
- **BUG-012** (Pick from append dropdown): Have an export already, hover a chip → `[+↩]` → "Pick responses". Append-mode panel must appear (with Append column instead of Last/Full/Pick).
- **BUG-013** (dropdown dark mode): Step B11 — append dropdown must be readable on dark sites.
- **BUG-015** (panel closes after picker Select): Step B5, click Select. Panel must STAY OPEN.
- **BUG-016** (chip dedup): Step B7.
- **BUG-017** (hierarchical picker): Step B5.

---

## D. The "I didn't actually run this" honesty section

If you can't physically run a test (no Drive account, no macOS, no specific platform login), write that explicitly when reporting:

> "I verified by reading: A8, A9, the `outsideClickHandler` change matches BUG-015's lesson at `content.js:1345-1349`. I did NOT run: A2–A6 (no browser available in this session), B5 (no test Drive account)."

This is a fine and honest report. Claiming "all tests pass" without running them is the failure mode CLAUDE.md § 4 is built to prevent.

---

## E. When tests change

- **New feature shipped?** Add it as a `Bx` entry in section B.
- **New bug fixed?** Add a regression entry in section C, paired with the new `BUG-NNN` from `BUGS.md`.
- **Selector / DOM marker drift on a platform?** Update CLAUDE.md § 5 in the same commit, with a note in `BUGS.md` if it caused a real bug.
