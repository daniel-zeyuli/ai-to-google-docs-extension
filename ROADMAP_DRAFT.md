# Extension Roadmap — Draft for Joint Review

**Purpose:** agree on a small, ordered reliability plan before starting more implementation. This is a draft for review with Claude; it is not approval to ship or to expand platform support.

## Codex contribution: next action

Before starting unrelated code work, close the verification loop on the remaining live issues. BUG-029's DeepSeek outside-click result was not reported, BUG-031 still reproduces on Perplexity, and the BUG-032 DeepSeek extraction-root change is awaiting a live retest. Keep each issue's evidence separate so fixes remain attributable.

### Live verification checklist

| # | Setup / action | Pass condition |
|---|---|---|
| 1 | Reload the unpacked extension. In the popup, set `defaultExportMode` to **Pick / Select** before testing the panel. | Clicking an Export button opens the selection panel; the result is not mistaken for a panel-close success when Pick mode was never enabled. |
| 2 | DeepSeek: open the panel, click inside and confirm it stays open; click outside without dragging and confirm it closes. Reopen it, drag by the title bar, release, then click outside again. | Inside click keeps it open; direct outside click closes it; after dragging, outside click still closes it. This separately covers initial capture mounting and the drag detach/reattach path. |
| 3 | ChatGPT: open the same selection panel, click inside, then outside. | Inside click keeps it open; outside click closes it. This is a quick regression check for the shared capture-phase listener. |
| 4 | DeepSeek: inspect a conversation with at least 3 assistant turns. Confirm every turn, including the newest, has a button. Include a response that exercises the icon-only/scope-widening fallback in `_findCopyActionBar`, if the live DOM allows it. | All turns have one button. If no response exercises the fallback branch, record it as **not covered**, not passed. |
| 5 | Perplexity: inspect a conversation with at least 3 assistant turns. Confirm every turn, including the newest, has a button, then export the newest response. | Every turn has one button and the exported body matches the newest response. |
| 6 | Record each result separately and note any console errors. | Any failure has the affected platform, step, and DOM/error evidence; fix only that failed case before continuing. |

Mark each bug verified only after its own live check passes. Continue to Step 0 (release/platform state) only when BUG-029, BUG-031, and BUG-032 are resolved or explicitly deferred. The button's position is accepted and should not be reopened as a task unless it becomes hard to find or obstructs content.

### Results reported by maintainer — 2026-09-28

| Check | Result | Follow-up |
|---|---|---|
| DeepSeek, 3+ turns: button present on every answer | **Pass** for button coverage; export correctness failed separately. | Keep this result separate from the export failure. The icon-only fallback branch itself was not confirmed as exercised. |
| DeepSeek export of math/citation response | **Failed before fix.** Maintainer clicked that answer's own button after generation ended. Export body started with “Here are some easy math equations with citations:” and then had no further content. DOM identified the target root as `.ds-markdown.ds-assistant-message-main-content`; extraction now prefers that passed root over a nested markdown paragraph. | Reload and repeat the same single-answer export. Mark BUG-032 verified only if the full answer and equations appear. |
| DeepSeek outside-click panel, including post-drag | **Not reported.** | BUG-029 is still unverified until direct outside click and post-drag outside click both pass. |
| Perplexity, 3+ turns: all answer buttons present | **Fail.** Newest conversation turn's button is missing; earlier turns have buttons. | BUG-030's catch guard did not establish the acceptance condition. First check whether the newest turn is returned by `_perplexityFindResponses()`; the catch only protects `_findCopyActionBar`, so it cannot recover a response the finder omits. |
| Perplexity export from a visible button | **Pass** for the tested existing buttons. | Still export the newest answer after its button reappears to confirm selected-response correctness. |
| ChatGPT panel checks | **Pass**, as reported by maintainer. | No follow-up unless a regression appears. |

The live verification gate remains open: the DeepSeek extraction-root fix needs a live retest, Perplexity newest-turn button coverage still fails, and the DeepSeek outside-click result was not reported. Do not proceed to Step 0 until these are either fixed and verified or explicitly deferred by the maintainer.

### Diagnosis order after the failed checks

1. **DeepSeek export truncation (BUG-032):** code fix now prefers the passed `.ds-markdown` root when `messageEl` is already that response container, instead of selecting a nested markdown paragraph. Retest the same completed single-answer export; confirm all sections and equations appear.
2. **Perplexity missing newest button (BUG-031):** determine whether `_perplexityFindResponses()` includes the newest `.prose` node. If absent, fix/verify response discovery; if present, trace the remainder of `addPerplexityButtons`. BUG-030's try/catch only converts action-bar lookup failures into fallback placement.
3. **BUG-029:** still obtain the direct and post-drag outside-click results; the maintainer's latest report did not state those outcomes.

## Step-by-step plan

| Step | Priority | Work | Done when |
|---|---|---|---|
| 0 | P0 — state cleanup | Reconcile the current checkout before further edits. `IDEAS.md` says DeepSeek and Perplexity are deferred, while the uncommitted `manifest.json` adds both sites back. Check the intended release scope, current store listing, and existing local changes; then decide whether to keep or remove those matches. | The manifest, store listing, project docs, and actual intended support list agree. No platform is presented as supported only because its URL was added to the manifest. |
| 1 | P1 — export correctness | Reproduce and resolve the known citation-heavy export mismatch noted under BUG-026: compare the selected response with the exported body, including inline citations and citation cards. Start with whichever platform still reproduces it. | The export contains the selected response in the right order and does not substitute a citation-card sentence or another response. Record platform and scenario. |
| 2 | P1 — shipped-platform baseline | Run the core smoke flow on ChatGPT, Gemini, and Claude: button detection, Last/Full/Select, Drive and local export, plus Markdown/Notion/Obsidian destinations if they are part of the current build. Spot-check math, tables, code, images, and long responses. | A short pass/fail matrix exists for each platform and destination. Regressions are linked to a `BUGS.md` entry and a specific `TESTING.md` case. |
| 3 | P2 — DeepSeek/Perplexity decision | On live pages, inspect response extraction and action bars in at least one non-English locale and during/after streaming. Check duplicate prevention and panel behavior. BUG-030's catch guard is not sufficient evidence because the newest Perplexity turn still loses its button. Keep support deferred if selectors or extraction are still unreliable. | For each platform, either there is a reproducible pass across extraction, button placement (every turn gets one, not just some), streaming, panel open/close (including outside-click), and one export—or the platform remains disabled and the reason is documented. |
| 4 | P2 — project documentation sync | Align the repository overview and extension docs with the actual build. The top-level `AGENTS.md` says v3.9.2, while the extension manifest and popup badge say v4.3.0; update stale platform, destination, and pending-bug notes after Steps 0–3 settle. | One source of truth states the current version, supported platforms, destinations, known limitations, and deferred work. `BUGS.md`, `IDEAS.md`, `CLAUDE.md`, `TESTING.md`, README, and store wording do not contradict it. |
| 5 | P3 — release readiness | Only after the above passes: review permission scope, validate the MV3 manifest, package from the agreed source state, and check that release notes/store disclosures match actual functionality. Do not bump the version until the maintainer chooses to release. | The package matches the reviewed source, required checks pass, and no unsupported platform or capability is advertised. |

## Current known issues and decisions

| Item | Current understanding | Priority / decision |
|---|---|---|
| DeepSeek/Perplexity button position | Maintainer confirmed the button reliably lands on the right side of the response area on both platforms. Not pixel-aligned with the native action bar, but the maintainer considers this acceptable. | Resolved to "good enough" per maintainer. Do not spend further effort on pixel alignment; only revisit if the button becomes hard to find or overlaps content. |
| DeepSeek: select panel doesn't close on outside click | Reproduced by the maintainer. Suspected cause: DeepSeek's own click handlers call `stopPropagation()` during the bubble phase, so the panel's `document`-level bubble-phase listener never fires. Fix applied: listener moved to the capture phase at all four attach/detach call sites (BUG-029). | Fix applied, **not yet re-verified live**. Must be confirmed on DeepSeek before Step 3 can close: click outside the panel after opening it and confirm it closes. |
| Perplexity: newest turn has no export button, previous turn's button still present | Reproduced by the maintainer. BUG-030 hypothesized that `_findCopyActionBar` threw and added a try/catch fallback. The maintainer's later multi-turn test still found the newest turn missing, so that change did not fix the acceptance failure; the original root-cause theory is not sufficient. | BUG-031 remains open. Determine whether `_perplexityFindResponses()` returns the newest response before making another selector or exception-handling change. |
| Citation-heavy exports | `BUGS.md` records an unconfirmed case where the document body may contain a citation-card sentence instead of the expected answer. | Higher than button alignment because it can export the wrong content. Reproduce before changing extraction logic. |
| DeepSeek math/citation response truncated | A completed single-answer export contained only the opening sentence. The DOM identifies the response root as `.ds-markdown.ds-assistant-message-main-content`; extraction now prefers this passed root over a nested markdown paragraph. | BUG-032 code change awaits live retest; do not mark resolved from code inspection alone. |
| Perplexity newest response has no button | In a 3+ response thread, the newest turn lacks a button while earlier turns work; BUG-030's catch guard did not resolve it. | BUG-031 remains open. Check response discovery first, then trace injection if the finder includes it. |
| DeepSeek/Perplexity support state | Docs say these platforms were deferred, but local uncommitted manifest changes add them back. Runtime reliability and store disclosure are not yet confirmed. | Resolve first in Step 0; preserve current local work until its intent is clear. |
| Third-party images in Claude | `IDEAS.md` says external CDN images may remain links because the browser cannot fetch them across CORS; first-party Claude images can embed. A server proxy is outside the extension's current scope. | Known limitation, not an immediate fix. Keep documentation accurate. |
| Full Drive search for append | `IDEAS.md` lists Google Picker-based search as deferred; broader Drive scopes are disallowed by project rules. | Decide whether this remains a desired feature after reliability work. Do not add OAuth scopes as a shortcut. |
| Version and release artifacts | The extension says 4.3.0; the top-level project instructions say 3.9.2. There is also an untracked `dist/` directory in the current checkout. | Inspect provenance before editing or replacing artifacts; never overwrite or package unknown local output without confirming it is the intended release input. |

## Guardrails for the joint review

- Prioritize correct exported content and reliable core flows over button alignment or new features.
- Do not broaden OAuth scopes, add a build system, or change the version as part of routine fixes.
- Keep DeepSeek and Perplexity out of the advertised support list until live-page checks pass and store disclosures match.
- For each fix, name the user-visible failure, the smallest affected code path, and the exact verification scenario before implementation.

## Suggested first action

Keep this test round open. First reload the extension and retry the same completed DeepSeek single-answer export against BUG-032's extraction-root change. In parallel, diagnose why the newest Perplexity turn is absent or skipped; BUG-030's helper catch did not fix the missing-button symptom. Also run the two unreported DeepSeek panel outside-click checks. After these outcomes are resolved and recorded, review Step 0: decide whether the uncommitted DeepSeek/Perplexity manifest entries are intentional, then settle the supported-platform list.
