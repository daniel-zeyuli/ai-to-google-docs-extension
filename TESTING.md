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
  - Top: italic `*ChatGPT · YYYY-MM-DD · <conversation title>*` then the citation line per the popup setting (MLA by default, see B11.7)
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

### B11.7. Citation header (v4.0.0+; style setting v4.5.0)

**Setup:** Any platform. Popup → "Citation line in exports" = **MLA** (the default when unset).

**Action:** Export Last to Drive (or Local .docx).

**Expected (MLA, per the MLA Style Center's Aug 2025 guidance — no author, tool is the container):**
- Top of doc: line 1 italic `ChatGPT · 2026-MM-DD · <conversation title>`; line 2 plain text with only the tool name in italics:
  `Citation (MLA): "<title>" prompt. *ChatGPT*, OpenAI, <D> <Mon.> <YYYY>, https://chatgpt.com/c/<id>.` — the URL keeps its `https://` so it stays clickable in Google Docs.
- Publisher/vendor: ChatGPT→OpenAI, Gemini→Google, Claude→Anthropic, DeepSeek→DeepSeek, Perplexity→Perplexity AI.
- Title has no stray `*`, `_` or backticks.
- After **append** (chip → [+↩] → Last response): the appended content goes BELOW the original; the citation stays at the top, untouched.

**APA** (popup → APA): line 2 is `Citation (APA): OpenAI. (<YYYY>). *ChatGPT* [Large language model]. https://chatgpt.com` — a tool-level reference (private chat URLs aren't retrievable, so APA's chat-level form isn't used).

**None** (popup → None): only the italic `ChatGPT · date · title` line, then the body. No citation line at all.

**Persistence:** change the setting in the popup, export again in an already-open AI tab — the new style applies without reloading the page.

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
- **BUG-042** (Claude: export button also under the user's own message): Ask Claude a question. Check the **user's own message** — it must have NO export button. Only Claude's reply gets one.
- **BUG-043 / DeepSeek+Perplexity equivalent** (Export Full Conversation silently drops questions): Step B3, but on Claude/DeepSeek/Perplexity specifically. The doc must contain a "You:" section for every question. If you instead see a "⚠️ Notice" section saying your messages couldn't be detected, that's the fallback firing — report it, since it means the underlying selector needs fixing, not that the fallback is broken.
- **BUG-044** (floating selection button overlaps selected text): Select a multi-line paragraph near the top of the viewport on any supported platform. The floating "→ Append to…" button must appear in clear space (above or below the selection), never on top of the highlighted text.
- **BUG-045** (ChatGPT: Export Full Conversation was completely broken): Step B3 on ChatGPT specifically. Must NOT show "❌ No conversation content found". Doc must contain both your questions ("You:") and ChatGPT's replies, in the right order. **Highest priority regression to verify this round** — this was a confirmed total failure, not a hypothesis.
- **Recent-docs scroll** (append-to-recent list expansion): Export to Drive 5+ times in different documents to build up history, then open the panel. The "Append to recent" list must show more than 2 entries (up to 8) and scroll inside its own short strip — not grow the whole panel taller, not squeeze each row narrower.
- **Recent-docs compact height:** With exactly one recent document, open the panel and confirm the strip is one row tall; with 8 documents, confirm it grows to the capped strip and scrolls internally.
- **ChatGPT full-conversation numbering:** Export a multi-turn conversation. Confirm user messages and assistant replies are all present in order, and assistant headings are numbered `Response 1`, `Response 2`, etc.
- **Context menu scoping**: Select text on a non-AI site (e.g. wikipedia.org) and right-click. "Export to Docs" must NOT appear there. Select text on any of the 5 supported platforms and right-click — it must appear.
- **v4.5.0 — popup:** Version badge equals `manifest.json` version (not hard-coded). With cleared storage, "When I click Export" shows **Choose replies (recommended)** selected. The three numbered steps sit right under the header/status line; section labels ("Save to", "When I click Export") are clearly readable in light and dark mode. Only the *selected* Save-to / mode row shows its grey description line (the others are single-line to keep the popup under Chrome's 600px popup limit — measured ~553–581px in headless Chrome with stubbed APIs; the popup should NOT show a vertical scrollbar on a normal AI page, empty chat, or non-AI tab; it may scroll when Notion/Obsidian is selected or "More options" is expanded). "More options ▾" → "Show in export panel": uncheck Notion/Obsidian → they disappear from the Save-to list; the last remaining option cannot be unchecked; the currently selected destination never disappears. The same section holds the Citation select.
- **v4.5.0 — page button:** Export button on each AI reply shows the new document-arrow icon (not the Google Drive logo) and "Export" text readable in light AND dark theme; with Notion selected it reads "Export to Notion". Verify on ChatGPT, Claude, Gemini at least. Check that it no longer overlaps the native Copy icon on ChatGPT (hypothesis fix: `flex:none; min-width:max-content`) — if it still overlaps, capture the button's Computed tab (width/min-width).
- **v4.5.0 — panel grid + hiding:** Destination buttons show as a grid (3 + 2), no horizontal scrolling, all five visible. Hide Notion/Obsidian in the popup → panel shows only the remaining ones.
- **v4.5.0 — inline Notion/Obsidian setup:** With Notion selected and no token: card shows 3 steps + token/page fields + "Step-by-step guide →". Paste a token and a full Notion page URL → Save → "✓ Notion connected"; export to Notion works; popup shows "Connected". Select Obsidian: note + optional vault field; an entered vault name is used by the next export.
- **v4.5.0 — first-run hints (new-user path):** In a fresh Chrome profile (or clear `onboardingSeen` and `globalRecentDocs`): bubble "Click Export under any reply to save it" appears above the first visible Export button, follows it on scroll, disappears on any click, and never returns after reload. Opening the panel for the first time shows "Choose where to save ↓" once. For an existing user (has recent docs) neither hint appears.
- **v4.5.0 — Send report:** Trigger any "❌" failure toast (e.g. export to Notion with a wrong token). Toast stays ≥9 s and shows **Send report**. Click → "Sent — thanks!" and a new row appears in the Google Form responses with Platform, Extension version, Destination, Export mode, Error message, Browser — and **no chat content or conversation URL**. "⚠️" validation toasts have no report button.
- **v4.5.0 — citation style:** Popup "Citation line in exports": switch MLA → APA → None, export the last reply each time (Markdown `.md` is enough, no OAuth needed), and check the first lines match B11.7. Spanish Chrome UI: label reads "Línea de cita en las exportaciones", option "Ninguna".
- **v4.5.0 — popup page status:** Open the popup on (a) a ChatGPT/Claude/Gemini conversation with replies → green dot "Found N replies on this page" (N is roughly the number of AI replies; ChatGPT image-only replies are counted but have no button yet — CHATGPT-001), (b) a brand-new empty chat → grey "No AI replies on this page yet." plus the "Replies here but no Export button? Send report" link, (c) any unrelated tab (e.g. wikipedia.org) → "Open ChatGPT, Gemini, Claude, DeepSeek or Perplexity to export.", no report link. In (b) click Send report → "Sent — thanks!" and a new Form row with Error message `Popup check: 0 AI replies detected on this page`.
- **BUG-050** (ChatGPT full export loses your messages): Step B3 on ChatGPT in a conversation with 2+ turns. The doc must have `## You` sections for every question and NO "⚠️ Notice" section. If the Notice appears, send `h4`/message-unit outerHTML of one user turn.
- **BUG-051** (dollar amounts became math): Ask ChatGPT "Compare a $110 plan with a $120 plan and a $1,200 yearly fee" (or any answer with 2+ dollar amounts in one sentence), export to Word/Drive. The `$` signs and the text must appear unchanged — no equation objects. Also confirm real inline math in the same doc still renders as equations.
- **v4.5.1 — welcome page:** On a FRESH install (new Chrome profile → Load unpacked) a tab opens: "You're all set — let's export your first AI reply", three steps, ChatGPT as the primary button, the other four in a 2×2 grid; every site button opens that site in a NEW tab; step 2 shows the blue Export pill pulsing; it fits one laptop screen. Reloading/updating an existing install must NOT open it (if a tab appears on reload, report it). Spanish Chrome shows Spanish.
- **v4.5.1 — Export button look:** On each platform the Export button is a **blue-tinted pill with a blue icon and dark text** (light text on dark pages), clearly different from the host's gray icons; tooltip ends "— AI Chat Exporter"; no overlap with native icons. A NEW user sees a soft pulse until their first click on it (never again after); an existing user (has exported before) never sees the pulse.
- **v4.5.1 — popup on an AI page:** With replies on the page the popup shows "Found N replies" and **Show me the Export button**; clicking it closes the popup, scrolls to the newest reply's button, rings it and shows a "Here it is — click Export" bubble that disappears after ~6 s or on any click. The generic how-it-works list is hidden in this state.
- **v4.5.1 — popup off an AI page:** On a non-AI tab (new tab page, google.com): "Open an AI chat on its website (not the app):" plus ChatGPT / Claude / Gemini / DeepSeek / Perplexity buttons, each opening the site in a new tab; steps 2–3 shown (the Export pill picture next to step 2), step 1 hidden; **no vertical scrollbar**. On an AI page with no replies yet: "No replies yet — send a message and the blue Export button appears under the reply." + report link.
- **BUG-052** (invisible panel checkboxes): Open the panel on ChatGPT. The selected reply shows a blue box with a white tick; unselected rows show an empty bordered box; "Select all" ticks every row, "Deselect all" empties them. Check in light and dark theme.
- **BUG-053** (button colour / Markdown label): On DeepSeek the Export button text is dark gray (light theme) or light gray (dark theme) on the blue-tinted pill — never purple text or a purple background (the host's action-bar colour must not leak into it). Select Markdown in the panel: the main button says "Save .md →" (Word → "Save .docx →", Drive → "Export to Docs →").
- **CHATGPT-001** (not fixed, needs data): Generate an image with ChatGPT (DALL-E). Check whether an export button appears on that response at all. If not (expected per this gap), right-click the image response's download/regenerate icon → Inspect → Copy outerHTML, and hand that over to continue the fix.

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

## v4.5.1 — Send report diagnostics
- Force "❌ Could not extract content" (e.g. temporarily point the finder at an empty element), click Send report → the Google Form row's Diagnostics column holds `path=… | roles=… | matched=… | textlen=… | md=… | dom=…`.
- Diagnostics must contain no chat text, hrefs, ids, aria-labels or conversation ids (checked in headless Chrome against a fixture with planted secrets: no leaks).
- Reports from the popup ("0 AI replies detected") leave Diagnostics empty — expected.

## v4.5.1 — Detached reply in panel (BUG-054)
- Long Claude/ChatGPT chat: open the panel, scroll far away from the selected reply, click Export → either exports normally (re-found) or shows "That reply is no longer on the page…" — never "Could not extract content".
- Send report from that toast → Diagnostics starts with `path=… | roles=… | connected=0`.
