# Validation — Session Vault 1.1

> Исторический аудит версии 1.0: приведённые тесты подтверждают реализованный viewer, а не полноту исходной концепции. Git-inspired history, project-level views и другие пробелы перечислены в DESIGN_AUDIT.md. Прежняя оценка завершённости относится только к узкому проверенному объёму и не является подтверждением соответствия всем макетам.

Дата: 19 сентября 2026. Проверка выполнена на текущей Windows x64-машине, масштаб дисплея 125%, Electron 44.3.0. Отдельная сертификация других версий Windows не выполнялась.

## Definition of Done

1. Существующая local-first архитектура сохранена; исходные JSONL не изменяются.
2. Первый запуск, отмена выбора, папки/файлы, добавление/замена/удаление источников и повторный запуск имеют понятный результат.
3. Основные представления, поиск с переходом/возвратом, экспорт, настройки, справка и панели доступны без тупиков.
4. Реализованы EN по умолчанию, RU, UA; темы и пользовательские настройки сохраняются.
5. Повреждённые/большие JSONL, исчезающие источники и ошибка worker/SQLite не превращаются в бесконечное ожидание. Есть восстановление индекса.
6. Существующие тесты и регрессии проходят; проверен реальный Electron, не только функции parser.
7. Есть проверенная Windows x64 portable-сборка, правильные имя/версия/icon, без тестовых сессий и путей разработчика.
8. README, ARCHITECTURE и PROJECT_STATUS описывают фактический выпуск; известные ограничения перечислены.

## Приоритизация аудита

**BLOCKER — исправлено:** неожиданные JSON-типы могли прервать разбор файла; ограничение длины после чтения не защищало от огромной сырой строки; потеря/смешение состояния при асинхронном выборе и возвратах; неоднозначность экспорта и защита исходников/путей; зависшие запросы при падении worker и отсутствие восстановления повреждённого индекса.

**SHOULD FIX — исправлено:** dedup повторных сообщений между ходами; накопительные legacy token counters; принудительное обновление файлов прежнего размера; FTS при исключении источников; частично недоступные деревья; последние позиция/страница и геометрия окна; видимый прогресс/ошибки, локализация, встроенная справка, копирование путей, пагинация глав и состояния элементов.

**OPTIONAL — сделано:** собственная иконка, metadata EXE, более удобные focus/disabled состояния и перенос длинных путей. Дополнительная косметика, расширенный Markdown, предпросмотр вложений, установщик/подпись не входят в DoD.

**FUTURE:** AI summaries, embeddings, semantic graph, облачная синхронизация, аккаунты, Chat/Work/другие форматы, редактор истории/ветвей. Не реализованы намеренно.

## Автоматические проверки

`npm test` / `node --test --test-isolation=none tests/*.test.cjs`: **16/16 passed**. Существующие 10 тестов плюс 6 регрессий. Покрыты canonical/legacy сообщения, повторы, injected context, hidden/binary content, truncation, cumulative tokens, SQLite/FTS, кириллица, сервисные сессии, пропавшие источники, 9 MiB строка, null/число/массив вместо JSON-объекта, same-size force refresh, удаление FTS, clamp страниц, потоковый экспорт, защита источников/app data/hard links.

Полный smoke в Electron с отдельным чистым профилем: приветствие до сканирования, отмена picker, папка, замена одним файлом, сохранение welcome/панелей/темы, стандартная папка Codex, все представления, tools, главы, поиск, Back/Esc, отсутствие дублирующей навигации, все 43 варианта тем (контраст текста >=4.5), переключение System.

Расширенный сценарий: 135 сообщений с кириллицей/украинским текстом, HTML как инертный текст, повреждённая JSON-строка, поиск → результат → назад → прежняя страница и scroll; refresh/reload; Markdown/JSON/raw JSONL, cancel и запрет записи исходника/папки; clipboard путей без изменения системного clipboard; исчезновение и возврат файла; три локали/справка; 980×640 и 1920×1080; пересоздание индекса с резервной копией. Дополнительно пройдены перезапись собственного экспорта, сообщение свыше 200k символов с элементом раскрытия и maximized. Native dialogs подменены контролируемыми ответами; остальной IPC/worker/SQLite/renderer реальный.

Отдельный запуск намеренно повреждённого SQLite: приложение оставляет доступными настройки; rebuild успешно восстанавливает индекс; пустая и несуществующая папки обработаны. Отдельный процесс после закрытия восстанавливает `daily`, conversation, страницу с offset 60, EN и геометрию окна. Допускается небольшое округление размеров в DIP при масштабе 125%.

Скриншоты проверены для приветствия, разговора/малого окна, настроек EN/RU/UA, светлой/тёмной темы и вспомогательных экранов. Ошибки renderer и завершения процесса собираются smoke harness; неожиданных ошибок в прошедшем прогоне нет. Ожидаемая ошибка повреждённого кэша проверяется отдельно.

## Проверка локальных данных

Парсер дополнительно проверялся на реальном локальном каталоге в режиме только чтения, включая большие журналы. Исходники не изменялись. Личные журналы, их имена, контрольные суммы и подробные отчёты не публикуются. Скриншоты в `docs/screenshots` созданы исключительно на вымышленных данных через `scripts/screenshots.cjs`.

## Как повторить

```powershell
npm test
$env:SESSION_VAULT_DATA = Join-Path $env:TEMP ('vault-qa-' + [guid]::NewGuid())
npm run smoke
# Проверить smoke.json: checks.errors должен быть пустым; smoke-error.txt отсутствует.
$env:SESSION_VAULT_RESUME = '1'
npm run smoke
# Проверить restart.json: passed=true.
Remove-Item Env:SESSION_VAULT_RESUME
```

Для packaged smoke задайте `SESSION_VAULT_SMOKE` абсолютным путём к `tests/electron-smoke.cjs`, новый `SESSION_VAULT_DATA` и запустите `Session Vault.exe --smoke`. Тесты намеренно не включены в поставку. Системный Save As/Проводник и субъективное удобство длительного чтения остаются полезными пунктами ручной проверки.

## Release status

Windows x64 portable 1.0.0 собрана и проверена запуском собственного EXE с чистым профилем: `checks.errors=[]`. Повторный процесс: `passed=true`, `languageSelector=true`. Пройден отдельный packaged recovery-тест повреждённого SQLite, пустой/недоступной папки и нескольких файлов с add/remove. Проверены ProductName/FileDescription=Session Vault, ProductVersion=1.0.0, FileVersion=1.0.0.0, OriginalFilename=Session Vault.exe и собственная иконка. В поставке нет тестовых сессий, test harness, source catalog, node_modules и локальных путей разработчика. Исходники packaged app сверены с рабочей версией. Definition of Done выполнен; известных BLOCKER в проверенном объёме нет.

## 1.1 — automatic project history

21/21 tests pass, including new project/date analysis, typed parent relations, manual reset/refresh, content-signature invalidation beyond the 4000-character preview, app-owned archive flags and tool call/result linking.

Actual Electron history-smoke.cjs passed in an isolated profile: branches/calendar/horizontal/lanes/events/chapters/entity graph/decisions; project aggregation; missing parent; calendar zero-activity days; default-off manual editing and persistence; annotation save; source jump and Back; pins; command palette; conversation inspector/compare selection; panel separators; protected Markdown report with manual note; rebuild retains annotations/flags; unchanged original bytes; EN/RU/UK reload; 980x640 without document horizontal overflow. Renderer/main errors=[]. Captured screenshots were inspected, including branching and graph. Existing electron-smoke.cjs also passed after integration (sources/search/export/themes/recovery).

Reproduction (run from source with separate profile; never point smoke at your daily profile):

```powershell
npm test
$env:SESSION_VAULT_DATA = Join-Path $env:TEMP 'session-vault-history-qa'
$env:SESSION_VAULT_SMOKE = Join-Path (Get-Location) 'tests/history-smoke.cjs'
npm run smoke
```

Additional release DoD: automatic default with explicit inference labels; source-backed parent links; scope/date filtering and usable empty/error states; manual edits opt-in and independent of JSONL/cache rebuild; no AI/network dependency; existing navigation and source protection retained; fresh portable executable passes runtime checks. Remaining manual checks: real personal-project classification quality, comfortable lane density and graph zoom, drag splitters with preferred DPI, native save/overwrite dialogs, two-record comparison, long-term daily use. A passing smoke does not assert exhaustive visual or accessibility certification.

### Packaged 1.1 verification

Both history-smoke and electron-smoke passed against `Session Vault.exe` from the fresh 1.1.0 output, with isolated profiles and errors=[]. The latter scanned 52 local sessions, checked 28 palette families / 43 variants and the existing release flows. A subsequent process launch passed restoration (conversation offset 60, session daily, EN, window width within Windows DPI tolerance) and actual language-selector reloads. EXE ProductName=Session Vault, ProductVersion=1.1.0, FileVersion=1.1.0.0. Runtime app contains src/ui/minimal manifest, without tests, samples or hard-coded developer paths. Runtime licenses retained. Portable/source ZIPs and SHA-256 manifest accompany the release.

The local automatic-history DoD is met. AI-semantic interpretations and optional decorative mockup features listed in PROJECT_STATUS are deliberately outside this release; no claim of perfect heuristic classification or pixel identity is made.

## Subsequent source-only readability update

21/21 unit tests pass. Extended history-smoke passes in actual Electron with errors=[]: larger conversation text (15px), semantic vs restrained indicators, distinct task/problem colors, light/dark screenshots, preference persistence after reload, eight history views, EN/RU/UK and 980px layout. Screenshots inspected. No EXE or ZIP rebuilt; previous release artifacts remain historical snapshots. Packaging belongs to the user for this update.

## Overview navigation fix — 20 September 2026

Removed the silent first-80 overview-session cutoff. Session lists paginate by 40, with counts, disabled boundary controls and page restoration on Back. Vault/project/service actions rerender analysis and synchronize scope. Service exclusion is explicit below the overview session list. Add JSONL moved into the vault header; sidebar footer removed.

21/21 unit tests pass. New actual Electron overview-smoke.cjs fixture with 86 sessions passes pagination beyond 80, last-page conversation opening and Back, service refresh, vault/project scope changes, relocated picker cancellation and 980px layout; renderer errors=[]. Screenshot inspected. Source-only change; no EXE/ZIP rebuild.

## Dense timeline fix — 20 September 2026

23/23 unit tests pass, including conservation of 6000 dense events across zoom widths, identical/out-of-order timestamps and empty/invalid timestamps. Actual Electron timeline-smoke.cjs uses 600 records (550 simultaneous): both modes at four zoom levels have no intersecting card rectangles; groups paginate, record inspection/source jump/Back work, visible cards pass elementFromPoint hit testing; errors=[]. Captured timeline screenshots inspected. No EXE/ZIP rebuilt.

## Public repository preparation

README includes two visually checked screenshots generated from fictional fixtures in an isolated profile. `.gitignore` excludes JSONL, databases, credentials/config files, dependencies and build outputs. The staged source/document set was checked for personal paths, captured-session filenames and common credential patterns; no matches remain. The 23-test suite passes. No executable or private session data is distributed with the repository.
