/* ==========================================================================
   Industriklättrarna – Tidrapport
   Ren JavaScript, ingen build. All data ligger i localStorage på enheten.
   Samma lagringsnycklar som tidigare versioner, så sparade pass följer med.
   ========================================================================== */
'use strict';

/* ---------- Hjälpare ------------------------------------------------------ */
const $ = (sel, root = document) => root.querySelector(sel);
const pad = (n) => String(n).padStart(2, '0');

const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const WEEKDAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
const WEEKDAYS_SHORT = ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör'];

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const icon = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/* Datum och tid i lokal tid (toISOString() ger UTC och kan ge fel dag runt midnatt) */
function localISODate(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function localTime(d = new Date()) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function parseISODate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
function toMinutes(t) {
    const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
    return m ? (+m[1]) * 60 + (+m[2]) : null;
}
/* Passets längd i minuter. Går sluttiden "bakåt" räknas det som att passet passerat midnatt. */
function durationMinutes(e) {
    const a = toMinutes(e && e.startTime);
    const b = toMinutes(e && e.endTime);
    if (a === null || b === null) return 0;
    let d = b - a;
    if (d < 0) d += 24 * 60;
    return d;
}

const nfHours = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const fmtHours = (min) => nfHours.format(min / 60);
const fmtMoney = (n) => Math.round(n).toLocaleString('sv-SE');
function fmtDuration(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h && m) return `${h} h ${m} min`;
    if (h) return `${h} h`;
    return `${m} min`;
}
function dayLabel(dateStr) {
    const d = parseISODate(dateStr);
    if (!d) return 'okänt datum';
    const today = new Date();
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diff = Math.round((t0 - d) / 86400000);
    if (diff === 0) return 'idag';
    if (diff === 1) return 'igår';
    return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/* ---------- Löneperioder (26:e till 25:e) -------------------------------- */
function payPeriodKey(dateStr) {
    const d = parseISODate(dateStr);
    if (!d) return null;
    let y = d.getFullYear();
    let m = d.getMonth();
    if (d.getDate() > 25) {
        m++;
        if (m > 11) { m = 0; y++; }
    }
    return `${y}-${pad(m + 1)}`;
}
function payPeriodInfo(key) {
    const [y, m] = key.split('-').map(Number);
    const start = new Date(y, m - 2, 26);
    const end = new Date(y, m - 1, 25);
    return {
        title: `${capitalize(MONTHS[m - 1])} ${y}`,
        range: `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`,
        monthIdx: m - 1,
        startMonthIdx: start.getMonth(),
    };
}

/* ---------- Lagring -------------------------------------------------------- */
const STORE = { entries: 'work_hours', active: 'active_session', wage: 'hourly_wage', vacation: 'include_vacation' };

function readJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const v = JSON.parse(raw);
        return v === null || v === undefined ? fallback : v;
    } catch (e) { return fallback; }
}
function cleanEntry(e) {
    if (!e || typeof e !== 'object' || !e.id) return null;
    return {
        id: String(e.id),
        date: String(e.date || ''),
        startTime: String(e.startTime || ''),
        endTime: e.endTime ? String(e.endTime) : '',
        notes: String(e.notes || ''),
    };
}

let entries = readJSON(STORE.entries, []);
entries = Array.isArray(entries) ? entries.map(cleanEntry).filter(Boolean) : [];

let activeEntry = (() => {
    const a = cleanEntry(readJSON(STORE.active, null));
    return a && a.startTime ? { ...a, endTime: null } : null;
})();

let hourlyWage = parseFloat(localStorage.getItem(STORE.wage)) || 0;
let includeVacation = localStorage.getItem(STORE.vacation) === 'true';

function persist() {
    try {
        localStorage.setItem(STORE.entries, JSON.stringify(entries));
        if (activeEntry) localStorage.setItem(STORE.active, JSON.stringify(activeEntry));
        else localStorage.removeItem(STORE.active);
        return true;
    } catch (e) {
        toast('Kunde inte spara. Lagringen är full eller blockerad i webbläsaren.', 'warn');
        return false;
    }
}
function persistSettings() {
    try {
        localStorage.setItem(STORE.wage, String(hourlyWage));
        localStorage.setItem(STORE.vacation, String(includeVacation));
    } catch (e) { toast('Kunde inte spara inställningarna.', 'warn'); }
}

/* ---------- Beräkningar ---------------------------------------------------- */
const payMultiplier = () => (includeVacation ? 1.12 : 1);
const earnings = (minutes) => (minutes / 60) * hourlyWage * payMultiplier();

function computeStats() {
    const key = payPeriodKey(localISODate());
    let periodMin = 0, periodCount = 0, totalMin = 0;
    entries.forEach((e) => {
        const m = durationMinutes(e);
        totalMin += m;
        if (payPeriodKey(e.date) === key) { periodMin += m; periodCount++; }
    });
    return { key, periodMin, periodCount, totalMin, totalCount: entries.length };
}
const byNewest = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.startTime || '').localeCompare(a.startTime || '');

/* ---------- Rendering ------------------------------------------------------ */
function renderHero() {
    const el = $('#hero');
    if (!activeEntry) {
        const now = new Date();
        const last = [...entries].sort(byNewest).find((e) => durationMinutes(e) > 0);
        el.dataset.state = 'idle';
        el.innerHTML = `
            <div class="hero-date">${capitalize(WEEKDAYS[now.getDay()])} ${now.getDate()} ${MONTHS[now.getMonth()]}</div>
            <h2 class="hero-title">Klar för arbetspasset?</h2>
            <p class="hero-sub">Stämpla in så loggar vi tiden åt dig.</p>
            <button class="btn btn-primary btn-xl" data-action="clock-in">${icon('play', 'ic-fill')}Stämpla in</button>
            <div class="hero-foot">${last ? `Senaste passet: ${dayLabel(last.date)}, ${fmtHours(durationMinutes(last))} h` : ''}</div>
        `;
    } else {
        el.dataset.state = 'active';
        el.innerHTML = `
            <span class="pill pill-live"><span class="dot"></span>Pass pågår</span>
            <div class="timer" id="timer" role="timer" aria-live="off"></div>
            <p class="hero-sub">Startade ${escapeHTML(activeEntry.startTime)}, ${dayLabel(activeEntry.date)}</p>
            <button class="btn btn-danger btn-xl" data-action="clock-out">${icon('stop', 'ic-fill')}Stämpla ut</button>
            <div class="hero-foot">Tiden räknas även om du stänger appen.</div>
        `;
        paintTimer();
    }
}

function renderSummary() {
    const s = computeStats();
    const info = payPeriodInfo(s.key);
    const hasWage = hourlyWage > 0;
    $('#summary').innerHTML = `
        <div class="summary-head">
            <div class="summary-title">Löneperiod</div>
            <div class="summary-range">${info.range}</div>
        </div>
        <div class="summary-grid">
            <div class="metric">
                <div class="num">${fmtHours(s.periodMin)}<small>h</small></div>
                <div class="label">${s.periodCount} pass i perioden</div>
            </div>
            <div class="metric">
                <div class="num">${hasWage ? fmtMoney(earnings(s.periodMin)) : '–'}${hasWage ? '<small>kr</small>' : ''}</div>
                <div class="label">${hasWage
                    ? (includeVacation ? 'Lön inkl. 12 % semester' : 'Lön')
                    : '<button type="button" data-action="open-settings">Ange timlön</button>'}</div>
            </div>
        </div>
        <div class="summary-foot">
            <div><span>Alla pass</span><span class="v">${s.totalCount}</span></div>
            <div><span>Totalt hittills</span><span class="v">${fmtHours(s.totalMin)} h${hasWage ? `<em>${fmtMoney(earnings(s.totalMin))} kr</em>` : ''}</span></div>
        </div>
    `;
}

function renderHistory() {
    const list = $('#historyList');
    if (!entries.length) {
        list.innerHTML = `
            <div class="card empty">
                <div class="mark"><img src="logo.png" alt=""></div>
                <h3>Inga pass ännu</h3>
                <p>Stämpla in ovan, eller lägg till ett pass i efterhand med knappen Lägg till.</p>
            </div>`;
        return;
    }

    const groups = new Map();
    [...entries].sort(byNewest).forEach((e) => {
        const key = payPeriodKey(e.date) || 'okant';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(e);
    });
    const keys = [...groups.keys()].sort((a, b) => {
        if (a === 'okant') return 1;
        if (b === 'okant') return -1;
        return b.localeCompare(a);
    });

    list.innerHTML = keys.map((key) => {
        const items = groups.get(key);
        const minutes = items.reduce((sum, e) => sum + durationMinutes(e), 0);
        const info = key === 'okant' ? { title: 'Utan datum', range: 'Ange datum för att placera passen', monthIdx: -1 } : payPeriodInfo(key);
        const sum = `${fmtHours(minutes)} h${hourlyWage > 0 ? `<small>${fmtMoney(earnings(minutes))} kr</small>` : ''}`;
        return `
            <section class="card group">
                <div class="group-head">
                    <div>
                        <div class="group-title">${info.title}</div>
                        <div class="group-range">${info.range}</div>
                    </div>
                    <div class="group-sum">${sum}</div>
                </div>
                ${items.map((e) => rowHTML(e, info.monthIdx)).join('')}
            </section>`;
    }).join('');
}

function rowHTML(e, groupMonthIdx) {
    const d = parseISODate(e.date);
    const mins = durationMinutes(e);
    const wd = d
        ? WEEKDAYS_SHORT[d.getDay()] + (d.getMonth() !== groupMonthIdx && groupMonthIdx >= 0 ? ` ${MONTHS_SHORT[d.getMonth()]}` : '')
        : '';
    const times = e.startTime && e.endTime ? `${escapeHTML(e.startTime)} – ${escapeHTML(e.endTime)}` : 'Tid saknas';
    return `
        <button type="button" class="row" data-action="edit-entry" data-id="${escapeHTML(e.id)}">
            <span class="row-date"><span class="wd">${wd}</span><span class="dn">${d ? d.getDate() : '–'}</span></span>
            <span class="row-main">
                <span class="row-time">${times}</span>
                ${e.notes ? `<span class="row-note">${escapeHTML(e.notes)}</span>` : ''}
            </span>
            <span class="row-hours">${mins ? fmtHours(mins) : '–'}<small>h</small></span>
        </button>`;
}

function render() {
    renderHero();
    renderSummary();
    renderHistory();
}

/* ---------- Timer ---------------------------------------------------------- */
let timerInterval = null;

function elapsedSeconds() {
    if (!activeEntry) return 0;
    const d = parseISODate(activeEntry.date);
    const mins = toMinutes(activeEntry.startTime);
    if (!d || mins === null) return 0;
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, mins);
    return Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
}
function paintTimer() {
    const el = $('#timer');
    if (!el) return;
    const s = elapsedSeconds();
    const text = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
    el.setAttribute('aria-label', text);
    // Varje siffra får fast bredd så att tiden inte hoppar i sidled när den tickar
    el.innerHTML = [...text].map((c) => (c === ':' ? '<i>:</i>' : `<b>${c}</b>`)).join('');
}
function startTimer() {
    stopTimer();
    timerInterval = setInterval(paintTimer, 1000);
}
function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

/* ---------- Toast ---------------------------------------------------------- */
let toastTimer = null;
function toast(text, type = 'success') {
    const el = $('#toast');
    if (!el) return;
    el.innerHTML = `<span class="dot ${type === 'success' ? '' : 'warn'}"></span><span>${escapeHTML(text)}</span>`;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ---------- Bottenpanel (sheet) -------------------------------------------- */
const sheetRoot = $('#sheetRoot');
const sheetPanel = $('#sheet');
const sheetContent = $('#sheetContent');
let lastFocus = null;
let closeTimer = null;

function isSheetOpen() { return sheetRoot.classList.contains('open'); }

function openSheet(html) {
    clearTimeout(closeTimer);
    sheetContent.innerHTML = html;
    if (!isSheetOpen()) {
        lastFocus = document.activeElement;
        sheetPanel.scrollTop = 0;
        $('#app').setAttribute('inert', '');
        sheetRoot.setAttribute('aria-hidden', 'false');
        // En frame med panelen utanför bild så att den hinner glida in
        requestAnimationFrame(() => requestAnimationFrame(() => sheetRoot.classList.add('open')));
    }
}
function closeSheet() {
    if (!isSheetOpen()) return;
    sheetRoot.classList.remove('open');
    sheetRoot.setAttribute('aria-hidden', 'true');
    $('#app').removeAttribute('inert');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignorera */ } }
    closeTimer = setTimeout(() => { sheetContent.innerHTML = ''; }, 450);
    resetViewportScroll();
}
/* iOS kan lämna sidan förskjuten efter att tangentbordet stängts.
   Återställ bara när inget fält är i fokus, så vi inte stör när man byter fält. */
function resetViewportScroll() {
    setTimeout(() => {
        const a = document.activeElement;
        if (!a || !/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) window.scrollTo(0, 0);
    }, 120);
}
document.addEventListener('focusout', resetViewportScroll);

const sheetHead = (title, withClose = true) => `
    <div class="sheet-head">
        <h2 id="sheetTitle">${title}</h2>
        ${withClose ? `<button type="button" class="icon-btn" data-action="close-sheet" aria-label="Stäng">${icon('x')}</button>` : ''}
    </div>`;

/* Dra ner i handtaget för att stänga */
(function enableSwipeToClose() {
    const grab = $('#sheetGrab');
    let startY = null, dy = 0;
    grab.addEventListener('pointerdown', (e) => {
        startY = e.clientY; dy = 0;
        sheetPanel.style.transition = 'none';
        try { grab.setPointerCapture(e.pointerId); } catch (err) { /* ignorera */ }
    });
    grab.addEventListener('pointermove', (e) => {
        if (startY === null) return;
        dy = Math.max(0, e.clientY - startY);
        sheetPanel.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
        if (startY === null) return;
        sheetPanel.style.transition = '';
        sheetPanel.style.transform = '';
        const shouldClose = dy > 90;
        startY = null; dy = 0;
        if (shouldClose) closeSheet();
    };
    grab.addEventListener('pointerup', end);
    grab.addEventListener('pointercancel', end);
})();

/* ---------- Formulär: pass ------------------------------------------------- */
function openEntrySheet(id) {
    const existing = id ? entries.find((e) => e.id === id) : null;
    if (id && !existing) return;
    const e = existing || { date: localISODate(), startTime: '', endTime: '', notes: '' };
    openSheet(`
        <form data-form="entry" data-id="${escapeHTML(existing ? existing.id : '')}" data-duration novalidate>
            ${sheetHead(existing ? 'Redigera pass' : 'Lägg till pass')}
            <div class="field">
                <label for="fDate">Datum</label>
                <input class="input" id="fDate" name="date" type="date" value="${escapeHTML(e.date)}">
            </div>
            <div class="field-row">
                <div class="field">
                    <label for="fStart">Starttid</label>
                    <input class="input" id="fStart" name="start" type="time" value="${escapeHTML(e.startTime)}">
                </div>
                <div class="field">
                    <label for="fEnd">Sluttid</label>
                    <input class="input" id="fEnd" name="end" type="time" value="${escapeHTML(e.endTime)}">
                </div>
            </div>
            <div class="field">
                <label for="fNotes">Anteckning</label>
                <input class="input" id="fNotes" name="notes" type="text" maxlength="200" autocomplete="off" enterkeyhint="done"
                       placeholder="Arbetsplats, uppgift eller kund" value="${escapeHTML(e.notes)}">
            </div>
            <div class="hint" data-role="duration"></div>
            <div class="form-error" data-role="error" role="alert"></div>
            <div class="actions ${existing ? 'a-del' : 'a-1-2'}">
                ${existing
                    ? `<button type="button" class="btn-icon-danger" data-action="ask-delete" data-id="${escapeHTML(existing.id)}" aria-label="Radera pass">${icon('trash')}</button>
                       <button type="submit" class="btn btn-primary">Spara</button>`
                    : `<button type="button" class="btn btn-ghost" data-action="close-sheet">Avbryt</button>
                       <button type="submit" class="btn btn-primary">Lägg till pass</button>`}
            </div>
        </form>`);
    updateDurationHint();
}

function submitEntry(form) {
    const fd = new FormData(form);
    const date = String(fd.get('date') || '');
    const start = String(fd.get('start') || '');
    const end = String(fd.get('end') || '');
    const notes = String(fd.get('notes') || '').trim();
    if (!parseISODate(date) || !start || !end) {
        $('[data-role="error"]', form).textContent = 'Fyll i datum, starttid och sluttid.';
        return;
    }
    const id = form.dataset.id;
    if (id) {
        entries = entries.map((e) => (e.id === id ? { ...e, date, startTime: start, endTime: end, notes } : e));
    } else {
        entries.unshift({ id: Date.now().toString(), date, startTime: start, endTime: end, notes });
    }
    if (!persist()) return;
    render();
    closeSheet();
    toast(id ? 'Passet uppdaterades.' : 'Ett nytt pass lades till!');
}

function askDelete(id) {
    const e = entries.find((x) => x.id === id);
    if (!e) return;
    const mins = durationMinutes(e);
    openSheet(`
        ${sheetHead('Radera passet?', false)}
        <p class="sheet-text">${escapeHTML(dayLabel(e.date))}${e.startTime && e.endTime ? `, ${escapeHTML(e.startTime)} – ${escapeHTML(e.endTime)}` : ''}${mins ? ` (${fmtDuration(mins)})` : ''} tas bort för gott. Det går inte att ångra.</p>
        <div class="actions">
            <button type="button" class="btn btn-ghost" data-action="edit-entry" data-id="${escapeHTML(id)}">Avbryt</button>
            <button type="button" class="btn btn-danger" data-action="do-delete" data-id="${escapeHTML(id)}">Radera</button>
        </div>`);
}
function doDelete(id) {
    entries = entries.filter((e) => e.id !== id);
    persist();
    render();
    closeSheet();
    toast('Passet raderades.');
}

/* ---------- Stämpla in / ut ------------------------------------------------ */
function clockIn() {
    const now = new Date();
    activeEntry = { id: Date.now().toString(), date: localISODate(now), startTime: localTime(now), endTime: null, notes: '' };
    persist();
    startTimer();
    render();
    toast('Incheckad! Ha ett bra och säkert arbetspass!');
}

function openClockOutSheet() {
    if (!activeEntry) return;
    const endNow = localTime();
    openSheet(`
        <form data-form="clockout" data-duration data-start="${escapeHTML(activeEntry.startTime)}" novalidate>
            ${sheetHead('Avsluta passet')}
            <div class="sheet-meta"><span>Start <strong>${escapeHTML(activeEntry.startTime)}</strong></span><span data-role="duration"></span></div>
            <div class="field">
                <label for="fEnd">Sluttid</label>
                <input class="input" id="fEnd" name="end" type="time" value="${endNow}">
            </div>
            <div class="field">
                <label for="fNotes">Anteckning (valfritt)</label>
                <input class="input" id="fNotes" name="notes" type="text" maxlength="200" autocomplete="off" enterkeyhint="done"
                       placeholder="Arbetsplats, uppgift eller kund">
            </div>
            <div class="form-error" data-role="error" role="alert"></div>
            <div class="actions a-1-2">
                <button type="button" class="btn btn-ghost" data-action="close-sheet">Fortsätt jobba</button>
                <button type="submit" class="btn btn-primary">Spara passet</button>
            </div>
        </form>`);
    updateDurationHint();
}
function submitClockOut(form) {
    if (!activeEntry) return;
    const fd = new FormData(form);
    const end = String(fd.get('end') || '');
    if (!end) {
        $('[data-role="error"]', form).textContent = 'Fyll i sluttid.';
        return;
    }
    entries.unshift({ ...activeEntry, endTime: end, notes: String(fd.get('notes') || '').trim() });
    activeEntry = null;
    stopTimer();
    if (!persist()) return;
    render();
    closeSheet();
    toast('Utcheckad! Passet är sparat i historiken.');
}

/* Visar passets längd medan man ändrar tiderna */
function updateDurationHint() {
    const form = $('form[data-duration]');
    if (!form) return;
    const target = $('[data-role="duration"]', form);
    if (!target) return;
    const start = form.dataset.start || (form.elements.start ? form.elements.start.value : '');
    const end = form.elements.end ? form.elements.end.value : '';
    if (!start || !end) { target.innerHTML = ''; return; }
    const text = fmtDuration(durationMinutes({ startTime: start, endTime: end }));
    target.innerHTML = form.dataset.form === 'clockout' ? `Längd <strong>${text}</strong>` : `Längd ${text}`;
}
document.addEventListener('input', (e) => { if (e.target.closest('form[data-duration]')) updateDurationHint(); });

/* ---------- Inställningar -------------------------------------------------- */
function openSettings() {
    openSheet(`
        <form data-form="settings" novalidate>
            ${sheetHead('Inställningar')}
            <div class="field">
                <label for="sWage">Timlön (kr/h)</label>
                <input class="input" id="sWage" name="wage" type="text" inputmode="decimal" autocomplete="off"
                       placeholder="T.ex. 180" value="${hourlyWage ? String(hourlyWage).replace('.', ',') : ''}">
            </div>
            <label class="toggle-row">
                <span><strong>Semesterersättning 12 %</strong><small>Läggs på lönen som räknas ut i appen.</small></span>
                <span class="switch"><input type="checkbox" name="vacation" ${includeVacation ? 'checked' : ''}><span class="track"></span></span>
            </label>
            <div class="block">
                <h3>Dina uppgifter</h3>
                <p>Allt sparas bara på den här enheten. Ta en säkerhetskopia ibland, särskilt innan du byter telefon.</p>
                <div class="btn-row">
                    <button type="button" class="btn btn-ghost" data-action="backup-export">${icon('download')}Spara kopia</button>
                    <button type="button" class="btn btn-ghost" data-action="backup-import">${icon('upload')}Läs in kopia</button>
                </div>
            </div>
            <div class="actions a-1-2">
                <button type="button" class="btn btn-ghost" data-action="close-sheet">Avbryt</button>
                <button type="submit" class="btn btn-primary">Spara</button>
            </div>
        </form>`);
}
function submitSettings(form) {
    const fd = new FormData(form);
    const wage = parseFloat(String(fd.get('wage') || '').replace(/\s/g, '').replace(',', '.'));
    hourlyWage = Number.isFinite(wage) && wage > 0 ? wage : 0;
    includeVacation = fd.get('vacation') === 'on';
    persistSettings();
    render();
    closeSheet();
    toast('Inställningar sparade!');
}

/* ---------- Export (CSV) & säkerhetskopia ---------------------------------- */
function canShareFiles() {
    try {
        const f = new File(['x'], 'x.csv', { type: 'text/csv' });
        return !!(navigator.canShare && navigator.canShare({ files: [f] }) && matchMedia('(pointer: coarse)').matches);
    } catch (e) { return false; }
}
/* På telefon öppnas delningsmenyn (Mejl, Meddelanden, Spara i Filer). Annars laddas filen ner. */
async function deliverFile(filename, mime, text) {
    if (canShareFiles()) {
        try {
            const file = new File([text], filename, { type: mime });
            await navigator.share({ files: [file], title: filename });
            return 'shared';
        } catch (err) {
            if (err && err.name === 'AbortError') return 'cancelled';
        }
    }
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return 'downloaded';
}

function periodOptions() {
    const keys = new Set();
    entries.forEach((e) => { const k = payPeriodKey(e.date); if (k) keys.add(k); });
    return [...keys].sort((a, b) => b.localeCompare(a)).map((k) => {
        const [y, m] = k.split('-').map(Number);
        const prev = m === 1 ? 11 : m - 2;
        return { value: k, label: `${capitalize(MONTHS[m - 1])} ${y} (26 ${MONTHS_SHORT[prev]} – 25 ${MONTHS_SHORT[m - 1]})` };
    });
}
function entriesForPeriod(period) {
    return period === 'ALL' ? entries : entries.filter((e) => payPeriodKey(e.date) === period);
}

function openExportSheet() {
    if (!entries.length) { toast('Det finns inga pass att exportera.', 'warn'); return; }
    const opts = periodOptions();
    openSheet(`
        <form data-form="export" novalidate>
            ${sheetHead('Exportera till chef')}
            <div class="field">
                <label for="xPeriod">Löneperiod (26:e till 25:e)</label>
                <select class="input" id="xPeriod" name="period">
                    ${opts.map((o) => `<option value="${o.value}">${escapeHTML(o.label)}</option>`).join('')}
                    <option value="ALL">Alla pass i historiken</option>
                </select>
            </div>
            <div class="hint" id="exportPreview"></div>
            <div class="actions">
                <button type="submit" class="btn btn-primary btn-block">${icon('share')}${canShareFiles() ? 'Dela CSV-fil' : 'Spara CSV-fil'}</button>
            </div>
        </form>`);
    updateExportPreview();
}
function updateExportPreview() {
    const select = $('#xPeriod');
    const out = $('#exportPreview');
    if (!select || !out) return;
    const list = entriesForPeriod(select.value);
    const mins = list.reduce((s, e) => s + durationMinutes(e), 0);
    out.textContent = `${list.length} pass, ${fmtHours(mins)} timmar`;
}
document.addEventListener('change', (e) => { if (e.target.id === 'xPeriod') updateExportPreview(); });

function buildCSV(list) {
    const sorted = [...list].sort((a, b) => -byNewest(a, b));
    let total = 0;
    const rows = sorted.map((e) => {
        const mins = durationMinutes(e);
        total += mins;
        const notes = (e.notes || '').replace(/"/g, '""');
        return [e.date || '', e.startTime || '', e.endTime || '', (mins / 60).toFixed(2).replace('.', ','), `"${notes}"`];
    });
    rows.push(['', '', 'TOTAL TIMMAR:', (total / 60).toFixed(2).replace('.', ','), '']);
    const body = [['Datum', 'Starttid', 'Sluttid', 'Timmar', 'Anteckningar'], ...rows].map((r) => r.join(';')).join('\n');
    return '\uFEFF' + body; // BOM så att Excel läser å, ä och ö rätt
}

async function submitExport(form) {
    const period = String(new FormData(form).get('period') || 'ALL');
    const list = entriesForPeriod(period);
    if (!list.length) { toast('Inga pass i vald period.', 'warn'); return; }
    const suffix = period === 'ALL' ? 'Alla_pass' : `Löneperiod_${period}`;
    const result = await deliverFile(`Tidrapport_Industriklattrarna_${suffix}.csv`, 'text/csv', buildCSV(list));
    if (result === 'cancelled') return;
    closeSheet();
    toast(result === 'downloaded' ? 'Tidrapport sparad som CSV-fil.' : 'Tidrapport exporterad!');
}

async function exportBackup() {
    const payload = {
        app: 'industriklattrarna-tidrapport',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: { hourlyWage, includeVacation },
        entries,
    };
    const result = await deliverFile(`Tidrapport_kopia_${localISODate()}.json`, 'application/json', JSON.stringify(payload, null, 2));
    if (result === 'downloaded') toast('Säkerhetskopia sparad.');
}

let pendingImport = null;
function cleanImported(e, i) {
    if (!e || typeof e !== 'object') return null;
    const date = String(e.date || '');
    const start = String(e.startTime || '');
    const end = String(e.endTime || '');
    if (!parseISODate(date) || toMinutes(start) === null || toMinutes(end) === null) return null;
    return { id: e.id ? String(e.id) : `imp-${Date.now()}-${i}`, date, startTime: start.slice(0, 5), endTime: end.slice(0, 5), notes: String(e.notes || '').slice(0, 200) };
}
function handleImportFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            const list = Array.isArray(data) ? data : data.entries;
            if (!Array.isArray(list)) throw new Error('format');
            const valid = list.map(cleanImported).filter(Boolean);
            if (!valid.length) { toast('Hittade inga pass i filen.', 'warn'); return; }
            pendingImport = { entries: valid, settings: Array.isArray(data) ? null : data.settings || null };
            openSheet(`
                ${sheetHead('Läs in säkerhetskopia?', false)}
                <p class="sheet-text">Dina ${entries.length} pass ersätts av ${valid.length} pass från filen. Det går inte att ångra.</p>
                <div class="actions">
                    <button type="button" class="btn btn-ghost" data-action="close-sheet">Avbryt</button>
                    <button type="button" class="btn btn-primary" data-action="do-import">Läs in</button>
                </div>`);
        } catch (err) {
            toast('Filen gick inte att läsa som en säkerhetskopia.', 'warn');
        }
    };
    reader.readAsText(file);
}
function doImport() {
    if (!pendingImport) return;
    entries = pendingImport.entries;
    const s = pendingImport.settings;
    if (s && Number.isFinite(Number(s.hourlyWage))) hourlyWage = Math.max(0, Number(s.hourlyWage));
    if (s && typeof s.includeVacation === 'boolean') includeVacation = s.includeVacation;
    pendingImport = null;
    persist();
    persistSettings();
    render();
    closeSheet();
    toast('Säkerhetskopian är inläst.');
}
$('#importFile').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleImportFile(file);
    e.target.value = '';
});

/* ---------- Händelser ------------------------------------------------------ */
const ACTIONS = {
    'clock-in': () => clockIn(),
    'clock-out': () => openClockOutSheet(),
    'open-settings': () => openSettings(),
    'open-add': () => openEntrySheet(null),
    'open-export': () => openExportSheet(),
    'edit-entry': (el) => openEntrySheet(el.dataset.id),
    'ask-delete': (el) => askDelete(el.dataset.id),
    'do-delete': (el) => doDelete(el.dataset.id),
    'close-sheet': () => closeSheet(),
    'backup-export': () => exportBackup(),
    'backup-import': () => $('#importFile').click(),
    'do-import': () => doImport(),
};

document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = ACTIONS[el.dataset.action];
    if (fn) fn(el);
});

document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const handlers = { entry: submitEntry, clockout: submitClockOut, settings: submitSettings, export: submitExport };
    const fn = handlers[form.dataset.form];
    if (fn) fn(form);
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isSheetOpen()) closeSheet(); });

/* När appen kommer tillbaka i förgrunden: uppdatera tider och datum direkt */
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !isSheetOpen()) render();
    else if (!document.hidden) paintTimer();
});

/* ---------- Start ---------------------------------------------------------- */
render();
if (activeEntry) startTimer();

/* Offline-stöd (kräver https eller localhost, ignoreras när filen öppnas direkt från disk) */
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
