'use strict';

(() => {
  const app = document.querySelector('#app');
  const announcer = document.querySelector('#announcer');
  const toast = document.querySelector('#toast');
  const dialog = document.querySelector('#confirm-dialog');
  const cookieBanner = document.querySelector('#cookie-notice');
  const cookieNotice = window.CapyCookieNotice;
  const i18n = window.CapyI18n;
  const t = (key, params) => i18n.t(key, params);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Translate and interpolate first, then escape once at the HTML boundary.
  const h = (key, params) => esc(t(key, params));
  const state = { user: null, csrf: '', house: null, timeZone: 'Europe/Rome', view: 'dashboard', data: null, authMode: 'login', pagination: { activity: { page: 1, size: 10 }, log: { page: 1, size: 10 } }, loadId: 0, requests: 0, actions: 0, switching: false };
  const pageSizes = [10, 20, 50, 100];
  const week = [1, 2, 3, 4, 5, 6, 0];
  const routes = {
    dashboard: { icon: 'home', endpoint: '/api/dashboard' },
    pulizia: { icon: 'spark', endpoint: '/api/cleaning' },
    spazzatura: { icon: 'leaf', endpoint: '/api/waste' },
    fondo: { icon: 'wallet', endpoint: '/api/fund' },
    utenti: { icon: 'users', endpoint: '/api/admin/users', admin: true },
    casa: { icon: 'settings', endpoint: '/api/admin/settings', admin: true },
    raccolta: { icon: 'calendar', endpoint: '/api/admin/settings', admin: true }
  };
  // Hash identifiers stay stable so existing bookmarks keep working in either language.
  const routeText = (key, part = 'label') => t(`route.${key}.${part}`);
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    spark: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4zM20 2v4m-2-2h4"/>',
    leaf: '<path d="M20 3C8 2 2 8 5 15s16 5 15-12ZM4 21 15 10M9 16v-5m0 5h5"/>',
    wallet: '<path d="M20 8V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15v12H5a2 2 0 0 1-2-2V6m17 6h-6v4h6"/><path d="M16 14h.01"/>',
    users: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-14 5h3m4 0h3"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    logout: '<path d="M9 4H4v16h5m5-13 5 5-5 5m-6-5h11"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alert: '<path d="m12 3 10 18H2zM12 9v5m0 3v.1"/>'
  };
  const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.home}</svg>`;
  const brand = () => `${icon('home')}<span>CapyHome</span>`;
  const mascotIndex = () => {
    // Deterministic per house-timezone day: stable all day, different each day.
    let hash = 0;
    for (const ch of today()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return (hash % 7) + 1;
  };
  const mascot = (cls = '') => `<img src="/img/mascots/mascot-${mascotIndex()}.svg" class="mascot ${cls}" alt="" aria-hidden="true">`;
  const money = cents => new Intl.NumberFormat(i18n.locale, { style: 'currency', currency: 'EUR' }).format(Number(cents || 0) / 100);
  const today = () => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: state.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
  };
  const todayWeekday = () => new Date(`${today()}T12:00:00Z`).getUTCDay();
  const dayName = (day, short = false) => new Intl.DateTimeFormat(i18n.locale, { timeZone: 'UTC', weekday: short ? 'short' : 'long' }).format(new Date(Date.UTC(2024, 0, 7 + day)));
  const formatDate = (value, long = false) => {
    if (!value) return t('common.never');
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const date = new Date(dateOnly ? `${value}T12:00:00Z` : value);
    return Number.isNaN(date.getTime()) ? t('common.invalidDate') : date.toLocaleDateString(i18n.locale, { timeZone: dateOnly ? 'UTC' : state.timeZone, day: 'numeric', month: long ? 'long' : 'short', ...(long ? { year: 'numeric' } : {}) });
  };
  const initial = name => Array.from(name || 'C')[0].toLocaleUpperCase(i18n.locale);
  const dateField = () => `<label>${h('common.date')}<input name="date" type="date" value="${today()}" min="1900-01-01" max="${today()}" required></label>`;
  const notesField = () => `<label>${h('common.notes')} <span class="optional">${h('common.optional')}</span><textarea name="notes" rows="2" maxlength="2000" placeholder="${h('common.notesPlaceholder')}"></textarea></label>`;
  const formEnd = (key, disabled = false) => `<p class="form-error" role="alert" tabindex="-1" hidden></p><button class="button" type="submit" ${disabled ? 'disabled' : ''}>${icon('check')}${h(key)}</button>`;
  const empty = (title, text, symbol = 'leaf') => `<div class="empty">${icon(symbol)}<h3>${h(title)}</h3><p>${h(text)}</p></div>`;
  const dayChips = selected => `<div class="day-chips">${week.map(d => `<span class="day-chip ${selected.includes(d) ? 'selected' : ''}" aria-label="${h(selected.includes(d) ? 'waste.scheduled' : 'waste.notScheduled', { name: dayName(d) })}">${esc(dayName(d, true))}</span>`).join('')}</div>`;
  const languagePicker = () => `<label class="language-picker"><span class="sr-only">${h('common.language')}</span><select data-language aria-label="${h('common.language')}" ${state.switching ? 'disabled' : ''}><option value="it" lang="it" ${i18n.language === 'it' ? 'selected' : ''}>Italiano</option><option value="en" lang="en" ${i18n.language === 'en' ? 'selected' : ''}>English</option></select></label>`;
  let toastTimer;
  let cookieBound = false;
  function notify(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
  }
  function localizeDocument() {
    document.documentElement.lang = i18n.language;
    document.title = t('meta.title');
    document.querySelector('meta[name="description"]').content = t('meta.description');
    document.querySelector('.skip-link').textContent = t('common.skip');
    dialog.querySelector('.eyebrow').textContent = t('confirm.kicker');
    dialog.querySelector('#confirm-title').textContent = t('confirm.title');
    dialog.querySelector('[value="cancel"]').textContent = t('confirm.cancel');
    dialog.querySelector('[value="confirm"]').textContent = t('confirm.confirm');
    dialog.querySelector('#confirm-description').textContent = '';
    toast.hidden = true;
    announcer.textContent = '';
    if (cookieBanner && cookieNotice) {
      const closeButton = cookieBanner.querySelector('[data-cookie-close]');
      cookieBanner.querySelector('#cookie-notice-title').textContent = t('cookies.title');
      cookieBanner.querySelector('#cookie-notice-message').textContent = t('cookies.message');
      closeButton.textContent = t('cookies.close');
      closeButton.setAttribute('aria-label', t('cookies.closeLabel'));
      if (!cookieBound) {
        cookieBound = true;
        cookieNotice.init({ banner: cookieBanner, closeButton });
      } else {
        cookieNotice.show({ banner: cookieBanner });
      }
    }
  }
  async function api(path, options = {}) {
    const method = options.method || 'GET';
    const headers = { Accept: 'application/json', 'Accept-Language': i18n.language };
    if (method !== 'GET' || options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && state.csrf) headers['X-CSRF-Token'] = state.csrf;
    state.requests++;
    try {
      let response;
      try { response = await fetch(path, { method, credentials: 'same-origin', headers, ...(method !== 'GET' || options.body !== undefined ? { body: JSON.stringify(options.body ?? {}) } : {}) }); }
      catch { throw new Error(t('common.networkError')); }
      let data;
      try { data = await response.json(); } catch { data = null; }
      if (!response.ok) {
        if (response.status === 401 && state.user) {
          state.user = null; state.csrf = ''; state.house = null; state.loadId++;
          renderAuth(t('common.sessionExpired'));
        }
        const error = new Error(data?.error || t('common.requestError'));
        error.status = response.status;
        throw error;
      }
      if (!data) throw new Error(t('common.responseError'));
      return data;
    } finally { state.requests--; }
  }
  function renderAuth(message = '', success = false) {
    const register = state.authMode === 'register';
    document.title = `${t(register ? 'auth.register' : 'auth.login')} · CapyHome`;
    app.innerHTML = `<div class="auth-layout"><aside class="auth-story"><a href="#dashboard" class="brand">${brand()}</a><div class="story-content"><span class="eyebrow">${h('auth.kicker')}</span><h1>${h('auth.storyTitle')}<br>${h('auth.storyTogether')}</h1><p>${h('auth.storyOne')}<br>${h('auth.storyTwo')}<br>${h('auth.storyThree')}</p><div class="mascot-scene">${mascot()}<span class="mascot-note">${h('auth.mascot')}</span></div></div><div class="story-footer"><span class="little-dot"></span>${h('auth.storyFooter')}</div></aside>
      <main id="main" class="auth-main" tabindex="-1"><div class="auth-card">${languagePicker()}<div class="auth-mobile-brand">${mascot()}<span>CapyHome</span></div><span class="eyebrow">${h('auth.cardKicker')}</span><h2>${h(register ? 'auth.registerTitle' : 'auth.loginTitle')}</h2><p class="muted">${h(register ? 'auth.registerIntro' : 'auth.loginIntro')}</p><div class="auth-tabs" aria-label="${h('auth.tabs')}"><button type="button" data-auth="login" class="${!register ? 'active' : ''}" aria-pressed="${!register}">${h('auth.login')}</button><button type="button" data-auth="register" class="${register ? 'active' : ''}" aria-pressed="${register}">${h('auth.register')}</button></div>
      ${message ? `<div class="notice ${success ? 'success' : ''}" role="${success ? 'status' : 'alert'}">${esc(message)}</div>` : ''}<form data-form="${register ? 'register' : 'login'}" novalidate>
      ${register ? `<label>${h('auth.name')}<input name="name" autocomplete="name" required maxlength="100" placeholder="${h('auth.namePlaceholder')}"></label>` : ''}
      <label>${h('auth.username')}<input name="username" type="text" autocomplete="username" required maxlength="254" pattern="\\S+" title="${h('auth.usernameHint')}" placeholder="${h('auth.usernamePlaceholder')}" autocapitalize="none" spellcheck="false"></label>
      <label>${h('auth.password')}<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required ${register ? 'minlength="10"' : ''} maxlength="128" placeholder="${h(register ? 'auth.newPasswordPlaceholder' : 'auth.passwordPlaceholder')}" ${register ? 'aria-describedby="password-hint"' : ''}></label>${register ? `<p id="password-hint" class="field-hint">${h('auth.passwordHint')}</p>` : ''}${formEnd(register ? 'auth.registerSubmit' : 'auth.loginSubmit')}</form><p class="auth-footnote">${icon('home')}${h('auth.footnote')}</p></div></main></div>`;
    prepareForms();
  }
  function currentRoute() {
    const key = location.hash.slice(1) || 'dashboard';
    return Object.hasOwn(routes, key) && (!routes[key].admin || state.user?.role === 'admin') ? key : 'dashboard';
  }
  const houseInfo = () => [state.house?.address, state.house?.location].filter(Boolean).join(' · ');
  function renderShell() {
    const navLink = key => `<a href="#${key}" class="nav-link ${state.view === key ? 'active' : ''}" ${state.view === key ? 'aria-current="page"' : ''}>${icon(routes[key].icon)}<span>${esc(routeText(key))}</span></a>`;
    const mainLinks = () => ['dashboard', 'pulizia', 'spazzatura', 'fondo'].map(navLink).join('');
    const adminLinks = () => ['utenti', 'casa', 'raccolta'].map(navLink).join('');
    app.innerHTML = `<div class="app-layout"><aside class="sidebar"><a class="brand" href="#dashboard">${brand()}</a><div class="house-badge">${icon('pin')}<div><strong data-house-name>${esc(state.house?.name || t('shell.house'))}</strong><span data-house-address>${esc(houseInfo() || t('shell.address'))}</span></div></div><nav aria-label="${h('shell.navigation')}"><span class="nav-caption">${h('shell.daily')}</span>${mainLinks()}${state.user.role === 'admin' ? `<span class="nav-caption admin-caption">${h('shell.admin')}</span>${adminLinks()}` : ''}</nav><div class="sidebar-bottom"><div class="sidebar-mascot">${mascot()}<p>${h('shell.care')}<br>${h('shell.everyDay')}</p></div><div class="profile"><span class="avatar">${esc(initial(state.user.name))}</span><div><strong>${esc(state.user.name)}</strong><span>${h(state.user.role === 'admin' ? 'common.admin' : 'common.roommate')}</span></div><button class="icon-button" data-action="logout" aria-label="${h('common.logoutLabel')}" title="${h('common.logout')}">${icon('logout')}</button></div></div></aside>
      <div class="workspace"><header class="topbar"><a href="#dashboard" class="mobile-logo">CapyHome</a><span class="topbar-house" data-house-name>${esc(state.house?.name || t('shell.house'))}</span><span class="topbar-date">${esc(new Date().toLocaleDateString(i18n.locale, { timeZone: state.timeZone, weekday: 'long', day: 'numeric', month: 'long' }))}</span>${languagePicker()}<button class="icon-button mobile-logout" data-action="logout" aria-label="${h('common.logoutLabel')}">${icon('logout')}</button></header>${state.user.role === 'admin' ? `<nav class="mobile-admin" aria-label="${h('shell.adminNavigation')}">${adminLinks()}</nav>` : ''}<main id="main" tabindex="-1"></main><footer class="page-footer">${h('shell.footer')} <strong>${h('shell.footerTogether')}</strong></footer></div><nav class="mobile-nav" aria-label="${h('shell.navigation')}">${mainLinks()}</nav></div>`;
  }
  function updateHouse() {
    document.querySelectorAll('[data-house-name]').forEach(el => { el.textContent = state.house?.name || t('shell.house'); });
    document.querySelectorAll('[data-house-address]').forEach(el => { el.textContent = houseInfo() || t('shell.address'); });
  }
  const heading = () => `<div class="page-heading"><span class="eyebrow">${esc(routeText(state.view, 'kicker'))}</span><h1>${state.view === 'dashboard' ? h('dashboard.hello', { name: state.user.name }) : esc(routeText(state.view))}</h1><p>${esc(routeText(state.view, 'subtitle'))}</p></div>`;
  async function loadView(focus = false) {
    if (!state.user) return;
    state.view = currentRoute(); state.data = null;
    Object.values(state.pagination).forEach(settings => { settings.page = 1; });
    const id = ++state.loadId;
    renderShell();
    document.title = `${routeText(state.view)} · CapyHome`;
    const main = document.querySelector('#main');
    main.innerHTML = `${heading()}<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span><p>${h('common.loading')}</p></div>`;
    main.setAttribute('aria-busy', 'true');
    if (focus) main.focus({ preventScroll: true });
    try {
      const data = await api(routes[state.view].endpoint);
      if (id !== state.loadId || !state.user) return;
      state.data = data;
      if (data.house) { state.house = data.house; updateHouse(); }
      main.innerHTML = heading() + renderView();
      prepareForms();
      announcer.textContent = t('common.loaded', { name: routeText(state.view) });
    } catch (error) {
      if (id !== state.loadId || !state.user) return;
      main.innerHTML = `${heading()}<div class="error-state">${icon('alert')}<h2>${h('common.loadError')}</h2><p>${esc(error.message)}</p><button class="button secondary" data-action="retry">${h('common.retry')}</button></div>`;
    } finally { main.removeAttribute('aria-busy'); }
  }
  function roomCard(room, selectable = false) {
    const content = `<span class="room-icon">${icon('spark')}</span><span class="room-content"><strong>${esc(room.name)}</strong><span class="room-type">${esc(room.type)}</span><span class="room-meta">${room.lastCleanedAt ? `${esc(formatDate(room.lastCleanedAt))}${room.lastCleanedBy ? ` · ${esc(room.lastCleanedBy)}` : ''}` : h('cleaning.never')}</span></span>`;
    return selectable ? `<label class="room-card selectable"><input type="checkbox" name="roomIds" value="${esc(room.id)}">${content}</label>` : `<div class="room-card">${content}</div>`;
  }
  function scheduleCard(item) {
    const isToday = item.days.includes(todayWeekday());
    return `<article class="schedule-card ${isToday ? 'is-today' : ''}"><div class="section-heading"><span class="tile-icon olive">${icon('leaf')}</span>${isToday ? `<span class="badge green">${h('common.today')}</span>` : ''}</div><h3>${esc(item.name)}</h3>${dayChips(item.days)}<p>${esc(item.instructions || t('waste.noInstructions'))}</p></article>`;
  }
  function pageButtons(type, current, total) {
    const pages = [...new Set([1, current - 1, current, current + 1, total])].filter(page => page > 0 && page <= total).sort((a, b) => a - b);
    return pages.map((page, index) => {
      const gap = index && page - pages[index - 1] > 1 ? '<span class="pagination-gap" aria-hidden="true">&hellip;</span>' : '';
      return `${gap}<button type="button" class="pagination-page" data-action="pagination-page" data-pagination="${type}" data-page="${page}" aria-label="${h('pagination.page', { page })}" ${page === current ? 'aria-current="page"' : ''}>${page}</button>`;
    }).join('');
  }
  function pageSizeSelector(type, items, labelKey) {
    const settings = state.pagination[type];
    return items.length > pageSizes[0] ? `<label class="pagination-size"><span>${h(labelKey)}</span><select data-page-size="${type}">${pageSizes.map(size => `<option value="${size}" ${size === settings.size ? 'selected' : ''}>${size}</option>`).join('')}</select></label>` : '';
  }
  function paginated(items, type) {
    const settings = state.pagination[type];
    const pageCount = Math.ceil(items.length / settings.size);
    const page = Math.min(Math.max(settings.page, 1), pageCount);
    return { page, pageCount, visible: items.slice((page - 1) * settings.size, page * settings.size) };
  }
  function paginationControls(type, page, pageCount, labelKey) {
    if (pageCount <= 1) return '';
    return `<nav class="pagination" aria-label="${h(labelKey)}"><div class="pagination-controls"><button type="button" class="pagination-arrow" data-action="pagination-page" data-pagination="${type}" data-page="${page - 1}" aria-label="${h('pagination.previous')}" ${page === 1 ? 'disabled' : ''}>${icon('arrow')}</button><div class="pagination-pages">${pageButtons(type, page, pageCount)}</div><button type="button" class="pagination-arrow next" data-action="pagination-page" data-pagination="${type}" data-page="${page + 1}" aria-label="${h('pagination.next')}" ${page === pageCount ? 'disabled' : ''}>${icon('arrow')}</button></div><span class="sr-only" role="status">${h('pagination.status', { page, pages: pageCount })}</span></nav>`;
  }
  function activityList(items, paginate = false) {
    const symbols = { cleaning: 'spark', waste: 'leaf', contribution: 'plus', expense: 'wallet' };
    if (!items.length) return empty('activity.empty', 'activity.emptyHint', 'clock');
    const { page, pageCount, visible: visibleItems } = paginate ? paginated(items, 'activity') : { page: 1, pageCount: 1, visible: items };
    const list = `<ul class="activity-list">${visibleItems.map(item => {
      const known = Object.hasOwn(symbols, item.type);
      const label = t(known ? `activity.${item.type}` : 'activity.other');
      const description = item.type === 'cleaning' ? (item.roomName ? t('activity.cleaningName', { name: item.roomName }) : label) : item.type === 'waste' ? (item.wasteName ? t('activity.wasteName', { name: item.wasteName }) : label) : item.description || label;
      return `<li><span class="activity-icon ${item.type === 'contribution' ? 'olive' : ''}">${icon(known ? symbols[item.type] : 'clock')}</span><div class="activity-content"><strong>${esc(description)}</strong><span>${esc(item.userName)} · ${esc(formatDate(item.date, true))}</span></div>${item.amountCents != null ? `<span class="amount ${item.type === 'contribution' ? 'positive' : ''}">${item.type === 'contribution' ? '+' : '−'}${esc(money(Math.abs(item.amountCents)))}</span>` : `<span class="activity-label">${esc(label)}</span>`}</li>`;
    }).join('')}</ul>`;
    if (!paginate) return list;
    return `<div data-paginated="activity">${list}${paginationControls('activity', page, pageCount, 'activity.pagination')}</div>`;
  }
  function logList(logs, key) {
    if (!logs.length) return empty('log.empty', 'log.emptyHint', 'clock');
    const { page, pageCount, visible: visibleLogs } = paginated(logs, 'log');
    const list = `<ul class="log-list">${visibleLogs.map(log => `<li><span class="avatar small">${esc(initial(log.userName))}</span><div><strong>${esc(log[key])}</strong><p>${esc(log.userName)} <span>· ${esc(formatDate(log.date, true))}</span></p>${log.notes ? `<p class="log-note">${esc(log.notes)}</p>` : ''}</div></li>`).join('')}</ul>`;
    return `<div data-paginated="log">${list}${paginationControls('log', page, pageCount, 'log.pagination')}</div>`;
  }
  function dashboard(data) {
    const due = data.schedule.filter(item => item.days.includes(todayWeekday()));
    return `<section class="welcome-banner"><div><span class="eyebrow">${h('dashboard.welcome', { name: data.house.name || t('dashboard.home') })}</span><h2>${h('dashboard.title')}<br>${h('dashboard.together')}</h2><p>${icon('pin')}${esc(houseInfo() || t('dashboard.location'))}</p><a class="text-link" href="#pulizia">${h('dashboard.action')} ${icon('arrow')}</a></div>${mascot()}</section>
      <div class="stats-grid"><a href="#fondo" class="stat-card"><span class="tile-icon olive">${icon('wallet')}</span><span class="stat-label">${h('dashboard.balance')}</span><strong>${esc(money(data.stats.balanceCents))}</strong><span class="stat-foot">${h('dashboard.balanceFoot')} ${icon('arrow')}</span></a><a href="#pulizia" class="stat-card"><span class="tile-icon clay">${icon('spark')}</span><span class="stat-label">${h('dashboard.cleaning')}</span><strong>${esc(data.stats.cleaningCount)}</strong><span class="stat-foot">${h('dashboard.cleaningFoot')} ${icon('arrow')}</span></a><a href="#spazzatura" class="stat-card"><span class="tile-icon sand">${icon('leaf')}</span><span class="stat-label">${h('dashboard.waste')}</span><strong>${esc(data.stats.wasteCount)}</strong><span class="stat-foot">${h('dashboard.wasteFoot')} ${icon('arrow')}</span></a></div>
      ${state.user.role === 'admin' && data.stats.pendingUsers > 0 ? `<a class="approval-notice" href="#utenti">${icon('users')}<span><strong>${h('dashboard.pending', { count: data.stats.pendingUsers })}</strong>${h('dashboard.pendingHint')}</span>${icon('arrow')}</a>` : ''}
      <div class="dashboard-grid"><section class="panel"><div class="section-heading"><div><span class="eyebrow">${h('dashboard.calendar')}</span><h2>${h('dashboard.today')}</h2></div><a class="subtle-link" href="#spazzatura">${h('common.all')} ${icon('arrow')}</a></div>${due.length ? `<div class="today-list">${due.map(item => `<div>${icon('leaf')}<div><strong>${esc(item.name)}</strong><p>${esc(item.instructions || t('dashboard.instructions'))}</p></div><a class="icon-button" href="#spazzatura" aria-label="${h('dashboard.recordWaste', { name: item.name })}">${icon('plus')}</a></div>`).join('')}</div>` : empty('dashboard.noWaste', 'dashboard.noWasteHint')}<a class="button secondary" href="#spazzatura">${icon('plus')}${h('dashboard.record')}</a></section><aside class="daily-note"><span class="eyebrow">${h('dashboard.noteKicker')}</span><span class="note-number">${h('dashboard.noteNumber')}</span><h2>${h('dashboard.noteTitle')}<br>${h('dashboard.noteTogether')}</h2><p>${h('dashboard.noteText')}</p><span class="note-line" aria-hidden="true"></span></aside></div>
      <section class="panel"><div class="section-heading"><h2>${h('dashboard.rooms')}</h2><a class="subtle-link" href="#pulizia">${h('dashboard.roomsLink')} ${icon('arrow')}</a></div>${data.rooms.length ? `<div class="rooms-grid">${data.rooms.map(room => roomCard(room)).join('')}</div>` : empty('dashboard.noRooms', 'dashboard.noRoomsHint', 'home')}</section><section class="panel"><div class="section-heading"><h2>${h('dashboard.activity')}</h2>${icon('clock')}</div>${activityList(data.activity)}</section>`;
  }
  function cleaning(data) {
    return `<div class="split-layout"><section class="panel"><div class="section-heading"><h2>${h('cleaning.title')}</h2><span class="tile-icon clay">${icon('spark')}</span></div><p class="muted">${h('cleaning.intro')}</p><form data-form="cleaning"><fieldset><legend>${h('cleaning.rooms')} <span class="optional">${h('common.atLeastOne')}</span></legend>${data.rooms.length ? `<div class="room-picker">${data.rooms.map(room => roomCard(room, true)).join('')}</div>` : empty('cleaning.empty', 'cleaning.emptyHint', 'home')}</fieldset>${dateField()}${notesField()}${formEnd('cleaning.submit', !data.rooms.length)}</form></section><section class="panel"><div class="section-heading list-heading"><h2>${h('cleaning.log')}</h2><div class="section-heading-actions"><span class="badge">${data.logs.length}</span>${pageSizeSelector('log', data.logs, 'log.perPage')}</div></div>${logList(data.logs, 'roomName')}</section></div>`;
  }
  function waste(data) {
    const currentDay = dayName(todayWeekday());
    return `<section class="section-block"><div class="section-heading waste-calendar-heading"><h2>${h('waste.calendar')}</h2><time class="current-day" datetime="${today()}" aria-label="${h('waste.today', { name: currentDay })}"><span class="current-day-icon">${icon('calendar')}</span><span class="current-day-copy"><small>${h('common.today')}</small><strong>${esc(currentDay)}</strong></span></time></div>${data.schedule.length ? `<div class="schedule-grid">${data.schedule.map(scheduleCard).join('')}</div>` : `<div class="panel">${empty('waste.empty', 'waste.emptyHint')}</div>`}</section><div class="split-layout"><section class="panel"><div class="section-heading"><h2>${h('waste.title')}</h2>${icon('leaf')}</div><form data-form="waste"><label>${h('waste.type')}<select name="wasteTypeId" required><option value="">${h('waste.choose')}</option>${data.schedule.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select></label>${dateField()}${notesField()}${formEnd('waste.submit', !data.schedule.length)}</form></section><section class="panel"><div class="section-heading list-heading"><h2>${h('waste.log')}</h2><div class="section-heading-actions"><span class="badge">${data.logs.length}</span>${pageSizeSelector('log', data.logs, 'log.perPage')}</div></div>${logList(data.logs, 'wasteName')}</section></div>`;
  }
  function fund(data) {
    return `<section class="balance-banner"><div><span class="eyebrow">${h('fund.kicker')}</span><strong>${esc(money(data.balanceCents))}</strong><p>${h('fund.intro')}</p></div><span class="balance-icon">${icon('wallet')}</span></section><div class="split-layout"><section class="panel"><h2>${h('fund.title')}</h2><form data-form="fund"><fieldset><legend>${h('fund.type')}</legend><div class="segmented"><label><input type="radio" name="type" value="contribution" checked><span>${icon('plus')}${h('activity.contribution')}</span></label><label><input type="radio" name="type" value="expense"><span>${icon('wallet')}${h('activity.expense')}</span></label></div></fieldset><label>${h('fund.amount')}<div class="input-with-unit"><span aria-hidden="true">€</span><input name="amount" inputmode="decimal" type="text" required pattern="[0-9]+([.,][0-9]{1,2})?" maxlength="16" placeholder="${h('fund.amountPlaceholder')}" aria-describedby="amount-hint"></div></label><p id="amount-hint" class="field-hint">${h('fund.amountHint')}</p><label>${h('fund.description')}<input name="description" required maxlength="500" placeholder="${h('fund.descriptionPlaceholder')}"></label>${dateField()}${formEnd('fund.submit')}</form></section><section class="panel"><div class="section-heading list-heading"><h2>${h('fund.log')}</h2><div class="section-heading-actions"><span class="badge">${data.transactions.length}</span>${pageSizeSelector('activity', data.transactions, 'activity.perPage')}</div></div>${activityList(data.transactions, true)}</section></div>`;
  }
  function users(data) {
    const statuses = ['pending', 'approved', 'rejected'];
    const sorted = [...data.users].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));
    return `<div class="notice neutral">${icon('users')}<span>${h('users.intro')}</span></div><section class="panel"><div class="section-heading"><h2>${h('users.title')}</h2><span class="badge">${h('users.count', { count: data.users.length })}</span></div>${sorted.length ? `<div class="user-list">${sorted.map(user => `<article class="user-card"><div class="user-summary"><span class="avatar">${esc(initial(user.name))}</span><div><h3>${esc(user.name)}${user.id === state.user.id ? ` <span class="muted small-text">${h('users.you')}</span>` : ''}</h3><p>${esc(user.username)}</p><span class="small-text muted">${h('users.registered', { date: formatDate(user.createdAt, true) })}</span></div><span class="badge ${user.status === 'approved' ? 'green' : user.status === 'pending' ? 'amber' : ''}">${statuses.includes(user.status) ? h(`users.${user.status}`) : esc(user.status)}</span></div><form data-form="user" data-id="${esc(user.id)}"><div class="form-row"><label>${h('users.role', { name: user.name })}<select name="role"><option value="roommate" ${user.role === 'roommate' ? 'selected' : ''}>${h('common.roommate')}</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>${h('common.admin')}</option></select></label><label>${h('users.access', { name: user.name })}<select name="status">${statuses.filter(status => status !== 'pending' || user.status === 'pending').map(status => `<option value="${status}" ${user.status === status ? 'selected' : ''}>${h(`users.${status}`)}</option>`).join('')}</select></label></div>${formEnd(user.status === 'pending' ? 'users.decision' : 'common.save')}</form></article>`).join('')}</div>` : empty('users.empty', 'users.emptyHint', 'users')}</section>`;
  }
  function house(data) {
    return `<div class="split-layout"><section class="panel"><div class="section-heading"><h2>${h('house.title')}</h2>${icon('home')}</div><form data-form="house"><label>${h('house.name')}<input name="name" required maxlength="120" value="${esc(data.house.name)}" placeholder="${h('house.namePlaceholder')}"></label><label>${h('house.address')}<input name="address" maxlength="250" value="${esc(data.house.address)}" placeholder="${h('house.addressPlaceholder')}"></label><label>${h('house.location')}<input name="location" maxlength="150" value="${esc(data.house.location)}" placeholder="${h('house.locationPlaceholder')}"></label>${formEnd('house.submit')}</form></section><section class="panel"><h2>${h('room.title')}</h2><p class="muted">${h('room.intro')}</p><form data-form="room"><label>${h('room.name')}<input name="name" required maxlength="100" placeholder="${h('room.namePlaceholder')}"></label><label>${h('room.type')}<input name="type" required maxlength="100" list="room-types" placeholder="${h('room.typePlaceholder')}"></label><datalist id="room-types">${['kitchen', 'bathroom', 'living', 'bedroom', 'shared', 'outside'].map(type => `<option value="${h(`room.${type}`)}"></option>`).join('')}</datalist>${formEnd('room.submit')}</form></section></div><section class="panel"><div class="section-heading"><h2>${h('room.list')}</h2><span class="badge">${data.rooms.length}</span></div><p class="muted">${h('room.history')}</p>${data.rooms.length ? `<ul class="config-list">${data.rooms.map(room => `<li><span class="tile-icon sand">${icon('home')}</span><div><strong>${esc(room.name)}</strong><span>${esc(room.type)}</span></div><button class="button small secondary" data-action="delete-room" data-id="${esc(room.id)}">${h('common.remove')}<span class="sr-only"> ${esc(room.name)}</span></button></li>`).join('')}</ul>` : empty('room.empty', 'room.emptyHint', 'home')}</section>`;
  }
  function wasteConfigForm(item = null) {
    return `<form data-form="waste-config" ${item ? `data-id="${esc(item.id)}"` : ''}><label>${h('wasteConfig.name')}<input name="name" required maxlength="100" value="${esc(item?.name || '')}" placeholder="${h('wasteConfig.namePlaceholder')}"></label><fieldset><legend>${h('wasteConfig.days')} <span class="optional">${h('common.atLeastOne')}</span></legend><div class="day-picker">${week.map(d => `<label><input type="checkbox" name="days" value="${d}" ${item?.days.includes(d) ? 'checked' : ''} aria-label="${esc(dayName(d))}"><span aria-hidden="true">${esc(dayName(d, true))}</span></label>`).join('')}</div></fieldset><label>${h('wasteConfig.instructions')} <span class="optional">${h('common.optional')}</span><textarea name="instructions" maxlength="2000" rows="3" placeholder="${h('wasteConfig.instructionsPlaceholder')}">${esc(item?.instructions || '')}</textarea></label>${formEnd(item ? 'common.save' : 'wasteConfig.submit')}</form>`;
  }
  function wasteConfig(data) {
    return `<div class="split-layout"><section class="panel"><div class="section-heading"><h2>${h('wasteConfig.title')}</h2>${icon('plus')}</div>${wasteConfigForm()}</section><section class="panel"><div class="section-heading"><h2>${h('wasteConfig.list')}</h2><span class="badge">${data.schedule.length}</span></div><p class="muted">${h('wasteConfig.history')}</p>${data.schedule.length ? `<div class="config-accordions">${data.schedule.map(item => `<details><summary><span><strong>${esc(item.name)}</strong><span class="muted small-text">${esc(week.filter(d => item.days.includes(d)).map(d => dayName(d, true)).join(' · ') || t('wasteConfig.noDays'))}</span></span><span class="summary-plus" aria-hidden="true">+</span></summary><div class="details-body">${wasteConfigForm(item)}<button class="button secondary small remove-button" data-action="delete-waste" data-id="${esc(item.id)}">${h('wasteConfig.remove')}<span class="sr-only"> ${esc(item.name)}</span></button></div></details>`).join('')}</div>` : empty('wasteConfig.empty', 'wasteConfig.emptyHint')}</section></div>`;
  }
  function renderView() {
    return ({ dashboard, pulizia: cleaning, spazzatura: waste, fondo: fund, utenti: users, casa: house, raccolta: wasteConfig })[state.view](state.data);
  }
  function confirmAction(message) {
    document.querySelector('#confirm-description').textContent = message;
    dialog.returnValue = 'cancel';
    return new Promise(resolve => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
      dialog.showModal();
    });
  }
  function prepareForms() {
    // Compare live controls against their DOM defaults, including autofilled passwords.
    // No form values are copied to storage or retained outside their form.
    app.querySelectorAll('form[data-form]').forEach(form => { form.noValidate = true; });
  }
  function paginationItems(type) {
    return type === 'activity' ? state.data?.transactions : type === 'log' ? state.data?.logs : null;
  }
  function paginationMarkup(type) {
    if (type === 'activity') return activityList(state.data.transactions, true);
    return logList(state.data.logs, state.view === 'pulizia' ? 'roomName' : 'wasteName');
  }
  function updatePagination(type, focusSelector) {
    const current = app.querySelector(`[data-paginated="${type}"]`);
    if (!current) return;
    current.outerHTML = paginationMarkup(type);
    app.querySelector(focusSelector)?.focus({ preventScroll: true });
  }
  function hasEdits() {
    return Array.from(app.querySelectorAll('form[data-form] input, form[data-form] textarea, form[data-form] select')).some(el => {
      if (el.type === 'checkbox' || el.type === 'radio') return el.checked !== el.defaultChecked;
      if (el.tagName === 'SELECT') {
        const defaults = Array.from(el.options).filter(option => option.defaultSelected);
        const selected = defaults.length ? defaults : [el.options[0]];
        return Array.from(el.options).some(option => option.selected !== selected.includes(option));
      }
      return el.value !== el.defaultValue || el.validity.badInput;
    });
  }
  function showFormError(form, message) {
    const target = form.querySelector('.form-error');
    target.textContent = message; target.hidden = false; target.focus();
  }
  function validateForm(form) {
    for (const field of form.elements) {
      if (!field.willValidate) continue;
      const validity = field.validity;
      let message;
      if (validity.valueMissing) message = t('validation.required');
      else if (field.minLength > 0 && field.value.length < field.minLength) message = t('validation.short', { count: field.minLength });
      else if (field.maxLength > 0 && field.value.length > field.maxLength) message = t('validation.long', { count: field.maxLength });
      else if (!validity.valid) message = t(field.name === 'username' ? 'validation.username' : field.type === 'date' ? 'validation.date' : field.name === 'amount' ? 'validation.amount' : 'validation.format');
      if (message) { showFormError(form, message); field.setAttribute('aria-invalid', 'true'); return false; }
      field.removeAttribute('aria-invalid');
    }
    return true;
  }
  async function submitForm(form) {
    if (state.switching || form.dataset.busy || !validateForm(form)) return;
    const kind = form.dataset.form;
    const fields = new FormData(form);
    const text = name => String(fields.get(name) || '').trim();
    const body = {};
    let path, method = 'POST', success = 'common.saved';
    form.querySelector('.form-error').hidden = true;
    if (['cleaning', 'waste', 'fund'].includes(kind)) {
      body.date = text('date');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date) || body.date < '1900-01-01' || body.date > today()) return showFormError(form, t('validation.date'));
    }
    if (kind === 'login' || kind === 'register') {
      path = `/api/auth/${kind}`;
      body.username = String(fields.get('username') || '');
      if (!body.username || body.username.length > 254 || /\s/.test(body.username)) return showFormError(form, t('validation.username'));
      body.password = String(fields.get('password') || '');
      if (kind === 'register') {
        body.name = text('name');
        if (!body.name) return showFormError(form, t('validation.name'));
      }
    } else if (kind === 'cleaning') {
      path = '/api/cleaning'; body.roomIds = fields.getAll('roomIds').map(Number);
      if (!body.roomIds.length || body.roomIds.length > 100) return showFormError(form, t('validation.rooms'));
      body.notes = text('notes'); success = 'cleaning.saved';
    } else if (kind === 'waste') {
      path = '/api/waste'; body.wasteTypeId = Number(text('wasteTypeId')); body.notes = text('notes'); success = 'waste.saved';
    } else if (kind === 'fund') {
      path = '/api/fund'; body.type = text('type');
      const amount = text('amount').replace(',', '.');
      const [euros, decimals = ''] = amount.split('.');
      const cents = Number(euros) * 100 + Number(decimals.padEnd(2, '0'));
      if (!/^\d+(\.\d{1,2})?$/.test(amount) || !Number.isSafeInteger(cents) || cents <= 0) return showFormError(form, t('validation.amount'));
      if (cents > 100000000) return showFormError(form, t('validation.amountMax'));
      if (body.type === 'expense' && cents > state.data.balanceCents) return showFormError(form, t('validation.balance'));
      body.amount = `${Number(euros)}.${decimals.padEnd(2, '0')}`; body.description = text('description');
      if (!body.description) return showFormError(form, t('validation.description'));
      success = 'fund.saved';
    } else if (kind === 'user') {
      path = `/api/admin/users/${encodeURIComponent(form.dataset.id)}`; method = 'PATCH'; body.role = text('role');
      if (text('status') !== 'pending') body.status = text('status');
    } else if (kind === 'house') {
      path = '/api/admin/house'; method = 'PUT'; body.name = text('name'); body.address = text('address'); body.location = text('location');
      if (!body.name) return showFormError(form, t('validation.house'));
    } else if (kind === 'room') {
      path = '/api/admin/rooms'; body.name = text('name'); body.type = text('type');
      if (!body.name || !body.type) return showFormError(form, t('validation.room'));
      success = 'room.saved';
    } else if (kind === 'waste-config') {
      path = `/api/admin/waste${form.dataset.id ? `/${encodeURIComponent(form.dataset.id)}` : ''}`; method = form.dataset.id ? 'PUT' : 'POST';
      body.name = text('name'); body.days = fields.getAll('days').map(Number); body.instructions = text('instructions');
      if (!body.name || !body.days.length) return showFormError(form, t('validation.wasteConfig'));
      success = 'wasteConfig.saved';
    } else return;
    form.dataset.busy = 'true';
    const controls = Array.from(form.elements).filter(el => 'disabled' in el);
    const wasDisabled = controls.map(el => el.disabled);
    controls.forEach(el => { el.disabled = true; });
    form.setAttribute('aria-busy', 'true');
    const submit = form.querySelector('[type="submit"]');
    const original = submit.innerHTML;
    submit.innerHTML = `<span class="spinner" aria-hidden="true"></span>${h('common.saving')}`;
    state.actions++;
    try {
      if (kind === 'user' && String(state.user.id) === form.dataset.id && (body.role !== 'admin' || body.status === 'rejected')) {
        if (!await confirmAction(t('confirm.selfAccess'))) return;
      }
      const result = await api(path, { method, body });
      if (kind === 'register') {
        state.authMode = 'login';
        renderAuth(t('auth.pending', { message: result.message || t('auth.registered') }), true);
        document.querySelector('input[name="username"]').value = body.username;
      } else if (kind === 'login') {
        state.user = result.user; state.csrf = result.csrfToken; state.timeZone = result.timeZone ?? 'Europe/Rome';
        await enterApp();
      } else {
        notify(t(success));
        if (kind === 'user' && String(state.user.id) === form.dataset.id) {
          const me = await api('/api/me'); state.user = me.user; state.csrf = me.csrfToken; state.timeZone = me.timeZone ?? 'Europe/Rome';
        }
        if (form.isConnected && state.user) await loadView(true);
      }
    } catch (error) {
      if (form.isConnected) showFormError(form, error.message);
      else if (state.user) notify(error.message);
    } finally {
      state.actions--;
      if (form.isConnected) {
        controls.forEach((el, index) => { el.disabled = wasDisabled[index]; });
        submit.innerHTML = original; form.removeAttribute('aria-busy'); delete form.dataset.busy;
      }
    }
  }
  async function switchLanguage(select) {
    const next = select.value;
    select.value = i18n.language;
    if (next === i18n.language || state.switching) return;
    if (state.requests || state.actions || dialog.open || hasEdits()) return notify(t('common.editGuard'));
    state.switching = true;
    // Freeze interaction across the await so edits cannot begin after the guard.
    app.inert = true;
    app.querySelectorAll('[data-language]').forEach(el => { el.disabled = true; });
    try {
      if (!await i18n.select(next)) return;
      localizeDocument();
      if (state.user) await loadView(); else renderAuth();
    } catch { notify(t('common.languageError')); }
    finally {
      state.switching = false; app.inert = false;
      app.querySelectorAll('[data-language]').forEach(el => { el.disabled = false; el.value = i18n.language; });
      app.querySelector('[data-language]')?.focus({ preventScroll: true });
    }
  }
  document.querySelector('.skip-link').addEventListener('click', event => {
    event.preventDefault(); document.querySelector('#main')?.focus();
  });
  app.addEventListener('change', event => {
    if (event.target.matches('[data-language]')) return void switchLanguage(event.target);
    if (event.target.matches('[data-page-size]')) {
      const type = event.target.dataset.pageSize;
      const size = Number.parseInt(event.target.value, 10);
      if (!Object.hasOwn(state.pagination, type) || !pageSizes.includes(size) || !paginationItems(type)) return;
      state.pagination[type].size = size; state.pagination[type].page = 1;
      updatePagination(type, `[data-page-size="${type}"]`);
    }
  });
  app.addEventListener('input', event => { event.target.removeAttribute('aria-invalid'); });
  app.addEventListener('submit', event => {
    const form = event.target.closest('form[data-form]');
    if (form) { event.preventDefault(); void submitForm(form); }
  });
  app.addEventListener('click', async event => {
    if (state.switching) { event.preventDefault(); return; }
    const auth = event.target.closest('[data-auth]');
    if (auth) {
      if (state.actions) return;
      state.authMode = auth.dataset.auth; renderAuth(); document.querySelector('.auth-card input').focus(); return;
    }
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'bootstrap-retry') return void boot();
    if (action === 'retry') return void loadView(true);
    if (action === 'pagination-page') {
      const type = button.dataset.pagination;
      if (!Object.hasOwn(state.pagination, type)) return;
      const items = paginationItems(type);
      const page = Number.parseInt(button.dataset.page, 10);
      const pageCount = Math.ceil((items?.length || 0) / state.pagination[type].size);
      if (!Number.isInteger(page) || page < 1 || page > pageCount || page === state.pagination[type].page) return;
      state.pagination[type].page = page;
      updatePagination(type, `[data-action="pagination-page"][data-pagination="${type}"][data-page="${page}"]`);
      return;
    }
    button.disabled = true; state.actions++;
    try {
      if (action === 'logout') {
        await api('/api/auth/logout', { method: 'POST' });
        state.user = null; state.csrf = ''; state.house = null; state.data = null; state.loadId++; state.authMode = 'login';
        renderAuth(t('common.loggedOut'), true);
      } else if (action === 'delete-room' || action === 'delete-waste') {
        const isRoom = action === 'delete-room';
        const item = (isRoom ? state.data.rooms : state.data.schedule).find(item => String(item.id) === button.dataset.id);
        if (!item || !await confirmAction(t('confirm.remove', { name: item.name }))) return;
        await api(`/api/admin/${isRoom ? 'rooms' : 'waste'}/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' });
        notify(t(isRoom ? 'room.removed' : 'wasteConfig.removed'));
        if (state.user) await loadView(true);
      }
    } catch (error) { notify(error.message); }
    finally { state.actions--; if (button.isConnected) button.disabled = false; }
  });
  window.addEventListener('hashchange', () => { if (state.user && !state.switching) { void loadView(true); window.scrollTo(0, 0); } });
  window.addEventListener('focus', () => { document.querySelectorAll('input[type="date"]').forEach(input => { input.max = today(); }); });
  async function enterApp() {
    if (currentRoute() !== 'dashboard') {
      try { const data = await api('/api/dashboard'); state.house = data.house; } catch { /* The active view provides its own retry state. */ }
    }
    if (state.user) await loadView();
  }
  async function boot() {
    const retry = app.querySelector('[data-action="bootstrap-retry"]');
    if (retry) retry.disabled = true;
    try {
      await i18n.select(i18n.preferred(), true);
      localizeDocument();
    } catch {
      app.innerHTML = '<main id="main" class="boot" tabindex="-1"><p role="alert">Impossibile caricare le traduzioni. / Translations could not be loaded.</p><button class="button" data-action="bootstrap-retry">Riprova / Retry</button></main>';
      return;
    }
    app.innerHTML = `<main id="main" class="boot" tabindex="-1"><span class="spinner" aria-hidden="true"></span><p role="status">${h('common.loading')}</p></main>`;
    try {
      const me = await api('/api/me'); state.user = me.user; state.csrf = me.csrfToken; state.timeZone = me.timeZone ?? 'Europe/Rome';
      await enterApp();
    } catch (error) { renderAuth(error.status === 401 ? '' : error.message); }
  }
  void boot();
})();
