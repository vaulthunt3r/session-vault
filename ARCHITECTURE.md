# Architecture — Session Vault 1.1

## Runtime and ownership

Existing Electron architecture, no framework migration. `src/main.cjs` owns the window, native dialogs, read-only source configuration, export destination checks and worker lifetime. `src/preload.cjs` exposes `vault.call` and a removable progress subscription. The renderer (`ui/app.js`) owns presentation/navigation only; it has no filesystem or Node access. `src/worker.cjs` serializes SQLite operations outside the main thread. No HTTP server or remote service.

## Data pipeline

`src/lines.cjs` streams 64 KiB chunks and bounds raw line size before UTF-8 decoding. `src/parser.cjs` normalizes legacy `response_item`/`event_msg` and newer canonical item events, metadata, tool calls/results, turn boundaries and token counters. Canonical mirror suppression is scoped by turn/text or external ID. Injected context is distinguished from actual user messages where canonical user events exist. Invalid JSON/object shapes, oversized records and unknown schemas are counted. Timestamps/counters are validated; binary content is excluded. Raw JSONL is never rewritten.

`src/store.cjs` uses built-in `node:sqlite`: WAL, foreign keys, `sessions`, `records`, external-content FTS5 and insert/delete triggers. IDs derive from the absolute source path. Each changed session replaces its index in a transaction. Version 3 of the cache invalidates old mtimes to reparse existing 0.3 sources. Refresh normally compares size/mtime; manual refresh forces reading. A post-read stat rejects a source changed during parsing. Inaccessible subdirectories are reported while accessible siblings continue. Symlink children are skipped. Overlapping lexical paths deduplicate through a Set.

Removing a configured source removes only corresponding indexed rows; temporarily missing files remain cached. Reappearing files regain availability. Index rebuild stops the worker, renames SQLite and sidecars to timestamped backups, then starts a new worker. Backups are retained; missing-source content is not imported into the fresh index.

## Boundaries and failures

IPC checks sender/main frame URL, operation and relevant argument shapes. Results use `{ok,data}` / `{ok:false,error}`; preload raises application errors. Unknown operations cannot reach the worker. Worker failures reject outstanding calls and make subsequent calls fail promptly. Dialog/source mutations are serialized; concurrent scans share a promise. Native cancellation leaves the current source state intact.

Renderer: `sandbox:true`, `contextIsolation:true`, `nodeIntegration:false`; escaped session text and a small Markdown renderer. CSP and network/navigation/permission policies keep content local. Reloading the exact application URL is allowed for language changes; other navigation is denied. Native show-in-folder resolves indexed paths; copy-path accepts indexed sessions/source indices. No arbitrary shell execution.

`src/export.cjs` canonicalizes destination parents/paths and protects sources, app resources and user data. Existing destination symlinks/hardlinks are rejected. Main prepares a unique sibling temporary file, rechecks protection, then renames to an existing confirmed destination or links to a previously absent destination without overwrite. New-file export requires filesystem hard-link support. Worker `writeExport` streams derived Markdown/JSON with backpressure; original JSONL is copied directly. The legacy synchronous `exportData` remains a store-level compatibility helper used by tests, not a public IPC endpoint.

## UI state and UX

Six primary views live in the left navigation. Search/export/settings/help are utility views with a snapshot stack. Snapshots contain session, view, mode, page, filters, query, scroll and focus. Search/outline/timeline jumps can return to the previous state. Selection/render tickets discard stale asynchronous responses. Refresh preserves the latest reading position. Conversation/chapters paginate by 60; timeline rendering is bounded. Long messages are collapsed before rendering full bounded text.

Workspace, language, theme and panel preferences use Electron Local Storage. Main persists sources/welcome/language atomically in `sources.json`, window normal bounds/maximization in `window.json`; off-screen placements are rejected. The window reapplies saved bounds after construction for Windows DPI behavior. Storage is `%APPDATA%\session-vault`, overridable by `SESSION_VAULT_DATA` for tests. Back-stack history is not persisted across process exits.

`ui/i18n.js`, `translations.js` and `help.js` implement EN/RU/UK. EN is the default. Only static UI literals/template segments are localized; session content, paths and interpolated values retain source text. `translations.txt` is the source catalog; `src/locales.json` supplies native translations. Both generated dictionaries must be updated together. Native OS/SQLite diagnostic details may remain in their original language.

`ui/appearance.js` and `theme-presets.js` implement System/Light/Dark, separate palette preferences and 28 families/43 variants. Existing layout/CSS/icon vocabulary is preserved; additional focus, disabled, loading and wrapped settings states live in `appearance.css`.

## Resource limits

8 MiB raw JSONL line, 200k characters/record, ~64 Mi characters and 250k candidate records/session. A single parsed session is bounded in memory but is not a zero-memory stream-to-database pipeline. FTS input is capped at 1000 characters/12 terms; UI results at 100. Chapters/timeline queries can return bounded-index collections to the renderer; conversation pages cap at 100 rows through IPC. Entity maps and word frequencies are deterministic, not semantic AI analysis. Source originals remain authoritative.

## Delivery and tests

`scripts/package.cjs` builds a fresh Windows x64 directory with Electron, `src`, runtime `ui`, minimal app manifest and factual documents. Tests, samples, source catalog, node_modules, design inputs and helper scripts are excluded. `set-icon.ps1` / `version-resource.cjs` stamp the application's own icon and Windows version metadata into the copied executable. Runtime licenses remain included. No installer/signing/update service.

Unit/regression tests are in `tests/*.test.cjs`. `electron-smoke.cjs`, `renderer-smoke.js`, `release-smoke.cjs` exercise actual isolated IPC/UI/native operations with dialog responses mocked. `recovery-smoke.cjs` verifies corrupt-cache recovery, empty and missing sources. Production `--smoke` is a test hook requiring an external harness when packaged; ordinary launch never loads tests. `validate-local.cjs` performs read-only real-session validation and before/after sample SHA-256 comparison.

## Project history (1.1)

`src/analysis.cjs` extends the existing VaultStore in the worker, without a second index pipeline. Scope is an exact project cwd, one session or the vault, with UTC dates/type/text filters. It extracts recorded relations (fork vs subagent vs unspecified parent), tools, mentioned paths, frequency words and rule-based candidate events. Daily chapters contain excerpts, not generated summaries. Scope evaluation reads at most 200k records, returns at most 6000 events with 4000-character previews and reports limits. Maps/lanes/calendar impose additional visible rendering caps.

`annotations.sqlite` is separate from the rebuildable index: manual types/notes keyed by source ID + line + full parsed content signature, and pinned/archived session flags. Schema version 3 stores content signatures and reparses older indexes. Changed text invalidates the annotation match. Main persists the default-off manual editing toggle in sources.json and enforces it at the annotate IPC boundary. Rebuilding index.sqlite preserves annotations.sqlite. Back up annotations.sqlite with user data if preserving notes is important.

`ui/history.js` integrates with existing navigation, render tickets and Back snapshots. It provides project dashboards, daily chapters, five timeline modes, typed entity maps, candidate lists and source inspectors. It uses existing IPC and applies late-result guards. Report export reuses main-process protected native saving. `ui/workspace.js` adds panel sizing and the command palette; `history.css` extends the existing theme. Neither module grants filesystem access to the renderer. Internal record references are parsed inside Search, not registered with Windows.

UI history options/panel widths persist in Local Storage; manual editing permission in sources.json; annotations and list flags in their own SQLite. Disabling manual editing retains saved annotations. Project grouping is by exact recorded cwd, not repository discovery. No Git commands or cloud/model requests are made.

## Readability and optional indicators

`ui/readability.css` adjusts typography and spacing without global browser zoom. `workspaceUI.settings()` adds a neutral/semantic color preference under Appearance; `colorIndicators` in Local Storage is restored before initial rendering, reflected by `data-indicators`. Semantic styles use existing contrast-adjusted theme variables, keeping labels and source provenance visible. Branch SVG coordinates and row spacing use the same 82px pitch. No parser, IPC, database or packaging changes are required.

## Dense timeline layout

`ui/timeline-layout.js` is a pure time-bucket layout shared by both timeline modes (and imported by Node tests). Width determines fixed non-overlapping columns; all dated events from the bounded analysis result are assigned once. Swimlanes partition these same buckets by type. `history.js` opens bucket members in a paginated inline list and uses the existing event inspector/source navigation. The former modulo-row absolute positioning and 250-marker-per-lane cutoff are removed. Grid cells keep a readable minimum width at the smallest zoom; horizontal overflow stays in the scrollable timeline.
