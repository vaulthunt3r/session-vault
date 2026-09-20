# Session Vault

## Current version

1.1.0 source, with subsequent readability/color-indicator changes. Existing Electron/SQLite architecture retained. The earlier EXE/ZIP snapshots do not contain these UI changes; building is now user-owned.

## Product purpose

Local-first, read-only viewer, navigator and analysis tool for Codex JSONL history. Automatic local extraction by default; optional manual annotations. No account, server or model API.

## Implemented

Welcome/sources; conversation and Unicode FTS; protected session/period exports; project overview; daily chapters and session outline; event feed, horizontal timeline, typed lanes, recorded branching history and activity calendar; typed entity map and frequency graph; candidate decisions/tasks; source inspector, tool pairs, internal references, text comparison; pinned/archive lists; command palette and resizable/hideable panels; EN/RU/UA; themes and persistence. Original supplied logo restored. Settings enables manual labels/notes, stored separately from originals and rebuildable index.

## Known limitations

Automatic labels are heuristic candidates, not verified decisions/outcomes. Recorded parent links are not Git merges. File nodes are mentions, not verified modifications. Chapters group UTC days, not semantic phases. Exact cwd project grouping. Analysis: 200k scanned records, 6000 displayed events, 4000-character previews; narrower filters recommended. Entity/branch/lane/calendar limits are disclosed in UI. Existing parser bounds still apply (README). Limited Markdown/media. References open inside the app, not via Windows protocol. Windows x64 unsigned portable, user data in APPDATA; new export files need hard-link-capable filesystem (NTFS recommended). Back history is per launch.

## Deferred / future

No expansion backlog is implied. User excluded AI summaries/semantic features, graph physics/minimap, multi-conversation panes, external link integration and the other previously listed extras. Keep the product focused on its existing local viewer. Additions need a new concrete user request.

Current UI: larger body/metadata text, tighter cards/header/margins, narrower branch gutter. Appearance settings offer restrained or semantic event colors, persisted in Local Storage and adapted to light/dark palettes. Text labels remain visible.

## Test status

21/21 unit/regression tests pass. Actual Electron project-history smoke passed all eight views, three languages, note persistence through index rebuild, pins, report export, source immutability and small-window layout, errors=[]. Existing viewer runtime regression passed. See VALIDATION.md for evidence and manual checks.

## Release status

Historical build (before the latest UI changes): Windows x64 portable 1.1.0 built and verified from its own executable. New history smoke and existing viewer smoke pass with errors=[]; 52 local sessions scanned, 28 theme families / 43 variants checked. A separate process restart restores conversation page, window size and language. Native product/file version verified: 1.1.0 / 1.1.0.0. Previous 1.0 archives remain unchanged. This implementation covers the local automatic interpretation of the supplied designs; it does not claim AI semantics or every decorative mockup detail.

## Latest source fix — 20 September 2026

Overview sessions now paginate (40/page), without the previous hidden 80-session cutoff. Vault/project/service controls refresh the overview consistently; Back restores its page. Add JSONL is in the vault header, freeing the session-list footer. Actual Electron regression covers 86 sessions, navigation and picker cancellation; errors=[]. Existing 21 unit tests pass. Not included in earlier binaries/archives.

## Latest timeline fix — 20 September 2026

Horizontal/swimlane events use non-overlapping time buckets with counts and a readable paginated member list. Single events open the inspector directly. No 250-event lane truncation; the analysis-level cap remains explicit. 23 unit tests and dense actual-Electron UI regression pass (600 records, both modes, four zooms, clicks/source navigation). Source-only; earlier packaged artifacts are unchanged.
