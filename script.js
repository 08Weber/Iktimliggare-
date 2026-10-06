// Ladda från localStorage om det finns, annars tomma värden
let entries = JSON.parse(localStorage.getItem('work_hours')) || [];
let activeEntry = JSON.parse(localStorage.getItem('active_session')) || null;
let timerInterval = null;

// Elementreferenser
const clockUI = document.getElementById('clockUI');
const historyList = document.getElementById('historyList');
const headerDate = document.getElementById('headerDate');
const statMonthHours = document.getElementById('statMonthHours');
const statTotalPass = document.getElementById('statTotalPass');
const manualFormPanel = document.getElementById('manualFormPanel');
const exportModalPanel = document.getElementById('exportModalPanel');
const ambientGlow = document.getElementById('ambientGlow');

function init() {
    const today = new Date();
    headerDate.innerText = today.toISOString().split('T')[0];
    
    document.getElementById('manualDate').value = today.toISOString().split('T')[0];
    
    render();
    if (activeEntry) {
        startTimer();
    }
}

function save() {
    localStorage.setItem('work_hours', JSON.stringify(entries));
    if (activeEntry) {
        localStorage.setItem('active_session', JSON.stringify(activeEntry));
    } else {
        localStorage.removeItem('active_session');
    }
}

function showToast(text, type = "success") {
    const toast = document.getElementById('toast');
    toast.innerHTML = `
        <div class="flex items-center gap-2 bg-zinc-900 border ${type === "success" ? "border-emerald-500/40" : "border-amber-500/40"} px-5 py-3 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] text-sm font-semibold animate-slide-in">
            <span class="w-2 h-2 rounded-full ${type === "success" ? "bg-emerald-500" : "bg-amber-500"}"></span>
            ${text}
        </div>
    `;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ---- LOGIK FÖR LÖNEPERIODER ----

// Returnerar löneperioden i format "YYYY-MM" (Detta avser MÅNADEN då lönen betalas ut).
// Löneperiod: 26:e föregående månad till 25:e nuvarande månad.
function getPayPeriod(dateString) {
    const d = new Date(dateString);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-11
    const day = d.getDate();
    
    let payoutMonth = month;
    let payoutYear = year;
    
    // Om datumet är > 25, tillhör det NÄSTA månads utbetalning
    if (day > 25) {
        payoutMonth++;
        if (payoutMonth > 11) {
            payoutMonth = 0;
            payoutYear++;
        }
    }
    
    return `${payoutYear}-${String(payoutMonth + 1).padStart(2, '0')}`;
}

window.openExportModal = function() {
    if (entries.length === 0) {
        showToast("Det finns inga pass att exportera.", "warning");
        return;
    }
    
    const periods = new Set();
    entries.forEach(e => {
        periods.add(getPayPeriod(e.date));
    });
    
    const sortedPeriods = Array.from(periods).sort((a, b) => b.localeCompare(a));
    const select = document.getElementById('exportPeriodSelect');
    
    const monthsSv = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
    const monthsShortSv = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    
    select.innerHTML = sortedPeriods.map(p => {
        const [y, m] = p.split('-');
        const currentMonthIdx = parseInt(m) - 1;
        const prevMonthIdx = currentMonthIdx === 0 ? 11 : currentMonthIdx - 1;
        
        const monthName = monthsSv[currentMonthIdx];
        const monthNameCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        
        const currentMonthShort = monthsShortSv[currentMonthIdx];
        const prevMonthShort = monthsShortSv[prevMonthIdx];
        
        return `<option value="${p}">${monthNameCap} ${y} (26 ${prevMonthShort} - 25 ${currentMonthShort})</option>`;
    }).join('') + '<option value="ALL">Exportera alla pass i historiken</option>';
    
    // Stäng manuellt formulär om det är öppet
    manualFormPanel.classList.add('hidden');
    exportModalPanel.classList.remove('hidden');
    exportModalPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.closeExportModal = function() {
    exportModalPanel.classList.add('hidden');
};

window.executeExport = function() {
    const period = document.getElementById('exportPeriodSelect').value;
    let filteredEntries = entries;
    let fileNameSuffix = "Alla_pass";
    
    if (period !== "ALL") {
        filteredEntries = entries.filter(e => getPayPeriod(e.date) === period);
        fileNameSuffix = `Löneperiod_${period}`;
    }
    
    if (filteredEntries.length === 0) {
        showToast("Inga pass i vald period.", "warning");
        return;
    }
    
    const headers = ['Datum', 'Starttid', 'Sluttid', 'Timmar', 'Anteckningar'];
    let totalHours = 0;
    
    const rows = filteredEntries.map(e => {
        let hours = 0;
        if (e.endTime) {
            const start = new Date(`2000-01-01T${e.startTime}`);
            const end = new Date(`2000-01-01T${e.endTime}`);
            hours = (end - start) / (1000 * 60 * 60);
            totalHours += hours;
        }
        const safeNotes = e.notes ? e.notes.replace(/"/g, '""') : '';
        // Konvertera punkt till kommatecken i decimaler för svensk Excel
        const hoursStr = hours.toFixed(2).replace('.', ',');
        return [e.date, e.startTime, e.endTime || '', hoursStr, `"${safeNotes}"`];
    });

    // Lägg till en rad längst ner som summerar totala antalet timmar
    const totalHoursStr = totalHours.toFixed(2).replace('.', ',');
    rows.push(['', '', 'TOTAL TIMMAR:', totalHoursStr, '']);

    // Använd semikolon (;) som separator eftersom Excel på svenska ofta förväntar sig det när decimaler använder kommatecken
    const csvContent = [headers, ...rows].map(e => e.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Tidrapport_Industriklattrarna_${fileNameSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    closeExportModal();
    showToast("Tidrapport exporterad!");
};


// ---- MANUAL FORM LOGIC ----

window.toggleManualForm = function() {
    manualFormPanel.classList.toggle('hidden');
    exportModalPanel.classList.add('hidden');
    if (!manualFormPanel.classList.contains('hidden')) {
        manualFormPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

window.saveManualEntry = function() {
    const date = document.getElementById('manualDate').value;
    const start = document.getElementById('manualStart').value;
    const end = document.getElementById('manualEnd').value;
    const notes = document.getElementById('manualNotes').value;

    if (!date || !start || !end) {
        showToast("Vänligen fyll i datum, starttid och sluttid.", "warning");
        return;
    }

    const newEntry = {
        id: Date.now().toString(),
        date: date,
        startTime: start,
        endTime: end,
        notes: notes
    };

    entries.unshift(newEntry);
    save();
    render();
    
    document.getElementById('manualStart').value = '';
    document.getElementById('manualEnd').value = '';
    document.getElementById('manualNotes').value = '';
    manualFormPanel.classList.add('hidden');
    
    showToast("Ett nytt pass lades till!");
};

// ---- LOGIK FÖR STÄMPELKLOCKA ----

window.clockIn = function() {
    const now = new Date();
    activeEntry = {
        id: Date.now().toString(),
        date: now.toISOString().split('T')[0],
        startTime: now.toTimeString().slice(0, 5),
        endTime: null,
        notes: ''
    };
    save();
    startTimer();
    render();
    showToast("Incheckad! Ha ett bra och säkert arbetspass!");
};

window.clockOut = function() {
    if (!activeEntry) return;
    const now = new Date();
    activeEntry.endTime = now.toTimeString().slice(0, 5);
    
    const notePrompt = prompt("Lägg till en kort anteckning för passet (valfritt):");
    if (notePrompt !== null) {
        activeEntry.notes = notePrompt;
    }
    
    entries.unshift(activeEntry);
    activeEntry = null;
    stopTimer();
    save();
    render();
    showToast("Utcheckad! Passet är sparat i historiken.");
};

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    if (ambientGlow) {
        ambientGlow.classList.remove('bg-amber-500/[0.02]');
        ambientGlow.classList.add('bg-emerald-500/[0.05]', 'shadow-[inset_0_0_80px_rgba(16,185,129,0.03)]');
    }

    timerInterval = setInterval(() => {
        const timeEl = document.getElementById('elapsedTimeDisplay');
        if (timeEl && activeEntry) {
            const start = new Date(`${activeEntry.date}T${activeEntry.startTime}:00`);
            const now = new Date();
            const diffSec = Math.floor((now - start) / 1000);
            
            if (diffSec >= 0) {
                const h = String(Math.floor(diffSec / 3600)).padStart(2, '0');
                const m = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
                const s = String(diffSec % 60).padStart(2, '0');
                timeEl.innerText = `${h}:${m}:${s}`;
            }
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    if (ambientGlow) {
        ambientGlow.classList.remove('bg-emerald-500/[0.05]', 'shadow-[inset_0_0_80px_rgba(16,185,129,0.03)]');
        ambientGlow.classList.add('bg-amber-500/[0.02]');
    }
}

// ---- LOGIK FÖR REDIGERING ----

window.deleteEntry = function(id) {
    if (confirm('Är du säker på att du vill radera detta pass?')) {
        entries = entries.filter(e => e.id !== id);
        save();
        render();
        showToast("Passet raderades.");
    }
};

window.updateEntry = function(id, field, value) {
    entries = entries.map(e => e.id === id ? { ...e, [field]: value } : e);
    save();
    updateStats();
};

// ---- UPPDATERA GRÄNSSNITT (UI) ----

function updateStats() {
    statTotalPass.innerText = entries.length;
    
    const today = new Date();
    const currentPayPeriod = getPayPeriod(today.toISOString().split('T')[0]);
    let periodHours = 0;
    
    entries.forEach(e => {
        if (e.endTime && getPayPeriod(e.date) === currentPayPeriod) {
            const start = new Date(`2000-01-01T${e.startTime}`);
            const end = new Date(`2000-01-01T${e.endTime}`);
            periodHours += (end - start) / (1000 * 60 * 60);
        }
    });
    
    statMonthHours.innerText = periodHours.toFixed(1);
}

function render() {
    updateStats();

    // Uppdatera stämpelklockan
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
                    <button onclick="clockIn()" class="group relative flex items-center justify-center gap-3 bg-amber-500 hover:bg-amber-600 text-zinc-950 px-10 py-5 rounded-2xl text-base font-extrabold transition-all shadow-[0_10px_35px_-5px_rgba(245,158,11,0.3)] hover:shadow-[0_15px_45px_-5px_rgba(245,158,11,0.5)] active:scale-95">
                        <i class="ph-fill ph-play text-xl group-hover:scale-110 transition-transform"></i> Stämpla in här
                    </button>
                    <span class="text-[10px] uppercase font-bold text-zinc-500 tracking-[0.1em] mt-1 flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-zinc-600"></span> ONLINE & REDO
                    </span>
                </div>
            </div>
        `;
    } else {
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
                    <button onclick="clockOut()" class="group relative flex items-center justify-center gap-3 bg-red-500 hover:bg-red-600 text-white px-10 py-5 rounded-2xl text-base font-extrabold transition-all shadow-[0_10px_35px_-5px_rgba(239,68,68,0.3)] hover:shadow-[0_15px_45px_-5px_rgba(239,68,68,0.5)] active:scale-95">
                        <i class="ph-fill ph-square text-lg group-hover:scale-110 transition-transform"></i> Avsluta och spara
                    </button>
                    <span class="text-[10px] uppercase font-bold text-emerald-500 tracking-[0.1em] mt-1 flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span> LOGGAR TIMMAR JUST NU
                    </span>
                </div>
            </div>
        `;
    }

    // Uppdatera historiklistan
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
    } else {
        historyList.innerHTML = entries.map(entry => `
            <div class="card-entry bg-zinc-900/30 border border-zinc-800/60 p-4 sm:p-5 rounded-2xl hover:border-zinc-700/60 transition-all relative group">
                
                <button onclick="deleteEntry('${entry.id}')" class="absolute top-4 right-4 p-2 text-zinc-500 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors md:opacity-0 group-hover:opacity-100" title="Radera pass">
                    <i class="ph ph-trash text-lg"></i>
                </button>

                <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    
                    <div class="md:col-span-3">
                        <label class="text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1 block">Datum</label>
                        <div class="flex items-center gap-2 bg-zinc-950/40 border border-zinc-800/40 rounded-xl px-3.5 py-2 hover:border-zinc-700/40 transition-colors">
                            <i class="ph ph-calendar text-amber-500/80 text-sm"></i>
                            <input type="date" value="${entry.date}" onchange="updateEntry('${entry.id}', 'date', this.value)" class="bg-transparent font-bold text-zinc-100 text-sm border-none p-0 focus:ring-0 cursor-pointer w-full outline-none">
                        </div>
                    </div>
                    
                    <div class="md:col-span-4 flex items-center gap-4">
                        <div class="flex-1">
                            <label class="text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1 block">Start</label>
                            <div class="flex items-center gap-2 bg-zinc-950/40 border border-zinc-800/40 rounded-xl px-3 py-2 hover:border-zinc-700/40 transition-colors">
                                <i class="ph ph-clock-afternoon text-zinc-600 text-sm"></i>
                                <input type="time" value="${entry.startTime}" onchange="updateEntry('${entry.id}', 'startTime', this.value)" class="bg-transparent font-medium text-zinc-200 text-sm border-none p-0 focus:ring-0 w-full outline-none">
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
                            <input type="text" placeholder="Fyll i detaljer för passet..." value="${entry.notes || ''}" onchange="updateEntry('${entry.id}', 'notes', this.value)" class="bg-transparent text-zinc-200 text-sm border-none p-0 focus:ring-0 w-full outline-none placeholder:text-zinc-700">
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }
}

init();
