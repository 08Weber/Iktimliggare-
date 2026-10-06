'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Play, Square, Download, Trash2, Clock, Calendar, BarChart3, FileText, CheckCircle2 } from 'lucide-react';
import { format, parseISO, differenceInMinutes, startOfMonth, isAfter } from 'date-fns';
import { sv } from 'date-fns/locale';

interface TimeEntry {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  notes: string;
}

export default function Home() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const [isMounted, setIsMounted] = useState(false);

  // Undvik hydration-fel genom att bara rendera klient-specifik data efter mount
  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem('work_hours');
    const active = localStorage.getItem('active_session');
    if (saved) setEntries(JSON.parse(saved));
    if (active) setActiveEntry(JSON.parse(active));
  }, []);

  // Spara data när den ändras
  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('work_hours', JSON.stringify(entries));
      if (activeEntry) {
        localStorage.setItem('active_session', JSON.stringify(activeEntry));
      } else {
        localStorage.removeItem('active_session');
      }
    }
  }, [entries, activeEntry, isMounted]);

  // Uppdatera live-timern när ett pass är aktivt
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeEntry) {
      interval = setInterval(() => {
        const start = new Date(`${activeEntry.date}T${activeEntry.startTime}:00`);
        const now = new Date();
        const diffSeconds = Math.floor((now.getTime() - start.getTime()) / 1000);
        
        if (diffSeconds >= 0) {
          const h = Math.floor(diffSeconds / 3600).toString().padStart(2, '0');
          const m = Math.floor((diffSeconds % 3600) / 60).toString().padStart(2, '0');
          const s = (diffSeconds % 60).toString().padStart(2, '0');
          setElapsedTime(`${h}:${m}:${s}`);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activeEntry]);

  const clockIn = () => {
    const now = new Date();
    const newEntry: TimeEntry = {
      id: Date.now().toString(),
      date: format(now, 'yyyy-MM-dd'),
      startTime: format(now, 'HH:mm'),
      endTime: null,
      notes: '',
    };
    setActiveEntry(newEntry);
  };

  const clockOut = () => {
    if (!activeEntry) return;
    const now = new Date();
    const completedEntry = {
      ...activeEntry,
      endTime: format(now, 'HH:mm'),
    };
    setEntries([completedEntry, ...entries]);
    setActiveEntry(null);
    setElapsedTime('00:00:00');
  };

  const deleteEntry = (id: string) => {
    if(confirm('Är du säker på att du vill radera detta pass?')) {
      setEntries(entries.filter(e => e.id !== id));
    }
  };

  const updateEntry = (id: string, field: keyof TimeEntry, value: string) => {
    setEntries(entries.map(e => (e.id === id ? { ...e, [field]: value } : e)));
  };

  // Beräkna totala timmar denna månad
  const calculateMonthHours = () => {
    const startOfCurrentMonth = startOfMonth(new Date());
    let totalMinutes = 0;

    entries.forEach(entry => {
      if (entry.endTime) {
        const entryDate = parseISO(entry.date);
        if (isAfter(entryDate, startOfCurrentMonth) || entryDate.getTime() === startOfCurrentMonth.getTime()) {
          const start = new Date(`2000-01-01T${entry.startTime}`);
          const end = new Date(`2000-01-01T${entry.endTime}`);
          totalMinutes += differenceInMinutes(end, start);
        }
      }
    });
    return (totalMinutes / 60).toFixed(1);
  };

  const exportCSV = () => {
    const headers = ['Datum', 'Starttid', 'Sluttid', 'Timmar', 'Anteckningar'];
    const rows = entries.map(e => {
      let hours = '0';
      if (e.endTime) {
        const start = new Date(`2000-01-01T${e.startTime}`);
        const end = new Date(`2000-01-01T${e.endTime}`);
        hours = (differenceInMinutes(end, start) / 60).toFixed(2);
      }
      return [e.date, e.startTime, e.endTime || '', hours, `"${e.notes.replace(/"/g, '""')}"`];
    });

    const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // \uFEFF for Excel åäö support
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Tidrapport_Industriklattrarna_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isMounted) return null; // Förhindra flash av o-stylat innehåll

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 font-sans pb-20">
      
      {/* Top Navigation / Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-20 flex items-center justify-between">
          <Image 
            src="/logo.png" 
            alt="Industriklättrarna Logo" 
            width={200} 
            height={50} 
            className="object-contain"
          />
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-500">
            <Clock size={16} />
            {format(new Date(), 'd MMM yyyy', { locale: sv })}
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6 mt-4">
        
        {/* Dashbord & Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-100 flex flex-col justify-center">
            <div className="text-zinc-500 mb-1 flex items-center gap-2 text-sm font-medium">
              <Calendar size={16} className="text-amber-500" />
              Denna månad
            </div>
            <div className="text-3xl font-bold tracking-tight text-zinc-800">
              {calculateMonthHours()} <span className="text-lg text-zinc-400 font-normal">h</span>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-100 flex flex-col justify-center">
            <div className="text-zinc-500 mb-1 flex items-center gap-2 text-sm font-medium">
              <BarChart3 size={16} className="text-blue-500" />
              Totalt antal pass
            </div>
            <div className="text-3xl font-bold tracking-tight text-zinc-800">
              {entries.length} <span className="text-lg text-zinc-400 font-normal">st</span>
            </div>
          </div>
        </div>

        {/* Stämpelklocka */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100 relative overflow-hidden">
          {/* Dekorativ bakgrund */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-50 rounded-full blur-3xl -z-10 transform translate-x-1/2 -translate-y-1/2 opacity-50"></div>
          
          <div className="flex flex-col items-center justify-center py-6">
            {!activeEntry ? (
              <div className="text-center space-y-6">
                <div className="w-24 h-24 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-100 shadow-inner">
                  <Clock size={40} className="text-zinc-300" />
                </div>
                <h2 className="text-2xl font-bold text-zinc-800">Redo att jobba?</h2>
                <button 
                  onClick={clockIn}
                  className="group relative flex items-center justify-center gap-3 bg-zinc-900 hover:bg-zinc-800 text-white w-64 py-4 rounded-2xl text-lg font-semibold transition-all shadow-xl hover:shadow-2xl active:scale-95"
                >
                  <Play size={20} className="group-hover:scale-110 transition-transform" fill="currentColor" /> 
                  Stämpla in
                </button>
              </div>
            ) : (
              <div className="text-center space-y-6">
                <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-800 px-4 py-1.5 rounded-full text-sm font-bold tracking-wide animate-pulse mb-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  PASS PÅGÅR
                </div>
                
                <div className="text-6xl font-black text-zinc-800 tracking-tighter font-mono">
                  {elapsedTime}
                </div>
                <div className="text-zinc-500 font-medium">
                  Startade klockan {activeEntry.startTime}
                </div>
                
                <button 
                  onClick={clockOut}
                  className="group relative flex items-center justify-center gap-3 bg-red-500 hover:bg-red-600 text-white w-64 py-4 rounded-2xl text-lg font-semibold transition-all shadow-xl hover:shadow-2xl active:scale-95 mt-4"
                >
                  <Square size={20} className="group-hover:scale-110 transition-transform" fill="currentColor" /> 
                  Stämpla ut
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Historik & Export */}
        <div className="space-y-4">
          <div className="flex justify-between items-end px-1">
            <h2 className="text-xl font-bold text-zinc-800 flex items-center gap-2">
              <FileText size={20} className="text-zinc-400" />
              Tidigare pass
            </h2>
            <button 
              onClick={exportCSV}
              disabled={entries.length === 0}
              className="flex items-center gap-2 text-sm font-semibold bg-white border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 disabled:opacity-50 text-zinc-700 px-4 py-2.5 rounded-xl transition-all shadow-sm"
            >
              <Download size={16} /> Exportera till Chef
            </button>
          </div>

          <div className="space-y-3">
            {entries.length === 0 && (
              <div className="bg-white border border-dashed border-zinc-200 p-10 rounded-3xl text-center text-zinc-500 flex flex-col items-center">
                <CheckCircle2 size={40} className="text-zinc-300 mb-3" />
                <p>Inga pass registrerade ännu.</p>
                <p className="text-sm mt-1 text-zinc-400">När du stämplar ut kommer de dyka upp här.</p>
              </div>
            )}
            
            {entries.map((entry) => (
              <div key={entry.id} className="bg-white border border-zinc-100 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow group relative">
                
                {/* Delete button (shows on hover on desktop) */}
                <button 
                  onClick={() => deleteEntry(entry.id)} 
                  className="absolute top-4 right-4 p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors md:opacity-0 group-hover:opacity-100"
                  title="Radera pass"
                >
                  <Trash2 size={18} />
                </button>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  
                  {/* Datum */}
                  <div className="md:col-span-3">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1 block">Datum</label>
                    <input 
                      type="date" 
                      value={entry.date}
                      onChange={(e) => updateEntry(entry.id, 'date', e.target.value)}
                      className="w-full bg-transparent font-semibold text-zinc-800 border-none p-0 focus:ring-0 cursor-pointer hover:bg-zinc-50 rounded"
                    />
                  </div>
                  
                  {/* Tider */}
                  <div className="md:col-span-4 flex items-center gap-4">
                    <div className="flex-1">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1 block">Start</label>
                      <input 
                        type="time" 
                        value={entry.startTime}
                        onChange={(e) => updateEntry(entry.id, 'startTime', e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                      />
                    </div>
                    <div className="text-zinc-300 font-light mt-5">-</div>
                    <div className="flex-1">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1 block">Slut</label>
                      <input 
                        type="time" 
                        value={entry.endTime || ''}
                        onChange={(e) => updateEntry(entry.id, 'endTime', e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>

                  {/* Anteckningar */}
                  <div className="md:col-span-5 pt-2 md:pt-0">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1 block">Anteckning</label>
                    <input 
                      type="text" 
                      placeholder="T.ex. fasadbesiktning..."
                      value={entry.notes}
                      onChange={(e) => updateEntry(entry.id, 'notes', e.target.value)}
                      className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all placeholder:text-zinc-300"
                    />
                  </div>
                </div>

              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}
