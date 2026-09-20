'use strict';
const $ = s => document.querySelector(s);
const api = (m, a) => window.vault.call(m, a);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { sessions: [], current: null, view: 'conversation', project: '', service: false, filter: '', mode: 'conversation', offset: 0, query: '', searchSession: '', chapters: [], timeline: [], config: null, loading: false, renderId: 0 };
const roles = { user: L("Вы"), assistant: L("Ассистент"), developer: L("Инструкции разработчика"), system: L("Системный контекст"), context: L("Внедрённый контекст"), unknown: L("Неизвестная роль") };
const num = n => n == null ? '—' : Number(n).toLocaleString(i18n.locale);
const dt = s => s ? new Date(s).toLocaleString(i18n.locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const time = s => s ? new Date(s).toLocaleTimeString(i18n.locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const date = s => s ? new Date(s).toLocaleDateString(i18n.locale, { day: 'numeric', month: 'long', year: 'numeric' }) : L("Время неизвестно");
const base = p => p.split(/[\\/]/).filter(Boolean).at(-1) || p;
const bytes = n => n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : (n / 1000).toFixed(1) + ' KB';
const isService = s => ['guardian_review', 'subagent'].includes(s.source);
let toastTimer;
const backStack = [];
const utilityViews = new Set(['search', 'export', 'settings', 'help']);
const viewLabels = { conversation: L("Диалог"), dashboard: L("Обзор"), chapters: L("Главы"), timeline: L("Таймлайн"), graph: L("Граф тем"), search: L("Поиск"), export: L("Экспорт"), settings: L("Настройки"), help: L("Справка"), decisions: historyUI.decisionsLabel() };
state.scanEnabled = false;
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 6500); }
function empty(title, text, icon = '⬡') { return `<div class="empty"><span class="empty-icon">${icon}</span><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`; }
function inline(text) {
    // Escape everything before adding a small, deliberately local-only Markdown subset.
    return esc(text).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
}
function markdown(text) {
    return String(text).split(/(```[\s\S]*?```)/g).map(part => {
        if (part.startsWith('```'))
            return `<pre><code>${esc(part.replace(/^```[^\n]*\n?/, '').replace(/```$/, ''))}</code></pre>`;
        return part.split(/\n\s*\n/).map(block => {
            if (/^#{1,4} /.test(block))
                return `<h3>${inline(block.replace(/^#{1,4} /, ''))}</h3>`;
            return `<p>${inline(block).replace(/\n/g, '<br>')}</p>`;
        }).join('');
    }).join('');
}
function visibleSessions() { return historyUI.filterSessions(state.sessions.filter(s => (state.service || !isService(s)) && (!state.project || s.project === state.project) && `${s.title} ${s.project} ${s.sessionId}`.toLowerCase().includes(state.filter.toLowerCase()))); }
function sidebar() {
    const normal = state.sessions.filter(s => state.service || !isService(s));
    const projects = new Map();
    for (const s of normal)
        projects.set(s.project, (projects.get(s.project) || 0) + 1);
    $('#sessionCount').textContent = normal.length;
    $('#projectCount').textContent = projects.size;
    $('#service').setAttribute('aria-pressed', String(state.service));
    $('#projects').innerHTML = [...projects].map(([p, n]) => `<button class="project-item ${p === state.project ? 'active' : ''}" data-project="${esc(p)}" title="${esc(p)}"><span>▱</span><span class="label">${esc(base(p))}</span><span class="badge">${n}</span></button>`).join('');
    const visible = visibleSessions();
    $('#sessions').innerHTML = visible.length ? visible.map(s => Lh `<button class="session-row ${s.id === state.current?.id ? 'active' : ''}" data-session="${s.id}" title="${esc(s.title)}"><span class="name">${esc(s.title)}</span><span class="session-meta"><span class="${isService(s) ? 'service-tag' : ''}">${isService(s) ? L("служебная \u00B7 ") : ''}${num(s.messages)} сообщ.</span><span>${esc(dt(s.started).split(',')[0])}</span></span></button>`).join('') : L("<div class=\"footer-note\" style=\"padding:15px\">Нет сессий по этому фильтру.</div>");
    $('#crumb').textContent = state.project ? base(state.project) : L("Все проекты");
}
async function inspector() {
    const s = state.current;
    if (!s) {
        $('#inspector').innerHTML = L("<div class=\"panel-label\">ИСТОЧНИК ДАННЫХ</div><p class=\"inspector-note\">Подключите локальную папку с JSONL-сессиями Codex. Передача данных в сеть отключена.</p>");
        return;
    }
    const usage = s.tokens;
    const input = usage?.input_tokens || 0;
    const output = usage?.output_tokens || 0;
    const sum = input + output;
    $('#inspector').innerHTML = Lh `<div class="panel-label">КОНТЕКСТ СЕССИИ</div><dl class="context-box"><dt>Источник</dt><dd>Codex · ${esc(s.source)}</dd><dt>Модель</dt><dd>${esc(s.model || L("Не указана"))}</dd><dt>Рабочая папка</dt><dd>${esc(s.project)}</dd><dt>Начало</dt><dd>${esc(dt(s.started))}</dd><dt>Версия Codex</dt><dd>${esc(s.version || '—')}</dd></dl><div class="panel-label">ОГЛАВЛЕНИЕ <span class="badge">${state.chapters.length}</span></div><div class="outline">${state.chapters.slice(0, 8).map(c => `<button data-jump="${c.line}"><span class="number">${String(c.number).padStart(2, '0')}</span><span class="outline-text">${esc(c.title)}</span></button>`).join('') || L("<span class=\"muted\">Нет пользовательских ходов</span>")}${state.chapters.length > 8 ? L("<button data-go=\"chapters\">Все главы \u2192</button>") : ''}</div><div class="panel-label">ТОКЕНЫ ИЗ ЖУРНАЛА</div><div class="token-total">${num(usage?.total_tokens ?? (usage ? sum : null))}</div>${usage ? Lh `<div class="token-bar"><span style="width:${sum ? input / sum * 100 : 0}%"></span><i style="flex:1"></i></div><div class="legend"><span>Вход ${num(input)}</span><span>Выход ${num(output)}</span></div>` : L("<div class=\"inspector-note\">Счётчик отсутствует в исходнике.</div>")}<p class="inspector-note">Последний доступный накопительный счётчик. Это не стоимость и не размер контекста.</p><details class="source-path"><summary>Путь исходного файла</summary><code>${esc(s.path)}</code><button class="button" data-copy-path>Копировать путь файла</button><button class="button" data-copy-folder>Копировать путь папки</button></details><button class="button" data-reveal ${s.missing ? 'disabled' : ''}>▱ Показать исходник</button><p class="inspector-note">${num(s.lines)} строк · ${bytes(s.size)}<br>${s.warnings ? Lh `<span class="warning-count">${s.warnings} повреждённых строк</span><br>` : ''}${s.truncated ? Lh `${s.truncated} записей сокращено в индексе<br>` : ''}${s.oversized ? Lh `${s.oversized} строк больше 8 МБ пропущено<br>` : ''}${s.omitted ? Lh `${s.omitted} записей за пределами лимита индекса<br>` : ''}${s.unknown ? Lh `${s.unknown} неизвестных событий<br>` : ''}${s.missing ? L("<span class=\"warning-count\">Исходный файл недоступен</span><br>") : ''}Оригинал не изменяется.</p>`;
}
let selectionTicket = 0;
function snapshot() { return { id: state.current?.id, view: state.view, offset: state.offset, mode: state.mode, scroll: $('#view').scrollTop, query: state.query, searchSession: state.searchSession, project: state.project, filter: state.filter, service: state.service, focus: document.activeElement?.id, historyOptions:historyUI.options() }; }
function persist() { if (!state.config || !state.current)
    return; const value = utilityViews.has(state.view) ? backStack[0] || snapshot() : snapshot(); localStorage.setItem('workspace', JSON.stringify(value)); }
async function selectSession(id, { keep = false } = {}) {
    const s = state.sessions.find(x => x.id === id);
    if (!s)
        return;
    const ticket = ++selectionTicket;
    ++state.renderId;
    state.current = s;
    state.chapters = [];
    if (!keep) {
        state.offset = 0;
        state.mode = 'conversation';
    }
    $('#sessionTitle').textContent = s.title;
    $('#sessionEyebrow').textContent = `CODEX / ${base(s.project).toUpperCase()}${isService(s) ? L(" / СЛУЖЕБНАЯ СЕССИЯ") : ''}`;
    sidebar();
    inspector();
    $('#view').setAttribute('aria-busy', 'true');
    $('#view').textContent = L('Загрузка…');
    let chapters;
    try { chapters = await api('chapters', id); }
    catch (e) { if(ticket === selectionTicket) { $('#view').innerHTML = empty(L('Не удалось открыть представление'), e.message, '!'); $('#view').setAttribute('aria-busy','false'); } return; }
    if (ticket !== selectionTicket)
        return;
    state.chapters = chapters;
    localStorage.setItem('lastSession', id);
    inspector();
    await render();
}
function setActive() {
    document.querySelectorAll('[data-view]').forEach(b => { b.setAttribute('aria-current', b.dataset.view === state.view ? 'page' : 'false'); b.classList.toggle('active', b.dataset.view === state.view); });
    $('#returnBar').hidden = !utilityViews.has(state.view) && !backStack.length;
    $('#utilityTitle').textContent = viewLabels[state.view] || '';
    $('#returnView').textContent = L("\u2190 Назад: ") + (viewLabels[backStack.at(-1)?.view || 'conversation']);
    $('#exportOpen').disabled = !state.current;
    $('#searchOpen').setAttribute('aria-pressed', String(state.view === 'search'));
}
async function go(view) {
    if (!Object.hasOwn(viewLabels, view))
        return;
    if (state.view === view)
        return;
    if (utilityViews.has(view))
        backStack.push(snapshot());
    else
        backStack.length = 0;
    state.view = view;
    state.offset = 0;
    await render();
    persist();
}
async function restoreSnapshot(prior) {
    const { id, scroll = 0, focus, historyOptions, ...values } = prior;
    historyUI.restore(historyOptions);
    Object.assign(state, values);
    if (id && state.sessions.some(s => s.id === id))
        await selectSession(id, { keep: true });
    else
        await render();
    $('#filter').value = state.filter;
    sidebar();
    $('#view').scrollTo({ top: scroll, behavior: 'instant' });
    if (focus)
        document.getElementById(focus)?.focus({ preventScroll: true });
    persist();
}
async function closeUtility() {
    if (!utilityViews.has(state.view) && !backStack.length)
        return;
    await restoreSnapshot(backStack.pop() || { view: 'conversation', offset: 0, mode: 'conversation', scroll: 0 });
}
function applyPanels() {
    for (const side of ['Left', 'Right']) {
        const hidden = localStorage.getItem('hide' + side) === 'true';
        document.body.classList.toggle(side.toLowerCase() + '-hidden', hidden);
        const b = $('#toggle' + side);
        b.setAttribute('aria-expanded', String(!hidden));
        b.title = (hidden ? L("Показать") : L("Скрыть")) + (side === 'Left' ? L(" левую панель \u00B7 Ctrl+B") : L(" правую панель \u00B7 Ctrl+Shift+B"));
    }
}
function togglePanel(side) { localStorage.setItem('hide' + side, String(localStorage.getItem('hide' + side) !== 'true')); applyPanels(); }
function showWelcome() {
    $('#defaultPath').textContent = state.config.defaultRoot;
    $('#skipWelcome').checked = state.config.skipWelcome;
    $('#continueSources').hidden = !state.config.roots.length;
    $('#welcomeError').textContent = '';
    if (!$('#welcome').open)
        $('#welcome').showModal();
}
async function dismissWelcome() {
    await api('welcomePrefs', { skipWelcome: $('#skipWelcome').checked });
    state.config = await api('init');
    $('#welcome').close();
    $('#status').textContent = state.scanEnabled ? L("Источники подключены") : L("Выберите источники в настройках или добавьте JSONL");
}
async function setupSources(kind) {
    if (state.refreshPromise)
        await state.refreshPromise;
    const controls = [...$('#welcome').querySelectorAll('button,input')];
    controls.forEach(b => b.disabled = true);
    $('#welcomeError').textContent = '';
    try {
        const chosen = await api('setup', { kind, skipWelcome: $('#skipWelcome').checked });
        if (!chosen)
            return false;
        state.config = await api('init');
        state.scanEnabled = true;
        state.current = null;
        state.sessions = [];
        state.chapters = [];
        state.project = '';
        state.filter = '';
        $('#filter').value = '';
        localStorage.removeItem('workspace');
        $('#sessionTitle').textContent = 'Session Vault';
        $('#sessionEyebrow').textContent = 'CODEX';
        backStack.length = 0;
        state.view = 'conversation';
        $('#welcome').close();
        await refresh(true);
        await inspector();
        return true;
    }
    catch (e) {
        $('#welcomeError').textContent = e.message;
        return false;
    }
    finally {
        controls.forEach(b => b.disabled = false);
    }
}
function pager(total, offset, limit = 60) { return Lh `<div class="pager"><button data-page="${Math.max(0, offset - limit)}" ${offset === 0 ? 'disabled' : ''}>← Назад</button><span>${total ? offset + 1 : 0}–${Math.min(offset + limit, total)} / ${num(total)}</span><button data-page="${offset + limit}" ${offset + limit >= total ? 'disabled' : ''}>Далее →</button></div>`; }
function message(r) {
    const truncated = r.text.length > 14000;
    const content = truncated ? r.text.slice(0, 14000) : r.text;
    if (r.kind === 'message')
        return `<article class="message ${esc(r.role)}" id="line-${r.line}"><div class="message-head"><span class="avatar">${r.role === 'user' ? 'U' : r.role === 'assistant' ? '✳' : 'C'}</span><b>${esc(roles[r.role] || r.role)}</b><span class="phase">${esc(r.phase)}</span><time>${time(r.timestamp)}</time><span class="line-link">L${r.line}</span>${historyUI.recordActions(r)}</div><div class="message-body">${markdown(content)}${truncated ? Lh `<details><summary>Показать оставшиеся ${num(r.text.length - 14000)} символов</summary>${markdown(r.text.slice(14000))}</details>` : ''}${r.truncated ? L("<div class=\"notice\">Текст сокращён в индексе до 200 000 символов. Полная запись доступна в исходном JSONL.</div>") : ''}</div></article>`;
    if (['tool', 'output', 'reasoning'].includes(r.kind))
        return `<details class="tool" id="line-${r.line}"><summary>${r.kind === 'tool' ? '⌘' : r.kind === 'output' ? '↳' : '◇'} ${esc(r.kind === 'output' ? L(r.name) : r.name || L("Доступное резюме рассуждения"))} <span class="muted"> · ${time(r.timestamp)} · L${r.line}</span></summary>${historyUI.recordActions(r)}<pre>${esc(r.text)}</pre>${r.truncated ? L("<p class=\"notice\">Запись сокращена. См. исходник.</p>") : ''}</details>`;
    return `<div class="event-row" id="line-${r.line}">${esc(L(r.name))} · ${time(r.timestamp)} · L${r.line}${r.text ? Lh `<details><summary>Контекст</summary><pre>${esc(r.text)}</pre></details>` : ''}</div>`;
}
async function renderConversation(ticket, anchor) {
    const result = await api('records', { id: state.current.id, offset: state.offset, mode: state.mode, anchor });
    if (ticket !== state.renderId)
        return;
    state.offset = result.offset;
    $('#view').innerHTML = Lh `<div class="toolbar"><div class="segmented" role="group" aria-label="Фильтр записей">${[['conversation', L("Простой диалог")], ['all', L("Все записи")], ['tools', L("Инструменты")]].map(([key, label]) => `<button data-mode="${key}" aria-pressed="${state.mode === key}">${icon(key)}<span>${label}</span></button>`).join('')}</div><span class="muted">${num(result.total)} записей · исходный порядок</span></div><div class="conversation"><div class="day-marker">${esc(date(state.current.started))}</div>${result.rows.map(message).join('') || empty(L("В этом представлении нет сообщений"), L("Выберите \u00ABВсе записи\u00BB, чтобы увидеть технические события."))}${pager(result.total, state.offset)}</div>`;
    if (anchor != null)
        document.getElementById(`line-${anchor}`)?.scrollIntoView({ block: 'center' });
}
async function renderDashboard(ticket) {
    const s = state.current;
    const timeline = await api('timeline', s.id);
    if (ticket !== state.renderId)
        return;
    const tools = new Map(), days = new Map();
    for (const r of timeline) {
        if (r.kind === 'tool')
            tools.set(r.name, (tools.get(r.name) || 0) + 1);
        if (r.timestamp)
            days.set(r.timestamp.slice(0, 10), (days.get(r.timestamp.slice(0, 10)) || 0) + 1);
    }
    const top = [...tools].sort((a, b) => b[1] - a[1]).slice(0, 7);
    const max = Math.max(1, ...top.map(x => x[1]));
    $('#view').innerHTML = Lh `<div class="content"><div class="eyebrow">SESSION INTELLIGENCE</div><h2>Вся сессия. Один взгляд.</h2><p class="intro">Факты из локального журнала — от первого сообщения до последнего события.</p><div class="metrics">${[[s.messages, L("Сообщения"), L("пользователь + ассистент")], [s.tools, L("Вызовы инструментов"), L("без повторов событий")], [state.chapters.length, L("Главы"), L("по пользовательским ходам")], [days.size, L("Активные дни"), L("по времени UTC")]].map(([v, l, t]) => `<div class="metric"><div class="label">${l}</div><div class="value">${num(v)}</div><div class="tiny">${t}</div></div>`).join('')}</div><div class="split"><div class="panel"><div class="panel-header"><h3>Инструменты</h3><span>ВЫЗОВЫ</span></div>${top.map(([n, c]) => `<div class="bar-row"><span class="bar-label" title="${esc(n)}">${esc(n)}</span><div class="bar-track"><div class="bar-fill" style="width:${c / max * 100}%"></div></div><span class="bar-count">${c}</span></div>`).join('') || L("<p class=\"muted\">Вызовы отсутствуют</p>")}</div><div class="panel"><div class="panel-header"><h3>Активность</h3><span>UTC</span></div><div class="heatmap">${[...days].sort().map(([d, n]) => Lh `<div class="heat-day" title="${d}: ${n} событий" style="opacity:${.3 + .7 * n / Math.max(...days.values())}"></div>`).join('')}</div><p class="footer-note">Каждая ячейка — день с событиями.<br>${esc(dt(s.started))} → ${esc(dt(s.ended))}</p><button class="button" data-go="timeline">Открыть таймлайн →</button></div></div><div class="panel"><div class="panel-header"><h3>Последние главы</h3><span>ПО ХОДАМ</span></div>${state.chapters.slice(-4).map(c => `<button class="outline" style="display:block;text-align:left;margin:4px 0;width:100%" data-jump="${c.line}"><span class="badge">${String(c.number).padStart(2, '0')} · ${time(c.timestamp)}</span>　${esc(c.title)}</button>`).join('') || L("<p class=\"muted\">Нет пользовательских ходов</p>")}</div>${s.parent ? Lh `<div class="footer-note">Связь с родителем из метаданных: <code>${esc(s.parent)}</code></div>` : ''}${s.warnings ? Lh `<div class="notice">Пропущено повреждённых JSONL-строк: ${s.warnings}. Исходный файл сохранён без изменений.</div>` : ''}</div>`;
}
async function renderGraph(ticket) {
    const nodes = await api('graph', state.current.id);
    if (ticket !== state.renderId)
        return;
    const coords = nodes.map((n, i) => ({ ...n, x: 430 + Math.cos(i / nodes.length * Math.PI * 2 - Math.PI / 2) * (i % 2 ? 290 : 220), y: 240 + Math.sin(i / nodes.length * Math.PI * 2 - Math.PI / 2) * (i % 2 ? 175 : 135) }));
    $('#view').innerHTML = Lh `<div class="content"><div class="eyebrow">TOPIC EXPLORER</div><h2>Связи в вашей истории</h2><p class="intro">Эвристический граф ключевых слов из пользовательских сообщений. Размер узла отражает число сообщений с этим словом. Нажмите узел, чтобы найти его в сессии.</p>${nodes.length ? Lh `<div class="graph-wrap"><svg viewBox="0 0 860 480" role="group" aria-label="Граф ключевых слов"><g>${coords.map(n => `<line class="graph-line" x1="430" y1="240" x2="${n.x}" y2="${n.y}"/>`).join('')}</g><g class="graph-center"><circle cx="430" cy="240" r="42"/><text x="430" y="237" text-anchor="middle">СЕССИЯ</text><text x="430" y="255" text-anchor="middle">${state.chapters.length} ходов</text></g>${coords.map(n => Lh `<g class="graph-node" role="button" tabindex="0" aria-label="${esc(n.label)}: ${n.count} сообщений" data-topic="${esc(n.label)}"><circle cx="${n.x}" cy="${n.y}" r="${Math.min(25, 10 + Math.sqrt(n.count) * 2)}"/><text x="${n.x}" y="${n.y + 39}" text-anchor="middle">${esc(n.label)}</text></g>`).join('')}</svg></div><div class="taglist">${nodes.map(n => `<button class="tag" data-topic="${esc(n.label)}">${esc(n.label)} <span class="muted">${n.count}</span></button>`).join('')}</div>` : empty(L("Недостаточно текста"), L("Темы появятся, когда в сессии будут пользовательские сообщения."))}<p class="footer-note">Это частотный анализ слов, а не семантическая модель или автоматически подтверждённые решения. Обработка полностью локальная.</p></div>`;
}
async function renderSearch(ticket) {
    $('#view').innerHTML = Lh `<div class="content"><div class="eyebrow">FULL-TEXT SEARCH</div><h2>Найти нужный момент</h2><p class="intro">Поиск по тексту сообщений, контексту и инструментам во всех индексированных сессиях. Поддерживается поиск по началу слова.</p><form id="searchForm" class="search-form"><input id="searchQuery" maxlength="1000" value="${esc(state.query)}" placeholder="Тема, команда, фрагмент пути…" aria-label="Поисковый запрос"><button class="button primary">Найти</button></form><div id="results">${state.query ? L("<p class=\"muted\">Поиск\u2026</p>") : empty(L("История под рукой"), L("Введите слова из разговора. Enter \u2014 искать. Ctrl+K \u2014 вернуться к поиску."), '⌕')}</div></div>`;
    $('#searchForm').insertAdjacentHTML('afterend',historyUI.referenceForm());
    if (!state.query)
        return;
    const results = await api('search', { query: state.query, includeService: state.service, sessionId: state.searchSession });
    if (ticket !== state.renderId)
        return;
    const highlight = text => { let out = esc(text); for (const word of state.query.split(/\s+/).filter(Boolean)) {
        const safe = esc(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out = out.replace(new RegExp(safe, 'gi'), '<mark>$&</mark>');
    } return out; };
    $('#results').innerHTML = `<p class="muted">${results.length === 100 ? L("Первые 100 результатов") : num(results.length) + L(" результатов")}${state.service ? L(" \u00B7 включая служебные сессии") : ''}${state.searchSession ? L(" \u00B7 в выбранной сессии <button class=\"tag\" data-global-search>Искать во всей истории</button>") : ''}</p>` + results.map(r => Lh `<button class="result" data-result="${r.session}" data-line="${r.line}"><h3>${esc(r.title)}</h3><p>${highlight(r.text.slice(0, 1100))}</p><small>${esc(roles[r.role] || r.kind)} · ${dt(r.timestamp)} · строка ${r.line}</small></button>`).join('') + (results.length ? '' : empty(L("Совпадений нет"), L("Попробуйте более короткое слово или включите служебные сессии.")));
}
function appearancePanel() {
    const pref = appearance.get();
    return Lh `<div class="panel appearance-panel"><h3>Оформление</h3>${workspaceUI.settings()}<div class="segmented" role="group" aria-label="Режим оформления">${['system', 'light', 'dark'].map(mode => `<button data-appearance="${mode}" aria-pressed="${pref.mode === mode}">${icon(mode)}${mode[0].toUpperCase() + mode.slice(1)}</button>`).join('')}</div><p class="footer-note">System следует оформлению Windows. Для светлого и тёмного режима можно выбрать разные темы.</p><div class="palette-columns">${['light', 'dark'].map(mode => { const palette = appearance.presets.find(p => p.id === pref[mode])[mode]; return Lh `<label class="palette-card"><span>${mode === 'light' ? L("Светлая тема") : L("Тёмная тема")}</span><select data-palette="${mode}" aria-label="${mode === 'light' ? L("Светлая") : L("Тёмная")} тема">${appearance.presets.filter(p => p[mode]).sort((a, b) => a.label.localeCompare(b.label)).map(p => `<option value="${p.id}" ${pref[mode] === p.id ? 'selected' : ''}>${p.label}</option>`).join('')}</select><span class="theme-preview" data-preview="${mode}" style="background:${palette.bg};color:${palette.ink};border-color:${palette.accent}"><b style="color:${palette.accent}">Aa</b><span>Session Vault<br><small>Диалоги, главы и история</small></span></span></label>`; }).join('')}</div><p class="footer-note">28 семейств тем Codex Desktop. Палитры адаптированы к интерфейсу Session Vault.</p></div>`;
}
function syncAppearanceControls() {
    const p = appearance.get();
    document.querySelectorAll('[data-appearance]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.appearance === p.mode)));
    for (const mode of ['light', 'dark']) {
        const preview = document.querySelector('[data-preview="' + mode + '"]');
        if (!preview)
            continue;
        const colors = appearance.presets.find(x => x.id === p[mode])[mode];
        preview.style.background = colors.bg;
        preview.style.color = colors.ink;
        preview.style.borderColor = colors.accent;
        preview.querySelector('b').style.color = colors.accent;
    }
}
function languagePicker() { return Lh `<label class="language-picker">Язык <select data-language aria-label="Language / Язык / Мова">${[['en', 'EN · English'], ['ru', L("RU \u00B7 Русский")], ['uk', L("UA \u00B7 Українська")]].map(([id, label]) => `<option value="${id}" ${id === i18n.language ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`; }
async function render(anchor = null) {
    const ticket = ++state.renderId;
    historyUI.invalidate();
    if(state.current){$('#sessionTitle').textContent=state.current.title;$('#sessionEyebrow').textContent='CODEX / '+base(state.current.project);}
    $('#exportOpen').textContent=L('Экспорт');$('#exportOpen').removeAttribute('title');
    setActive();
    $('#view').scrollTop = 0;
    $('#view').setAttribute('aria-busy', 'true');
    try {
        if (state.view === 'help') {
            $('#view').innerHTML = `<div class="content help-content"><h2>${viewLabels.help}</h2>${helpContent[i18n.language].map(([q, a], i) => `<details ${i === 0 ? 'open' : ''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>`;
            return;
        }
        if (state.view === 'settings') {
            $('#view').innerHTML = Lh `<div class="content"><div class="eyebrow">LOCAL-FIRST BY DESIGN</div><h2>Настройки</h2>${languagePicker()}${historyUI.settings()}${appearancePanel()}<p class="intro">Session Vault читает локальные файлы и строит отдельный индекс. Сообщения не отправляются в облако. Никаких API-ключей или аккаунтов.</p><div class="panel"><h3>Начало работы</h3><p><button class="button" id="showWelcome">Выбрать источники заново…</button></p><label class="welcome-check"><input id="welcomeAtStartup" type="checkbox" ${state.config.skipWelcome ? '' : 'checked'}> Показывать приветственное окно при запуске</label></div><div class="panel"><h3>Подключённые источники</h3>${state.config.roots.map((r, index) => Lh `<div class="settings-row"><code>${esc(r)}</code><button data-copy-source="${index}">Копировать путь</button><button data-remove-source="${index}">Убрать из хранилища</button></div>`).join('') || L("<p>Источники не выбраны.</p>")}<p class="footer-note">Удаляется только запись в индексе. Исходные файлы остаются на месте.</p><p><button class="button" data-import="folder">＋ Добавить папку</button> <button class="button" data-import="files">＋ Добавить JSONL</button></p></div>${state.scanErrors?.length ? Lh `<div class="panel"><h3>Ошибки источников</h3>${state.scanErrors.map(e => `<p class="error">${esc(e.path)}<br>${esc(e.error)}</p>`).join('')}</div>` : ''}<div class="panel"><h3>Индекс SQLite</h3><p><button class="button" id="rebuildIndex">${({en:'Rebuild index',ru:'Пересоздать индекс',uk:'Створити індекс заново'})[i18n.language]}</button></p><p class="footer-note">${({en:'Reads originals again. The previous cache is retained as a backup; unavailable originals will not appear in the new index.',ru:'Повторное чтение оригиналов. Прежний кэш сохраняется в резервной копии; недоступные оригиналы не попадут в новый индекс.',uk:'Повторне читання оригіналів. Попередній кеш зберігається в резервній копії; недоступні оригінали не потраплять до нового індексу.'})[i18n.language]}</p><p class="footer-note">${esc(state.config.dataPath)}<br>Производный кэш, не оригинал истории. Для обновления файлов нажмите ↻. Автообновление каждые 60 секунд, пока приложение открыто.</p></div><div class="notice">Chat / Work не подключены: наличие читаемого источника не подтверждено. Поддерживаются JSONL-сессии Codex; неизвестные события сохраняются в исходнике.</div></div>`;
            return;
        }
        if (state.view === 'search') {
            await renderSearch(ticket);
            return;
        }
        if (!state.current) {
            $('#view').innerHTML = empty(L("Ваше локальное хранилище"), L("Сессии Codex появятся здесь после индексации. Добавьте JSONL или папку через настройки."));
            return;
        }
        if (await historyUI.render(ticket)) return;
        if (state.view === 'conversation')
            await renderConversation(ticket, anchor);
        else if (state.view === 'dashboard')
            await renderDashboard(ticket);
        else if (state.view === 'chapters')
            $('#view').innerHTML = Lh `<div class="content"><div class="eyebrow">STORY / CHAPTERS</div><h2>От вопроса к следующему шагу</h2><p class="intro">Автоматическое оглавление по пользовательским ходам. Названия взяты из первых строк сообщений и не являются AI-резюме.</p>${historyUI.tabs()}${state.chapters.slice(state.offset, state.offset + 60).map(c => Lh `<div class="chapter"><div class="chapter-number">${String(c.number).padStart(2, '0')}</div><button class="chapter-card" data-jump="${c.line}"><small>${date(c.timestamp)} · ${time(c.timestamp)}</small><h3 style="margin-top:10px">${esc(c.title)}</h3><p>${esc(c.text.slice(0, 220))}</p><small>Строка ${c.line}　·　Читать в диалоге ↗</small></button></div>`).join('') || empty(L("Пока нет глав"), L("В этой сессии отсутствуют пользовательские сообщения."))}${pager(state.chapters.length, state.offset)}</div>`;
        else if (state.view === 'timeline') {
            const rows = await api('timeline', state.current.id);
            if (ticket !== state.renderId)
                return;
            state.timeline = rows;
            $('#view').innerHTML = Lh `<div class="content"><div class="eyebrow">EVENT TIMELINE</div><h2>Как развивалась сессия</h2><p class="intro">Пользовательские ходы, вызовы инструментов и границы выполнения. Порядок соответствует строкам исходного файла.</p>${rows.slice(state.offset, state.offset + 60).map(r => `<div class="timeline-row ${r.kind}"><span class="timeline-time">${time(r.timestamp)}</span><i class="timeline-dot"></i><button class="timeline-card" data-event="${r.line}"><b>${esc(r.kind === 'event' ? L(r.name) : r.name || L("Сообщение пользователя"))}</b><p>${esc(r.text.slice(0, 180)) || esc(date(r.timestamp))}</p></button></div>`).join('') || empty(L("Нет событий"), L("Подходящих событий в исходнике не обнаружено."))}${pager(rows.length, state.offset)}</div>`;
        }
        else if (state.view === 'graph')
            await renderGraph(ticket);
        else if (state.view === 'export')
            $('#view').innerHTML = Lh `<div class="content"><div class="eyebrow">PRESERVE YOUR HISTORY</div><h2>Забрать историю с собой</h2><p class="intro">Экспорт выбранной сессии в отдельный файл. Исходники остаются на месте.</p><div class="export-options">${[['md', L("Читаемый диалог"), L("Сообщения пользователя и ассистента, время и ссылки на номера строк.")], ['json', L("Структурированные данные"), L("Метаданные и нормализованные записи, включая инструменты и контекст.")], ['jsonl', L("Оригинальный журнал"), L("Побайтовая копия исходного файла без потери неизвестных полей и вложений.")]].map(([f, t, d]) => Lh `<div class="export-option"><span class="format">.${f}</span><div><h3>${t}</h3><p>${d}</p></div><button class="button" data-export="${f}" ${f==='jsonl'&&state.current.missing?'disabled':''}>Сохранить ↗</button></div>`).join('')}</div><div class="notice">Экспорт может содержать личную информацию и текст команд. Markdown и JSON отражают индекс: очень длинные записи ограничены 200 000 символов и помечены. JSONL сохраняет полный оригинал.</div></div>`;
    }
    catch (e) {
        if (ticket === state.renderId)
            $('#view').innerHTML = empty(L("Не удалось открыть представление"), e.message, '!');
    }
    finally {
        if (ticket === state.renderId) {
            $('#view').setAttribute('aria-busy', 'false');
            persist();
        }
    }
}
async function jump(line, all = false) { if (state.view !== 'conversation')
    backStack.push(snapshot()); state.view = 'conversation'; state.mode = all ? 'all' : 'conversation'; state.offset = 0; await render(Number(line)); }
async function refresh(manual = false) {
    if (!state.scanEnabled) {
        if (manual)
            showWelcome();
        return;
    }
    if (state.refreshPromise)
        return state.refreshPromise;
    state.refreshPromise = (async () => {
        state.loading = true;
        $('#refresh').disabled = true;
        try {
            const result = await api('scan', { force: manual });
            state.scanErrors = result.errors;
            state.sessions = await api('list');
            await historyUI.loadFlags();
            const before = snapshot();
            $('#status').textContent = Lh `Индекс готов · ${state.sessions.length} сессий · ошибок: ${result.errors.length}`;
            if (state.current && !state.sessions.some(s => s.id === state.current.id)) {
                state.current = null;
                state.chapters = [];
                $('#sessionTitle').textContent = 'Session Vault';
            }
            if (!state.current) {
                let saved;
                try {
                    saved = JSON.parse(localStorage.getItem('workspace') || 'null');
                }
                catch { }
                const preferred = state.sessions.find(s => s.id === (saved?.id || localStorage.getItem('lastSession'))) || state.sessions.find(s => !isService(s)) || state.sessions[0];
                if (preferred) {
                    if (isService(preferred))
                        state.service = true;
                    if (saved?.id === preferred.id && Object.hasOwn(viewLabels, saved.view)) {
                        backStack.length = 0;
                        await restoreSnapshot(saved);
                    }
                    else
                        await selectSession(preferred.id);
                }
                else {
                    await inspector();
                    await render();
                }
            }
            else {
                state.current = state.sessions.find(s => s.id === state.current.id);
                await inspector();
                if (result.updated && before.id === state.current.id && before.view === state.view) {
                    await selectSession(state.current.id, { keep: true });
                    $('#view').scrollTop = before.scroll;
                }
            }
            sidebar();
            if (manual)
                toast(result.errors.length ? result.errors.map(e => e.path + ': ' + e.error).join('\n') : Lh `Индекс обновлён: ${result.updated} файлов`);
        }
        catch (e) {
            $('#status').textContent = L("Ошибка индексации");
            toast(e.message);
        }
        finally {
            state.loading = false;
            $('#refresh').disabled = false;
        }
    })();
    try {
        await state.refreshPromise;
    }
    finally {
        state.refreshPromise = null;
    }
}
async function importSource(kind) { if (state.refreshPromise)
    await state.refreshPromise; const result = await api('import', kind); if (result) {
    state.scanEnabled = true;
    state.config = await api('init');
    await refresh();
    toast(L("Источники подключены"));
    if (state.view === 'settings')
        await render();
} }
document.addEventListener('click', async (e) => {
    const b = e.target.closest('button,[data-topic]');
    if (!b)
        return;
    try {
        if (b.dataset.setup)
            await setupSources(b.dataset.setup);
        else if (['welcomeClose', 'welcomeLater'].includes(b.id))
            await dismissWelcome();
        else if (b.id === 'showWelcome')
            showWelcome();
        else if (b.id === 'toggleLeft')
            togglePanel('Left');
        else if (b.id === 'toggleRight')
            togglePanel('Right');
        else if (['closeView', 'returnView'].includes(b.id))
            await closeUtility();
        else if (b.id === 'settingsOpen')
            await go('settings');
        else if (b.dataset.appearance) {
            appearance.set('mode', b.dataset.appearance);
            await api('nativeTheme', b.dataset.appearance);
            syncAppearanceControls();
        }
        else if (b.dataset.mode) {
            state.mode = b.dataset.mode;
            state.offset = 0;
            await render();
            document.querySelector('[data-mode="' + state.mode + '"]')?.focus({ preventScroll: true });
        }
        else if (b.dataset.view)
            await go(b.dataset.view);
        else if (b.dataset.rail)
            await go(b.dataset.rail);
        else if (b.dataset.go)
            await go(b.dataset.go);
        else if (b.dataset.session) {
            backStack.length = 0;
            state.view = 'conversation';
            await selectSession(b.dataset.session);
        }
        else if (b.dataset.project != null) {
            state.project = state.project === b.dataset.project ? '' : b.dataset.project;
            historyUI.restore({...historyUI.options(),scope:state.project?'project':'vault',sessionPage:0,selected:''});
            sidebar();
            const first = visibleSessions()[0];
            if (first && state.current?.project !== state.project)
                await selectSession(first.id);
            else await render();
        }
        else if (b.dataset.jump)
            await jump(b.dataset.jump);
        else if (b.dataset.event)
            await jump(b.dataset.event, true);
        else if (b.dataset.result) {
            backStack.push(snapshot());
            state.view = 'conversation';
            await selectSession(b.dataset.result);
            state.mode = 'all';
            await render(Number(b.dataset.line));
        }
        else if (b.dataset.page != null) {
            state.offset = Number(b.dataset.page);
            await render();
        }
        else if (b.dataset.topic) {
            state.query = b.dataset.topic;
            state.searchSession = state.current.id;
            await go('search');
        }
        else if (b.hasAttribute('data-global-search')) {
            state.searchSession = '';
            await render();
        }
        else if (b.dataset.export) {
            b.disabled = true;
            try {
                toast(L("Подготовка экспорта\u2026"));
                const dest = await api('export', { id: state.current.id, format: b.dataset.export });
                toast(dest ? Lh `Сохранено: ${dest}` : L("Экспорт отменён"));
            }
            finally {
                b.disabled = false;
            }
        }
        else if (b.hasAttribute('data-copy-path') || b.hasAttribute('data-copy-folder')) {
            await api('copyPath', { id: state.current.id, folder: b.hasAttribute('data-copy-folder') });
            toast(L("Путь скопирован"));
        }
        else if (b.dataset.copySource != null) {
            await api('copyPath', { index: Number(b.dataset.copySource) });
            toast(L("Путь скопирован"));
        }
        else if (b.dataset.removeSource != null) {
            await api('removeSource', Number(b.dataset.removeSource));
            state.config = await api('init');
            state.scanEnabled = true;
            await refresh();
            await render();
        }
        else if(b.id==='rebuildIndex'){b.disabled=true;try{await api('rebuild');state.scanEnabled=true;state.current=null;await refresh(true);await render();}finally{b.disabled=false;}}
        else if (b.id === 'helpOpen')
            await go('help');
        else if (b.hasAttribute('data-reveal'))
            await api('reveal', state.current.id);
        else if (b.dataset.import)
            await importSource(b.dataset.import);
        else if (b.id === 'searchOpen') {
            state.searchSession = '';
            await go('search');
            $('#searchQuery')?.focus();
        }
        else if (b.id === 'exportOpen')
            await go('export');
        else if (b.id === 'allProjects') {
            state.project = '';
            historyUI.restore({...historyUI.options(),scope:'vault',sessionPage:0,selected:''});
            sidebar();
            await render();
        }
        else if (b.id === 'service') {
            state.service = !state.service;
            sidebar();
            await render();
        }
        else if (b.id === 'refresh')
            await refresh(true);
        else if (b.id === 'import')
            await importSource('files');
    }
    catch (err) {
        toast(err.message);
    }
});
$('#view').addEventListener('scroll', () => { clearTimeout(state.saveTimer); state.saveTimer = setTimeout(persist, 150); });
$('#filter').addEventListener('input', e => { state.filter = e.target.value; sidebar(); persist(); });
document.addEventListener('change', async (e) => { if (e.target.hasAttribute('data-language')) {
    persist();
    sessionStorage.setItem('languageReturn', JSON.stringify({ snapshot: snapshot(), back: backStack, welcome: $('#welcome').open }));
    localStorage.setItem('language', e.target.value);
    await api('language', e.target.value);
    location.reload();
    return;
} if (e.target.id === 'welcomeAtStartup') {
    await api('welcomePrefs', { skipWelcome: !e.target.checked });
    state.config = await api('init');
} if (e.target.dataset.palette) {
    appearance.set(e.target.dataset.palette, e.target.value);
    syncAppearanceControls();
} });
document.addEventListener('submit', e => { if (e.target.id === 'searchForm') {
    e.preventDefault();
    state.query = $('#searchQuery').value.trim();
    render();
} });
$('#welcome').addEventListener('cancel', e => { e.preventDefault(); if (!$('#welcomeClose').disabled)
    dismissWelcome(); });
document.addEventListener('keydown', async (e) => {
    if ($('#welcome').open)
        return;
    if (e.key === 'F1') {
        e.preventDefault();
        await go('help');
        return;
    }
    if (e.key === 'Escape' && (utilityViews.has(state.view) || backStack.length)) {
        e.preventDefault();
        await closeUtility();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        togglePanel(e.shiftKey ? 'Right' : 'Left');
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        state.searchSession = '';
        await go('search');
        $('#searchQuery')?.focus();
    }
    if (e.altKey && /^[1-6]$/.test(e.key)) {
        e.preventDefault();
        await go(['conversation', 'dashboard', 'chapters', 'timeline', 'graph', 'decisions'][Number(e.key) - 1]);
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-topic]')) {
        e.preventDefault();
        e.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
});
const unsubscribeProgress = window.vault.onProgress(p => { $('#status').textContent = Lh `Индексация ${p.current}/${p.total} · ${p.file}${p.line ? ' · L' + p.line : ''}`; });
i18n.localizePage();
$('#welcomeLanguage').innerHTML = languagePicker();
window.__ready = (async () => {
    await api('nativeTheme', appearance.get().mode);
    state.config = await api('init');
    await historyUI.loadFlags().catch(()=>{});
    document.querySelectorAll('[data-view]').forEach(b => { b.innerHTML = icon(b.dataset.view) + '<span>' + viewLabels[b.dataset.view] + '</span><kbd>' + (['conversation', 'dashboard', 'chapters', 'timeline', 'graph', 'decisions'].indexOf(b.dataset.view) + 1) + '</kbd>'; });
    $('#toggleLeft').innerHTML = icon('left');
    $('#toggleRight').innerHTML = icon('right');
    applyPanels();
    workspaceUI.init();
    $('#filter').insertAdjacentHTML('afterend',historyUI.archiveFilter());
    sidebar();
    await inspector();
    await render();
    if (state.config.skipWelcome && state.config.roots.length) {
        state.scanEnabled = true;
        await refresh();
    }
    else {
        $('#status').textContent = L("Ожидание выбора источников");
        if (!state.config.skipWelcome)
            showWelcome();
    }
    const languageReturn = sessionStorage.getItem('languageReturn');
    if (languageReturn) {
        sessionStorage.removeItem('languageReturn');
        try {
            const r = JSON.parse(languageReturn);
            backStack.push(...r.back);
            if (r.welcome)
                showWelcome();
            else {
                $('#welcome').close();
                await restoreSnapshot(r.snapshot);
            }
        }
        catch { }
    }
    const timer = setInterval(() => { if (!$('#welcome').open)
        refresh(); }, 60000);
    window.addEventListener('beforeunload', () => { persist(); clearInterval(timer); unsubscribeProgress(); });
})();
