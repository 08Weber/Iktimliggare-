// ---------- State ----------

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
let hourlyWage = parseFloat(localStorage.getItem('hourly_wage')) || 0;
let includeVacation = localStorage.getItem('include_vacation') === 'true';
let timerInterval = null;
let toastTimeout = null;

const VACATION_MULTIPLIER = 1.12;
const MONTHS_SV = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const MONTHS_SHORT_SV = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

const clockUI = document.getElementById('clockUI');
const historyList = document.getElementById('historyList');
const statMonthHours = document.getElementById('statMonthHours');
const statTotalPass = document.getElementById('statTotalPass');
const statPeriodEarnings = document.getElementById('statPeriodEarnings');
const statTotalEarnings = document.getElementById('statTotalEarnings');
const periodEarnLabel = document.getElementById('periodEarnLabel');
const totalEarnLabel = document.getElementById('totalEarnLabel');
const manualFormPanel = document.getElementById('manualFormPanel');
const exportModalPanel = document.getElementById('exportModalPanel');
const settingsModalPanel = document.getElementById('settingsModalPanel');
const ambientGlow = document.getElementById('ambientGlow');
const panels = [manualFormPanel, exportModalPanel, settingsModalPanel];

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

function formatPayPeriod(period) {
    const [y, m] = period.split('-');
    const monthIdx = parseInt(m, 10) - 1;
    const prevMonthIdx = (monthIdx + 11) % 12;
    const monthName = MONTHS_SV[monthIdx].charAt(0).toUpperCase() + MONTHS_SV[monthIdx].slice(1);
    return `${monthName} ${y} (26 ${MONTHS_SHORT_SV[prevMonthIdx]} - 25 ${MONTHS_SHORT_SV[monthIdx]})`;
}

function formatHoursCSV(hours) {
    return hours.toFixed(2).replace('.', ',');
}

function showToast(text, type = "success") {
    const toast = document.getElementById('toast');
    const isSuccess = type === "success";
    toast.innerHTML = `
        <div class="flex items-center gap-2 bg-zinc-900 border ${isSuccess ? "border-emerald-500/40" : "border-amber-500/40"} px-5 py-3 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] text-sm font-semibold animate-slide-in">
            <span class="w-2 h-2 rounded-full ${isSuccess ? "bg-emerald-500" : "bg-amber-500"}"></span>
            ${text}
        </div>
    `;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

// Visar en panel och döljer de andra.
function showPanel(panel) {
    panels.forEach(p => p.classList.toggle('hidden', p !== panel));
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------- Inställningar ----------

function openSettingsModal() {
    document.getElementById('settingsWage').value = hourlyWage || '';
    document.getElementById('settingsVacation').checked = includeVacation;
    showPanel(settingsModalPanel);
}

function closeSettingsModal() {
    settingsModalPanel.classList.add('hidden');
}

function saveSettings() {
    hourlyWage = parseFloat(document.getElementById('settingsWage').value) || 0;
    includeVacation = document.getElementById('settingsVacation').checked;
    localStorage.setItem('hourly_wage', hourlyWage);
    localStorage.setItem('include_vacation', includeVacation);
    closeSettingsModal();
    updateStats();
    showToast("Inställningar sparade!");
}

// ---------- Export ----------

function openExportModal() {
    if (entries.length === 0) {
        showToast("Det finns inga pass att exportera.", "warning");
        return;
    }
    const periods = new Set(entries.map(e => getPayPeriod(e.date)).filter(Boolean));
    const sortedPeriods = [...periods].sort((a, b) => b.localeCompare(a));
    document.getElementById('exportPeriodSelect').innerHTML =
        sortedPeriods.map(p => `<option value="${p}">${formatPayPeriod(p)}</option>`).join('') +
        '<option value="ALL">Exportera alla pass i historiken</option>';
    showPanel(exportModalPanel);
}

function closeExportModal() {
    exportModalPanel.classList.add('hidden');
}

function executeExport() {
    const period = document.getElementById('exportPeriodSelect').value;
    const isAll = period === "ALL";
    const filteredEntries = isAll ? entries : entries.filter(e => getPayPeriod(e.date) === period);
    if (filteredEntries.length === 0) {
        showToast("Inga pass i vald period.", "warning");
        return;
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
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Tidrapport_Industriklattrarna_${isAll ? 'Alla_pass' : `Löneperiod_${period}`}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    closeExportModal();
    showToast("Tidrapport exporterad!");
}

// ---------- Pass ----------

function toggleManualForm() {
    if (manualFormPanel.classList.contains('hidden')) {
        showPanel(manualFormPanel);
    } else {
        manualFormPanel.classList.add('hidden');
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
    manualFormPanel.classList.add('hidden');
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
    showToast("Incheckad! Ha ett bra och säkert arbetspass!");
}

function clockOut() {
    if (!activeEntry) return;
    activeEntry.endTime = localTimeString();
    const note = prompt("Lägg till en kort anteckning för passet (valfritt):");
    if (note !== null) activeEntry.notes = note;
    entries.unshift(activeEntry);
    activeEntry = null;
    stopTimer();
    save();
    render();
    showToast("Utcheckad! Passet är sparat i historiken.");
}

function deleteEntry(id) {
    if (!confirm('Är du säker på att du vill radera detta pass?')) return;
    entries = entries.filter(e => e.id !== id);
    save();
    render();
    showToast("Passet raderades.");
}

function updateEntry(id, field, value) {
    entries = entries.map(e => e.id === id ? { ...e, [field]: value } : e);
    save();
    updateStats();
}

// ---------- Timer ----------

const GLOW_IDLE = ['bg-amber-500/[0.02]'];
const GLOW_ACTIVE = ['bg-emerald-500/[0.05]', 'shadow-[inset_0_0_80px_rgba(16,185,129,0.03)]'];

function updateElapsedTime() {
    const timeEl = document.getElementById('elapsedTimeDisplay');
    if (!timeEl || !activeEntry) return;
    const start = new Date(`${activeEntry.date}T${activeEntry.startTime}:00`);
    const diffSec = Math.floor((Date.now() - start) / 1000);
    if (diffSec < 0) return;
    const h = String(Math.floor(diffSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
    const s = String(diffSec % 60).padStart(2, '0');
    timeEl.innerText = `${h}:${m}:${s}`;
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

function updateStats() {
    const currentPayPeriod = getPayPeriod(localDateString());
    let periodHours = 0;
    let totalHours = 0;
    entries.forEach(e => {
        const hours = entryHours(e);
        totalHours += hours;
        if (getPayPeriod(e.date) === currentPayPeriod) periodHours += hours;
    });

    const rate = hourlyWage * (includeVacation ? VACATION_MULTIPLIER : 1);
    statTotalPass.innerText = entries.length;
    statMonthHours.innerText = periodHours.toFixed(1);
    statPeriodEarnings.innerText = Math.round(periodHours * rate).toLocaleString('sv-SE');
    statTotalEarnings.innerText = Math.round(totalHours * rate).toLocaleString('sv-SE');

    periodEarnLabel.innerHTML = `<i class="ph-fill ph-coins text-emerald-500 text-base"></i> ${includeVacation ? 'LÖN (+12% SEM)' : 'LÖN (PERIOD)'}`;
    totalEarnLabel.innerHTML = `<i class="ph-fill ph-vault text-purple-500 text-base"></i> ${includeVacation ? 'TOTAL (+12% SEM)' : 'ALL TIME (KR)'}`;
}

function renderClock() {
    if (!activeEntry) {
        clockUI.innerHTML = `
            <div class="text-center space-y-6">
                <div class="w-20 h-20 bg-zinc-950/80 border border-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-inner">
                    <i class="ph ph-clock-countdown text-4xl text-zinc-600"></i>
                </div>
                <div>
                    <h2 class="text-3xl font-extrabold text-white tracking-tight">Klar för arbetspasset?</h2>
                    <p class="text-zinc-400 text-xs mt-1.5 max-w-sm mx-auto font-medium">Stämpla in nu så håller vi koll på tiden, aktiviteterna och hjälper dig vid utstämpling.</p>
                </div>

                <div class="flex flex-col items-center gap-2 pt-2">
                    <button onclick="clockIn()" class="group relative flex items-center justify-center gap-3 bg-amber-500 hover:bg-amber-600 text-zinc-950 px-10 py-5 rounded-2xl text-base font-extrabold transition-all shadow-[0_10px_35px_-5px_rgba(245,158,11,0.3)] hover:shadow-[0_15px_45px_-5px_rgba(245,158,11,0.5)] active:scale-95 cursor-pointer">
                        <i class="ph-fill ph-play text-xl group-hover:scale-110 transition-transform"></i> Stämpla in här
                    </button>
                    <span class="text-[10px] uppercase font-bold text-zinc-500 tracking-[0.1em] mt-1 flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-zinc-600"></span> ONLINE & REDO
                    </span>
                </div>
            </div>
        `;
        return;
    }

    clockUI.innerHTML = `
        <div class="text-center space-y-6">
            <div class="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-1.5 rounded-full text-xs font-bold tracking-wide animate-pulse mb-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                PASS PÅGÅR
            </div>

            <div class="space-y-1">
                <div id="elapsedTimeDisplay" class="text-6xl sm:text-7xl font-black text-white tracking-tighter font-mono bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-200">
                    00:00:00
                </div>
                <div class="text-zinc-500 font-bold text-xs flex items-center justify-center gap-1.5 uppercase tracking-wide">
                    <i class="ph ph-calendar"></i>
                    Startade ${activeEntry.startTime} idag
                </div>
            </div>

            <div class="flex flex-col items-center gap-2 pt-2">
                <button onclick="clockOut()" class="group relative flex items-center justify-center gap-3 bg-red-500 hover:bg-red-600 text-white px-10 py-5 rounded-2xl text-base font-extrabold transition-all shadow-[0_10px_35px_-5px_rgba(239,68,68,0.3)] hover:shadow-[0_15px_45px_-5px_rgba(239,68,68,0.5)] active:scale-95 cursor-pointer">
                    <i class="ph-fill ph-square text-lg group-hover:scale-110 transition-transform"></i> Avsluta och spara
                </button>
                <span class="text-[10px] uppercase font-bold text-emerald-500 tracking-[0.1em] mt-1 flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span> LOGGAR TIMMAR JUST NU
                </span>
            </div>
        </div>
    `;
    updateElapsedTime();
}

function renderEntry(entry) {
    return `
        <div class="card-entry bg-zinc-900/30 border border-zinc-800/60 p-4 sm:p-5 rounded-2xl hover:border-zinc-700/60 transition-all relative group">

            <button onclick="deleteEntry('${entry.id}')" class="absolute top-4 right-4 p-2 text-zinc-500 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors md:opacity-0 group-hover:opacity-100 cursor-pointer" title="Radera pass">
                <i class="ph ph-trash text-lg"></i>
            </button>

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
                    <label class="text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1 block">Arbetsuppgift / Kund / Anteckning</label>
                    <div class="flex items-center gap-2 bg-zinc-950/40 border border-zinc-800/40 rounded-xl px-3.5 py-2 hover:border-zinc-700/40 transition-colors">
                        <i class="ph ph-pencil-simple text-zinc-600 text-sm"></i>
                        <input type="text" placeholder="Fyll i detaljer för passet..." value="${escapeHTML(entry.notes)}" onchange="updateEntry('${entry.id}', 'notes', this.value)" class="bg-transparent text-zinc-200 text-sm border-none p-0 focus:ring-0 w-full outline-none placeholder:text-zinc-700">
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderHistory() {
    if (entries.length === 0) {
        historyList.innerHTML = `
            <div class="bg-zinc-900/40 border border-dashed border-zinc-800 p-12 rounded-3xl text-center text-zinc-500 flex flex-col items-center justify-center gap-4">
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
    historyList.innerHTML = entries.map(renderEntry).join('');
}

function render() {
    updateStats();
    renderClock();
    renderHistory();
}

// ---------- Start ----------

// Rensa bort trasiga poster från äldre versioner så att resten av koden kan lita på formatet.
entries = Array.isArray(entries) ? entries.filter(e => e && e.id) : [];

document.getElementById('manualDate').value = localDateString();
render();
if (activeEntry) startTimer();
requestPersistentStorage();
