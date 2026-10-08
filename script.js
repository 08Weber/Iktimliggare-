// ---------- State ----------

// localStorage kan kasta fel (t.ex. Safari med blockerade cookies) – då ska appen ändå starta.
function readItem(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}

function writeItem(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
}

function loadJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) ?? fallback : fallback;
    } catch (e) {
        return fallback;
    }
}

let entries = loadJSON('work_hours', []);
let activeEntry = loadJSON('active_session', null);
let hourlyWage = parseFloat(readItem('hourly_wage')) || 0;
let includeVacation = readItem('include_vacation') === 'true';
let soundOn = readItem('sound_on') !== 'false';
let timerInterval = null;
let toastTimeout = null;
let openPanel = null;
let dialogResolve = null;
let clockOutPending = false;
let lastClockKey = null;

const VACATION_MULTIPLIER = 1.12;
// Klättraren i 3D-klockan firar sig ned en våning per timme; målet markeras vid 8 h.
const SHIFT_GOAL_HOURS = 8;
const MONTHS_SV = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const MONTHS_SHORT_SV = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const WEEKDAYS_SV = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

const root = document.documentElement;
const appScroll = document.getElementById('appScroll');
const clockUI = document.getElementById('clockUI');
const historyList = document.getElementById('historyList');
const statMonthHours = document.getElementById('statMonthHours');
const statTotalPass = document.getElementById('statTotalPass');
const statPeriodEarnings = document.getElementById('statPeriodEarnings');
const statTotalEarnings = document.getElementById('statTotalEarnings');
const periodEarnLabel = document.getElementById('periodEarnLabel');
const totalEarnLabel = document.getElementById('totalEarnLabel');
const skylineRange = document.getElementById('skylineRange');
const skylineHours = document.getElementById('skylineHours');
const manualFormPanel = document.getElementById('manualFormPanel');
const exportModalPanel = document.getElementById('exportModalPanel');
const settingsModalPanel = document.getElementById('settingsModalPanel');
const dialogPanel = document.getElementById('dialogPanel');
const ambientGlow = document.getElementById('ambientGlow');

// Be webbläsaren att inte rensa datan när enheten får ont om lagringsutrymme.
// Påverkar inte Safaris 7-dagarsregel för flikar – använd appen från hemskärmen.
async function requestPersistentStorage() {
    if (!navigator.storage || !navigator.storage.persist) return;
    try {
        if (!(await navigator.storage.persisted())) {
            await navigator.storage.persist();
        }
    } catch (e) {}
}

function save() {
    try {
        localStorage.setItem('work_hours', JSON.stringify(entries));
        if (activeEntry) {
            localStorage.setItem('active_session', JSON.stringify(activeEntry));
        } else {
            localStorage.removeItem('active_session');
        }
    } catch (e) {}
}

// ---------- Helpers ----------

function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Lokalt datum som "YYYY-MM-DD" (toISOString ger UTC och blir fel dag efter midnatt).
function localDateString(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function localTimeString(d = new Date()) {
    return d.toTimeString().slice(0, 5);
}

// Antal timmar för ett pass. Pass som går över midnatt räknas rätt.
function entryHours(e) {
    if (!e || !e.startTime || !e.endTime) return 0;
    const start = new Date(`2000-01-01T${e.startTime}`);
    const end = new Date(`2000-01-01T${e.endTime}`);
    if (isNaN(start) || isNaN(end)) return 0;
    let diff = (end - start) / (1000 * 60 * 60);
    if (diff < 0) diff += 24;
    return diff;
}

// Löneperioden löper 26:e–25:e och namnges efter utbetalningsmånaden, t.ex. "2026-02".
function getPayPeriod(dateString) {
    const [year, month, day] = (dateString || '').split('-').map(Number);
    if (!year || !month || !day) return null;
    let payoutMonth = month;
    let payoutYear = year;
    if (day > 25) {
        payoutMonth++;
        if (payoutMonth > 12) { payoutMonth = 1; payoutYear++; }
    }
    return `${payoutYear}-${String(payoutMonth).padStart(2, '0')}`;
}

function payPeriodParts(period) {
    const [y, m] = period.split('-');
    const monthIdx = parseInt(m, 10) - 1;
    const prevMonthIdx = (monthIdx + 11) % 12;
    return {
        name: `${capitalize(MONTHS_SV[monthIdx])} ${y}`,
        range: `26 ${MONTHS_SHORT_SV[prevMonthIdx]} – 25 ${MONTHS_SHORT_SV[monthIdx]}`
    };
}

function formatPayPeriod(period) {
    const { name, range } = payPeriodParts(period);
    return `${name} (${range.replace(' – ', ' - ')})`;
}

function dayTitle(dateString) {
    const [y, m, d] = dateString.split('-').map(Number);
    const weekday = WEEKDAYS_SV[new Date(y, m - 1, d).getDay()];
    return `${capitalize(weekday)} ${d} ${MONTHS_SHORT_SV[m - 1]}`;
}

function formatHoursCSV(hours) {
    return hours.toFixed(2).replace('.', ',');
}

function formatDuration(hours) {
    const totalMin = Math.round(hours * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h ? `${h} h ${m} min` : `${m} min`;
}

function formatKr(amount) {
    return Math.round(amount).toLocaleString('sv-SE');
}

function currentRate() {
    return hourlyWage * (includeVacation ? VACATION_MULTIPLIER : 1);
}

function activeStartMs() {
    return activeEntry ? new Date(`${activeEntry.date}T${activeEntry.startTime}:00`).getTime() : 0;
}

function showToast(text, type = "success") {
    const toast = document.getElementById('toast');
    const colors = {
        success: ["border-emerald-500/40", "bg-emerald-500"],
        warning: ["border-amber-500/40", "bg-amber-500"],
        info: ["border-zinc-600/60", "bg-amber-400"]
    }[type] || [];
    toast.innerHTML = `
        <div class="flex items-center gap-2 bg-zinc-900/95 border ${colors[0]} px-5 py-3 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] text-sm font-semibold animate-slide-in">
            <span class="w-2 h-2 rounded-full ${colors[1]}"></span>
            ${text}
        </div>
    `;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ---------- Bottenpaneler ----------

// Visar en panel och döljer de andra. Appen bakom trycks bakåt (se .sheet-open i style.css).
function showPanel(panel) {
    if (openPanel && openPanel !== panel) openPanel.classList.remove('is-open');
    openPanel = panel;
    panel.classList.add('is-open');
    panel.scrollTop = 0;
    root.classList.add('sheet-open');
}

function hidePanel(panel) {
    panel.classList.remove('is-open');
    if (openPanel === panel) {
        openPanel = null;
        root.classList.remove('sheet-open');
    }
}

function closeSheet() {
    if (openPanel === dialogPanel) resolveDialog(false);
    else if (openPanel) hidePanel(openPanel);
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSheet();
    if (e.key === 'Enter' && e.target.id === 'dialogInput') resolveDialog(true);
});

// Egen dialog i appens stil istället för prompt()/confirm(). Svarar med { ok, value }.
function openDialog({ icon = 'ph-info', tone = 'amber', title, text = '', summary = '', input = null, okText = 'OK', cancelText = 'Avbryt' }) {
    if (dialogResolve) resolveDialog(false);

    const iconEl = document.getElementById('dialogIcon');
    iconEl.dataset.tone = tone;
    iconEl.innerHTML = `<i class="ph-fill ${icon}"></i>`;
    document.getElementById('dialogTitle').textContent = title;
    document.getElementById('dialogText').textContent = text;

    const summaryEl = document.getElementById('dialogSummary');
    summaryEl.innerHTML = summary;
    summaryEl.classList.toggle('hidden', !summary);

    const inputEl = document.getElementById('dialogInput');
    document.getElementById('dialogInputWrap').classList.toggle('hidden', !input);
    inputEl.value = input?.value || '';
    inputEl.placeholder = input?.placeholder || '';

    const okBtn = document.getElementById('dialogOk');
    okBtn.textContent = okText;
    okBtn.className = `btn-3d btn-${tone} text-sm`;
    document.getElementById('dialogCancel').textContent = cancelText;

    showPanel(dialogPanel);
    return new Promise(resolve => { dialogResolve = resolve; });
}

function resolveDialog(ok) {
    const resolve = dialogResolve;
    dialogResolve = null;
    hidePanel(dialogPanel);
    if (resolve) resolve({ ok, value: document.getElementById('dialogInput').value });
}

// ---------- Inställningar ----------

function openSettingsModal() {
    document.getElementById('settingsWage').value = hourlyWage ? String(hourlyWage).replace('.', ',') : '';
    document.getElementById('settingsVacation').checked = includeVacation;
    document.getElementById('settingsFx').checked = readItem('fx_disabled') !== 'true';
    document.getElementById('settingsGyro').checked = readItem('fx_gyro') === 'true';
    document.getElementById('settingsSound').checked = soundOn;
    // Lutning finns bara på telefoner/surfplattor
    const hasGyro = 'ontouchstart' in window && 'DeviceOrientationEvent' in window;
    document.getElementById('gyroRow').classList.toggle('hidden', !hasGyro);
    showPanel(settingsModalPanel);
}

function closeSettingsModal() {
    hidePanel(settingsModalPanel);
}

function saveSettings() {
    // Svenskt tangentbord ger decimalkomma ("182,50")
    hourlyWage = Math.max(0, parseFloat(document.getElementById('settingsWage').value.replace(',', '.')) || 0);
    includeVacation = document.getElementById('settingsVacation').checked;
    soundOn = document.getElementById('settingsSound').checked;
    writeItem('hourly_wage', hourlyWage);
    writeItem('include_vacation', includeVacation);
    writeItem('sound_on', soundOn);

    // Gyrot måste slås på direkt i trycket – annars får iOS inte fråga om lov.
    const gyro = document.getElementById('settingsGyro').checked;
    writeItem('fx_gyro', gyro);
    if (gyro) window.fx?.enableGyro();
    else window.fx?.disableGyro();

    const fxWanted = document.getElementById('settingsFx').checked;
    const fxWasOn = readItem('fx_disabled') !== 'true';
    writeItem('fx_disabled', !fxWanted);

    closeSettingsModal();
    updateStats();
    renderHistory();
    if (fxWanted !== fxWasOn) {
        showToast(fxWanted ? "3D-effekter på – laddar om..." : "3D-effekter av – laddar om...", "info");
        setTimeout(() => location.reload(), 700);
        return;
    }
    showToast("Inställningar sparade!");
}

// ---------- Export ----------

const BOSS_EMAIL = 'christopher@industriklattrarna.se';

function openExportModal(mode = 'export') {
    if (entries.length === 0) {
        showToast("Det finns inga pass att exportera.", "warning");
        return;
    }
    const periods = new Set(entries.map(e => getPayPeriod(e.date)).filter(Boolean));
    const sortedPeriods = [...periods].sort((a, b) => b.localeCompare(a));
    document.getElementById('exportPeriodSelect').innerHTML =
        sortedPeriods.map(p => `<option value="${p}">${formatPayPeriod(p)}</option>`).join('') +
        '<option value="ALL">Exportera alla pass i historiken</option>';

    const isMail = mode === 'mail';
    document.getElementById('exportTitle').textContent = isMail ? 'Maila Löneperiod' : 'Exportera Löneperiod';
    const confirmBtn = document.getElementById('exportConfirmBtn');
    confirmBtn.textContent = isMail ? 'Skicka mail' : 'Spara CSV-fil';
    confirmBtn.onclick = isMail ? executeMail : executeExport;
    showPanel(exportModalPanel);
}

function closeExportModal() {
    hidePanel(exportModalPanel);
}

function buildExportReport() {
    const period = document.getElementById('exportPeriodSelect').value;
    const isAll = period === "ALL";
    // Äldst först, så att rapporten läses som en tidslinje oavsett i vilken ordning passen lades in
    const filteredEntries = (isAll ? [...entries] : entries.filter(e => getPayPeriod(e.date) === period))
        .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || ''));
    if (filteredEntries.length === 0) {
        showToast("Inga pass i vald period.", "warning");
        return null;
    }

    const headers = ['Datum', 'Starttid', 'Sluttid', 'Timmar', 'Anteckningar'];
    let totalHours = 0;
    const rows = filteredEntries.map(e => {
        const hours = entryHours(e);
        totalHours += hours;
        const safeNotes = (e.notes || '').replace(/"/g, '""');
        return [e.date || '', e.startTime || '', e.endTime || '', formatHoursCSV(hours), `"${safeNotes}"`];
    });
    rows.push(['', '', 'TOTAL TIMMAR:', formatHoursCSV(totalHours), '']);

    const csvContent = [headers, ...rows].map(r => r.join(';')).join('\n');
    return {
        blob: new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' }),
        filename: `Tidrapport_Industriklattrarna_${isAll ? 'Alla_pass' : `Löneperiod_${period}`}.csv`,
        label: isAll ? 'alla pass' : `löneperiod ${formatPayPeriod(period)}`,
        totalHours
    };
}

function downloadReport(report) {
    const url = URL.createObjectURL(report.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = report.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function executeExport() {
    const report = buildExportReport();
    if (!report) return;
    downloadReport(report);
    closeExportModal();
    showToast("Tidrapport exporterad!");
}

// Webbläsare kan inte bifoga filer via mailto:, så på enheter med delningsmeny
// (mobil) delas filen och texten till vald mailapp. Delningsmenyn kan inte fylla
// i mottagaren, så adressen kopieras för att klistras in i Till-fältet. Annars
// laddas filen ner och ett färdigadresserat mail öppnas där filen dras in.
async function executeMail() {
    const report = buildExportReport();
    if (!report) return;

    const subject = `Tidrapport Industriklättrarna – ${report.label}`;
    const body = `Hej Christopher!\n\nHär kommer min tidrapport för ${report.label} ` +
        `(totalt ${formatHoursCSV(report.totalHours)} timmar). CSV-filen är bifogad.\n\nMvh`;
    const file = new File([report.blob], report.filename, { type: 'text/csv' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.clipboard.writeText(BOSS_EMAIL); } catch (e) { /* inte kritiskt */ }
        try {
            await navigator.share({ files: [file], title: subject, text: body });
            closeExportModal();
            showToast("Tidrapport delad!");
            return;
        } catch (e) {
            if (e.name === 'AbortError') return;
        }
    }

    downloadReport(report);
    window.location.href = `mailto:${BOSS_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    closeExportModal();
    showToast("Mailet öppnat – bifoga den nedladdade CSV-filen.", "info");
}

// ---------- Pass ----------

function toggleManualForm() {
    if (openPanel === manualFormPanel) {
        hidePanel(manualFormPanel);
    } else {
        showPanel(manualFormPanel);
    }
}

function saveManualEntry() {
    const startEl = document.getElementById('manualStart');
    const endEl = document.getElementById('manualEnd');
    const notesEl = document.getElementById('manualNotes');
    const date = document.getElementById('manualDate').value;
    if (!date || !startEl.value || !endEl.value) {
        showToast("Vänligen fyll i datum, starttid och sluttid.", "warning");
        return;
    }
    entries.unshift({
        id: Date.now().toString(),
        date,
        startTime: startEl.value,
        endTime: endEl.value,
        notes: notesEl.value
    });
    save();
    render();
    startEl.value = '';
    endEl.value = '';
    notesEl.value = '';
    hidePanel(manualFormPanel);
    showToast("Ett nytt pass lades till!");
}

function clockIn() {
    const now = new Date();
    activeEntry = {
        id: Date.now().toString(),
        date: localDateString(now),
        startTime: localTimeString(now),
        endTime: null,
        notes: ''
    };
    save();
    startTimer();
    render();
    playSound('in');
    showToast("Incheckad! Ha ett bra och säkert arbetspass!");
}

async function clockOut() {
    if (!activeEntry || clockOutPending) return;
    // Sluttiden sätts när du trycker, inte när du skrivit klart anteckningen.
    const endTime = localTimeString();
    const hours = entryHours({ ...activeEntry, endTime });
    const earnings = hours * currentRate();

    clockOutPending = true;
    const { ok, value } = await openDialog({
        icon: 'ph-flag-checkered',
        tone: 'emerald',
        title: 'Avsluta passet?',
        text: 'Lägg gärna till en kort anteckning för passet (valfritt).',
        summary: `
            <div class="sum-grid">
                <div class="sum-tile"><span>TID</span><b>${formatDuration(hours)}</b></div>
                <div class="sum-tile"><span>START–SLUT</span><b>${activeEntry.startTime}–${endTime}</b></div>
                <div class="sum-tile is-money"><span>LÖN</span><b>${currentRate() > 0 ? `${formatKr(earnings)} kr` : '–'}</b></div>
            </div>`,
        input: { placeholder: 'T.ex. Fasadunderhåll, Rope Access på mast...' },
        okText: 'Spara pass',
        cancelText: 'Fortsätt passet'
    });
    clockOutPending = false;
    if (!ok || !activeEntry) return;

    activeEntry.endTime = endTime;
    activeEntry.notes = value.trim();
    entries.unshift(activeEntry);
    activeEntry = null;
    stopTimer();
    save();
    render();
    celebrate(hours, earnings);
    playSound('out');
    showToast("Utcheckad! Passet är sparat i historiken.");
}

async function deleteEntry(id) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    const { ok } = await openDialog({
        icon: 'ph-trash',
        tone: 'red',
        title: 'Radera passet?',
        text: `${entry.date ? dayTitle(entry.date) : 'Utan datum'} · ${entry.startTime || '--:--'}–${entry.endTime || '--:--'}. Det går inte att ångra.`,
        okText: 'Radera',
        cancelText: 'Behåll'
    });
    if (!ok) return;

    const card = historyList.querySelector(`[data-entry-id="${id}"]`);
    if (card) {
        card.style.transitionDelay = '0ms';
        card.classList.add('is-leaving');
        await wait(360);
    }
    entries = entries.filter(e => e.id !== id);
    save();
    render();
    showToast("Passet raderades.");
}

function updateEntry(id, field, value) {
    entries = entries.map(e => e.id === id ? { ...e, [field]: value } : e);
    save();
    // Nytt datum kan flytta passet till en annan löneperiod – gruppera om historiken.
    if (field === 'date') {
        render();
        return;
    }
    updateStats();
    refreshEntryMeta(id);
}

// Uppdaterar passets längd och periodens summa utan att rita om (då tappar fälten fokus).
function refreshEntryMeta(id) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    const pill = document.getElementById(`dur-${id}`);
    if (pill) pill.textContent = `${entryHours(entry).toFixed(1)} h`;
    const period = getPayPeriod(entry.date);
    const sumEl = document.getElementById(`sum-${period}`);
    if (sumEl) sumEl.textContent = periodSumText(entries.filter(e => getPayPeriod(e.date) === period));
}

// Visar "+1 240 kr" över klättraren när ett pass sparas.
function celebrate(hours, earnings) {
    const host = document.getElementById('heroFloat');
    const el = document.createElement('div');
    el.className = 'float-reward';
    el.innerHTML = currentRate() > 0
        ? `+${formatKr(earnings)} kr<small>${formatDuration(hours)}</small>`
        : `+${formatDuration(hours)}<small>PASSET SPARAT</small>`;
    host.appendChild(el);
    setTimeout(() => el.remove(), 2700);
}

// ---------- Timer ----------

const GLOW_IDLE = ['bg-amber-500/[0.02]'];
const GLOW_ACTIVE = ['bg-emerald-500/[0.05]', 'shadow-[inset_0_0_80px_rgba(16,185,129,0.03)]'];

function updateElapsedTime() {
    const timeEl = document.getElementById('elapsedTimeDisplay');
    if (!timeEl || !activeEntry) return;
    const diffSec = Math.floor((Date.now() - activeStartMs()) / 1000);
    if (diffSec < 0) return;
    const h = String(Math.floor(diffSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
    const s = String(diffSec % 60).padStart(2, '0');
    setOdometer(timeEl, `${h}:${m}:${s}`);

    const hours = diffSec / 3600;
    const pct = Math.min(100, (hours / SHIFT_GOAL_HOURS) * 100);
    const floorEl = document.getElementById('clockFloor');
    if (floorEl) floorEl.textContent = `${Math.floor(pct)}% av ${SHIFT_GOAL_HOURS} h`;
    const progressEl = document.getElementById('shiftProgress');
    if (progressEl) progressEl.style.width = `${pct}%`;
    const earnEl = document.getElementById('liveEarnings');
    if (earnEl) earnEl.textContent = currentRate() > 0 ? `· ≈ ${formatKr(hours * currentRate())} kr` : '';
}

function startTimer() {
    clearInterval(timerInterval);
    ambientGlow.classList.remove(...GLOW_IDLE);
    ambientGlow.classList.add(...GLOW_ACTIVE);
    timerInterval = setInterval(updateElapsedTime, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    ambientGlow.classList.remove(...GLOW_ACTIVE);
    ambientGlow.classList.add(...GLOW_IDLE);
}

// ---------- Rendering ----------

function periodSumText(list) {
    const hours = list.reduce((sum, e) => sum + entryHours(e), 0);
    const rate = currentRate();
    return `${hours.toFixed(1)} h${rate > 0 ? ` · ${formatKr(hours * rate)} kr` : ''}`;
}

function updateStats() {
    const currentPayPeriod = getPayPeriod(localDateString());
    let periodHours = 0;
    let totalHours = 0;
    entries.forEach(e => {
        const hours = entryHours(e);
        totalHours += hours;
        if (getPayPeriod(e.date) === currentPayPeriod) periodHours += hours;
    });

    const rate = currentRate();
    setOdometer(statTotalPass, entries.length);
    setOdometer(statMonthHours, periodHours.toFixed(1));
    setOdometer(statPeriodEarnings, formatKr(periodHours * rate));
    setOdometer(statTotalEarnings, formatKr(totalHours * rate));
    setOdometer(skylineHours, periodHours.toFixed(1));

    const { name, range } = payPeriodParts(currentPayPeriod);
    skylineRange.textContent = `${name} · ${range}`;

    periodEarnLabel.innerHTML = `<i class="ph-fill ph-coins text-emerald-500 text-base"></i> ${includeVacation ? 'LÖN (+12% SEM)' : 'LÖN (PERIOD)'}`;
    totalEarnLabel.innerHTML = `<i class="ph-fill ph-vault text-purple-500 text-base"></i> ${includeVacation ? 'TOTAL (+12% SEM)' : 'ALL TIME (KR)'}`;

    notifyFx();
}

function renderClock() {
    // Rita bara om när läget ändras – annars börjar timerns siffror om från noll.
    const key = activeEntry ? `active-${activeEntry.id}-${activeEntry.startTime}` : 'idle';
    if (key === lastClockKey) return;
    lastClockKey = key;

    const today = new Date();
    const todayLabel = `${WEEKDAYS_SV[today.getDay()].slice(0, 3)} ${today.getDate()} ${MONTHS_SHORT_SV[today.getMonth()]}`;

    if (!activeEntry) {
        clockUI.innerHTML = `
            <div class="flex items-center justify-between gap-3">
                <span class="chip chip-idle"><span class="dot"></span> Redo</span>
                <span class="clock-meta">${todayLabel}</span>
            </div>

            <div class="clock-fallback w-20 h-20 bg-zinc-950/80 border border-zinc-800 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <i class="ph ph-clock-countdown text-4xl text-zinc-600"></i>
            </div>

            <div class="text-center space-y-6">
                <div>
                    <h2 class="text-3xl font-extrabold text-white tracking-tight">Klar för arbetspasset?</h2>
                    <p class="text-zinc-400 text-xs mt-1.5 max-w-xs mx-auto font-medium">
                        <span class="fx-only">Stämpla in så firar vi oss ned genom passet – en våning per timme.</span>
                        <span class="no-fx-only">Stämpla in nu så håller vi koll på tiden, aktiviteterna och hjälper dig vid utstämpling.</span>
                    </p>
                </div>
                <button onclick="clockIn()" class="btn-3d btn-amber btn-lg btn-shine text-base">
                    <i class="ph-fill ph-play text-xl"></i> Stämpla in här
                </button>
            </div>
        `;
        return;
    }

    const startedToday = activeEntry.date === localDateString();
    clockUI.innerHTML = `
        <div class="flex items-center justify-between gap-3">
            <span class="chip chip-live"><span class="dot"></span> Pass pågår</span>
            <span id="clockFloor" class="clock-meta"></span>
        </div>

        <div class="text-center space-y-5">
            <div>
                <div id="elapsedTimeDisplay" class="odo odo-fast timer-big font-mono">00:00:00</div>
                <div class="text-zinc-400 font-bold text-[11px] flex flex-wrap items-center justify-center gap-x-1.5 uppercase tracking-wide mt-1">
                    <i class="ph ph-calendar"></i>
                    Startade ${activeEntry.startTime} ${startedToday ? 'idag' : dayTitle(activeEntry.date).toLowerCase()}
                    <span id="liveEarnings" class="text-emerald-400"></span>
                </div>
            </div>
            <div class="shift-track" aria-hidden="true"><div id="shiftProgress" class="shift-fill"></div></div>
            <button onclick="clockOut()" class="btn-3d btn-red btn-lg text-base">
                <i class="ph-fill ph-square text-lg"></i> Avsluta och spara
            </button>
        </div>
    `;
    updateElapsedTime();
}

function renderEntry(entry) {
    return `
        <article class="entry-card ${revealedIds.has(entry.id) ? 'in' : ''}" data-entry-id="${entry.id}">
            <div class="entry-inner bg-zinc-900/75 border border-zinc-800/60 p-4 sm:p-5 rounded-2xl hover:border-zinc-700/60 transition-colors relative group">

                <div class="absolute top-3 right-3 flex items-center gap-1">
                    <span id="dur-${entry.id}" class="dur-pill">${entryHours(entry).toFixed(1)} h</span>
                    <button onclick="deleteEntry('${entry.id}')" class="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors md:opacity-0 group-hover:opacity-100 cursor-pointer" title="Radera pass">
                        <i class="ph ph-trash text-lg"></i>
                    </button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">

                    <div class="md:col-span-3">
                        <label class="text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1 block">Datum</label>
                        <div class="flex items-center gap-2 bg-zinc-950/40 border border-zinc-800/40 rounded-xl px-3.5 py-2 hover:border-zinc-700/40 transition-colors">
                            <i class="ph ph-calendar text-amber-500/80 text-sm"></i>
                            <input type="date" value="${entry.date || ''}" onchange="updateEntry('${entry.id}', 'date', this.value)" class="bg-transparent font-bold text-zinc-100 text-sm border-none p-0 focus:ring-0 cursor-pointer w-full outline-none">
                        </div>
                    </div>

                    <div class="md:col-span-4 flex items-center gap-4">
                        <div class="flex-1">
                            <label class="text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1 block">Start</label>
                            <div class="flex items-center gap-2 bg-zinc-950/40 border border-zinc-800/40 rounded-xl px-3 py-2 hover:border-zinc-700/40 transition-colors">
                                <i class="ph ph-clock-afternoon text-zinc-600 text-sm"></i>
                                <input type="time" value="${entry.startTime || ''}" onchange="updateEntry('${entry.id}', 'startTime', this.value)" class="bg-transparent font-medium text-zinc-200 text-sm border-none p-0 focus:ring-0 w-full outline-none">
                            </div>
                        </div>
                        <div class="text-zinc-600 font-light mt-5">&mdash;</div>
                        <div class="flex-1">
                            <label class="text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1 block">Slut</label>
                            <div class="flex items-center gap-2 bg-zinc-950/40 border border-zinc-800/40 rounded-xl px-3 py-2 hover:border-zinc-700/40 transition-colors">
                                <i class="ph ph-clock-countdown text-zinc-600 text-sm"></i>
                                <input type="time" value="${entry.endTime || ''}" onchange="updateEntry('${entry.id}', 'endTime', this.value)" class="bg-transparent font-medium text-zinc-200 text-sm border-none p-0 focus:ring-0 w-full outline-none">
                            </div>
                        </div>
                    </div>

                    <div class="md:col-span-5 pt-1 md:pt-0">
                        <label class="text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1 block">Anteckning</label>
                        <div class="flex items-center gap-2 bg-zinc-950/40 border border-zinc-800/40 rounded-xl px-3.5 py-2 hover:border-zinc-700/40 transition-colors">
                            <i class="ph ph-pencil-simple text-zinc-600 text-sm"></i>
                            <input type="text" placeholder="Fyll i detaljer för passet..." value="${escapeHTML(entry.notes)}" onchange="updateEntry('${entry.id}', 'notes', this.value)" class="bg-transparent text-zinc-200 text-sm border-none p-0 focus:ring-0 w-full outline-none placeholder:text-zinc-700">
                        </div>
                    </div>
                </div>
            </div>
        </article>
    `;
}

function renderPeriodGroup(period, list) {
    const { name, range } = period ? payPeriodParts(period) : { name: 'Utan datum', range: '' };
    return `
        <section>
            <div class="period-head">
                <div>
                    <span class="period-name">${name}</span>
                    <span class="period-range">${range}</span>
                </div>
                <div id="sum-${period}" class="period-sum">${periodSumText(list)}</div>
            </div>
            <div class="space-y-3">${list.map(renderEntry).join('')}</div>
        </section>
    `;
}

function renderHistory() {
    if (entries.length === 0) {
        historyList.innerHTML = `
            <div class="bg-zinc-900/60 border border-dashed border-zinc-800 p-12 rounded-3xl text-center text-zinc-500 flex flex-col items-center justify-center gap-4">
                <div class="w-16 h-16 bg-zinc-950/40 rounded-2xl border border-zinc-800/80 flex items-center justify-center text-zinc-600">
                    <i class="ph ph-briefcase-metal text-3xl"></i>
                </div>
                <div>
                    <h3 class="font-bold text-zinc-300 text-sm">Här var det tomt</h3>
                    <p class="text-xs mt-1 max-w-xs mx-auto">Det finns inga registrerade pass än. Så fort du stämplar ut eller lägger till pass manuellt visas de här.</p>
                </div>
            </div>
        `;
        return;
    }

    // Senaste först, grupperat per löneperiod
    const sorted = [...entries].sort((a, b) =>
        (b.date || '').localeCompare(a.date || '') || (b.startTime || '').localeCompare(a.startTime || ''));
    const groups = new Map();
    sorted.forEach(e => {
        const period = getPayPeriod(e.date);
        if (!groups.has(period)) groups.set(period, []);
        groups.get(period).push(e);
    });
    historyList.innerHTML = [...groups].map(([period, list]) => renderPeriodGroup(period, list)).join('');
    revealEntries();
}

function render() {
    updateStats();
    renderClock();
    renderHistory();
}

// ---------- Koppling till 3D-lagret (fx/) ----------

// Dagarna i aktuell löneperiod, för skylinen.
function periodData() {
    const period = getPayPeriod(localDateString());
    const [y, m] = period.split('-').map(Number);
    const today = localDateString();
    const rate = currentRate();

    const byDate = new Map();
    entries.forEach(e => {
        if (getPayPeriod(e.date) !== period) return;
        const day = byDate.get(e.date) || { hours: 0, count: 0 };
        day.hours += entryHours(e);
        day.count++;
        byDate.set(e.date, day);
    });

    const days = [];
    for (let d = new Date(y, m - 2, 26); d <= new Date(y, m - 1, 25); d.setDate(d.getDate() + 1)) {
        const key = localDateString(d);
        const { hours, count } = byDate.get(key) || { hours: 0, count: 0 };
        let detail;
        if (count) detail = `${count} pass · ${hours.toFixed(1)} h${rate > 0 ? ` · ${formatKr(hours * rate)} kr` : ''}`;
        else detail = key > today ? 'Kommande dag' : key === today ? 'Inget pass än idag' : 'Ingen tid';
        days.push({
            date: key,
            weekday: (d.getDay() + 6) % 7, // måndag = 0
            hours,
            isToday: key === today,
            isFuture: key > today,
            title: dayTitle(key),
            detail
        });
    }
    return { period, days };
}

window.app = {
    snapshot() {
        return {
            active: !!activeEntry,
            startMs: activeStartMs(),
            goalHours: SHIFT_GOAL_HOURS,
            period: periodData()
        };
    }
};

function notifyFx() {
    document.dispatchEvent(new CustomEvent('app:change'));
}

// ---------- Rörelse: siffror, kort och historik ----------

const DIGIT_STRIP = '<span class="odo-strip">' + [...'0123456789'].map(d => `<span>${d}</span>`).join('') + '</span>';
const pendingOdometers = new Set();
const revealedIds = new Set();
let entryObserver = null;

// Siffror som rullar fram som på en mätare. Bara ändrade siffror rör sig.
function setOdometer(el, value) {
    const text = String(value).replace(/\s/g, ' ');
    if (el.dataset.value === text) return;
    el.dataset.value = text;
    el.setAttribute('aria-label', text);

    const shape = text.replace(/\d/g, '0');
    if (el.dataset.shape !== shape) {
        el.dataset.shape = shape;
        el.innerHTML = [...text].map(c => /\d/.test(c)
            ? `<span class="odo-digit" aria-hidden="true">${DIGIT_STRIP}</span>`
            : `<span class="odo-sep" aria-hidden="true">${c === ' ' ? '&nbsp;' : escapeHTML(c)}</span>`
        ).join('');
        el.offsetWidth; // tvinga fram layout så att första värdet rullar fram från noll
    }

    // Vänta med att rulla tills appen syns (efter introt)
    if (!root.classList.contains('app-revealed')) {
        pendingOdometers.add(el);
        return;
    }
    rollOdometer(el);
}

function rollOdometer(el) {
    const digits = [...el.dataset.value].filter(c => /\d/.test(c));
    el.querySelectorAll('.odo-strip').forEach((strip, i) => {
        strip.style.transform = `translateY(${-Number(digits[i]) * 10}%)`;
    });
}

// Passen fälls in i 3D när de scrollas fram.
function revealEntries() {
    if (!root.classList.contains('app-revealed')) return;
    const cards = historyList.querySelectorAll('.entry-card:not(.in)');
    if (!('IntersectionObserver' in window)) {
        cards.forEach(card => card.classList.add('in'));
        return;
    }
    if (entryObserver) entryObserver.disconnect();
    entryObserver = new IntersectionObserver(items => {
        let n = 0;
        items.forEach(item => {
            if (!item.isIntersecting) return;
            const card = item.target;
            entryObserver.unobserve(card);
            card.style.transitionDelay = `${Math.min(n++, 8) * 70}ms`;
            card.classList.add('in');
            revealedIds.add(card.dataset.entryId);
        });
    }, { root: appScroll, rootMargin: '0px 0px -6% 0px' });
    cards.forEach(card => entryObserver.observe(card));
}

document.addEventListener('app:revealed', () => {
    requestAnimationFrame(() => {
        pendingOdometers.forEach(rollOdometer);
        pendingOdometers.clear();
        revealEntries();
    });
});

// Korten lutar mot fingret/musen och en ljusreflex följer med.
function initTilt(el) {
    const MAX = 9;
    const set = e => {
        const r = el.getBoundingClientRect();
        const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
        el.style.setProperty('--rx', `${((0.5 - py) * MAX).toFixed(2)}deg`);
        el.style.setProperty('--ry', `${((px - 0.5) * MAX).toFixed(2)}deg`);
        el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
        el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
        el.classList.add('is-tilting');
    };
    const reset = () => {
        el.classList.remove('is-tilting');
        el.style.removeProperty('--rx');
        el.style.removeProperty('--ry');
    };
    el.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons) set(e); });
    el.addEventListener('pointerdown', set);
    el.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') reset(); });
    el.addEventListener('pointerleave', reset);
    el.addEventListener('pointercancel', reset);
}

// Håll inne loggan för att spela introt igen.
function initLogoHold() {
    const btn = document.getElementById('logoBtn');
    let timer = null;
    let fired = false;
    const cancel = () => {
        clearTimeout(timer);
        timer = null;
        btn.classList.remove('is-holding');
    };
    btn.addEventListener('pointerdown', () => {
        if (!window.fx) return;
        fired = false;
        btn.classList.add('is-holding');
        timer = setTimeout(() => {
            fired = true;
            cancel();
            window.fx.playIntro();
        }, 700);
    });
    btn.addEventListener('pointerup', () => {
        if (timer && !fired) showToast("Håll inne loggan för att spela introt.", "info");
        cancel();
    });
    btn.addEventListener('pointerleave', cancel);
    btn.addEventListener('pointercancel', cancel);
    btn.addEventListener('contextmenu', e => e.preventDefault());
}

// ---------- Ljud ----------

let audioCtx = null;

// Syntetiskt karbinklick (in) och ett litet ackord (ut). Inga ljudfiler behövs.
function playSound(kind) {
    if (!soundOn) return;
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const t0 = audioCtx.currentTime + 0.01;

        const click = (at, freq, gain) => {
            const len = Math.floor(audioCtx.sampleRate * 0.04);
            const buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
            const src = audioCtx.createBufferSource();
            src.buffer = buffer;
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = freq;
            filter.Q.value = 6;
            const g = audioCtx.createGain();
            g.gain.value = gain;
            src.connect(filter).connect(g).connect(audioCtx.destination);
            src.start(at);
        };
        const tone = (at, freq, dur, gain) => {
            const osc = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, at);
            g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
            osc.connect(g).connect(audioCtx.destination);
            osc.start(at);
            osc.stop(at + dur + 0.05);
        };

        if (kind === 'in') {
            click(t0, 3800, 1.4);         // grinden öppnas
            click(t0 + 0.085, 5200, 1.8); // och slår igen
            tone(t0 + 0.085, 2637, 0.25, 0.05);
        } else {
            click(t0, 4200, 1.2);
            tone(t0 + 0.02, 784, 0.5, 0.08);
            tone(t0 + 0.12, 988, 0.5, 0.07);
            tone(t0 + 0.22, 1319, 0.8, 0.07);
        }
    } catch (e) {}
}

// ---------- Start ----------

// Rensa bort trasiga poster från äldre versioner så att resten av koden kan lita på formatet.
entries = Array.isArray(entries) ? entries.filter(e => e && e.id) : [];

document.getElementById('manualDate').value = localDateString();
document.querySelectorAll('.tilt').forEach(initTilt);
initLogoHold();
render();
if (activeEntry) startTimer();
requestPersistentStorage();

// Appen kan ligga öppen i bakgrunden i flera dagar (hemskärmsappen på iPhone). När den visas
// igen ritas allt om så att dagens datum, löneperioden och skylinen stämmer.
let lastShownDate = localDateString();
document.addEventListener('visibilitychange', () => {
    if (document.hidden || localDateString() === lastShownDate) return;
    lastShownDate = localDateString();
    document.getElementById('manualDate').value = lastShownDate;
    lastClockKey = null;
    render();
});
