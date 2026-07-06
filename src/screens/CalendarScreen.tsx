import { useState, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, Edit3, Check, HelpCircle, CalendarDays, Crown } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { getWorkplace, updateShift, deleteShift, createShift } from '../lib/db';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Shift } from '../types';
import { STATUS_LABELS } from '../types';
import EditShiftSheet from '../components/EditShiftSheet';
import { useLanguage } from '../hooks/useLanguage';
import ScreenHelpSheet from '../components/ScreenHelpSheet';
import GoogleCalendarSync from '../components/GoogleCalendarSync';

/** Abbreviate workplace names: "Hospital São Paulo" → "H.São Paulo" */
function abbreviateWorkplace(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  const abbr: Record<string, string> = {
    'hospital': 'H.', 'clínica': 'Cl.', 'clinica': 'Cl.', 'centro': 'C.',
    'instituto': 'Inst.', 'fundação': 'Fund.', 'fundacao': 'Fund.',
    'laboratório': 'Lab.', 'laboratorio': 'Lab.', 'unidade': 'Un.',
    'maternidade': 'Mat.', 'policlínica': 'Pol.', 'policlinica': 'Pol.',
    'pronto': 'P.', 'santa': 'Sta.', 'santo': 'Sto.', 'são': 'S.', 'sao': 'S.',
  };
  const firstWord = parts[0].toLowerCase();
  const a = abbr[firstWord];
  if (a) return a + parts.slice(1).join(' ');
  if (parts[0].length > 4) return parts[0][0].toUpperCase() + '.' + parts.slice(1).join(' ');
  return name;
}

interface CalendarScreenProps {
  onAddShift: (date?: string) => void;
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function CalendarScreen({ onAddShift }: CalendarScreenProps) {
  const { user, workplaces, shifts, refreshShifts } = useApp();
  const { t } = useLanguage();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [filterWorkplaces, setFilterWorkplaces] = useState<string[]>([]); // empty = all
  const [sheetShift, setSheetShift] = useState<Shift | null>(null);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [panelMode, setPanelMode] = useState<'day' | 'month'>('day');
  const [showHelp, setShowHelp] = useState(false);
  const [showGoogleSync, setShowGoogleSync] = useState(false);
  const [panelHighlight, setPanelHighlight] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const highlightTimerRef = useRef<number | null>(null);

  function focusPanel() {
    // Smooth scroll to the panel with a brief highlight glow
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setPanelHighlight(true);
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setPanelHighlight(false), 900);
  }

  function handleSelectDay(day: Date) {
    setSelectedDate(day);
    setPanelMode('day');
    // Schedule the scroll on the next tick so the state update has rendered
    requestAnimationFrame(() => focusPanel());
  }

  function goToPrevMonth() {
    setSlideDir('right');
    setCurrentMonth(m => {
      const newMonth = subMonths(m, 1);
      // Carry selected day to new month (clamp to last day)
      if (selectedDate) {
        const dayNum = selectedDate.getDate();
        const lastDay = endOfMonth(newMonth).getDate();
        const clampedDay = Math.min(dayNum, lastDay);
        setSelectedDate(new Date(newMonth.getFullYear(), newMonth.getMonth(), clampedDay));
      }
      return newMonth;
    });
  }
  function goToNextMonth() {
    setSlideDir('left');
    setCurrentMonth(m => {
      const newMonth = addMonths(m, 1);
      // Carry selected day to new month (clamp to last day)
      if (selectedDate) {
        const dayNum = selectedDate.getDate();
        const lastDay = endOfMonth(newMonth).getDate();
        const clampedDay = Math.min(dayNum, lastDay);
        setSelectedDate(new Date(newMonth.getFullYear(), newMonth.getMonth(), clampedDay));
      }
      return newMonth;
    });
  }

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const end = e.changedTouches[0];
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    const dt = Date.now() - start.t;
    // Require: dominant horizontal, min 50px, not too slow
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 600) {
      if (dx < 0) goToNextMonth();
      else goToPrevMonth();
    }
  }

  const allShifts = shifts;

  const filteredShifts = useMemo(() =>
    allShifts.filter(s => filterWorkplaces.length === 0 || filterWorkplaces.includes(s.workplace_id)),
    [allShifts, filterWorkplaces]
  );

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const shiftsForDay = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    return filteredShifts.filter(s => s.date === dateStr && s.status !== 'cancelado');
  };

  const selectedDayShifts = selectedDate ? shiftsForDay(selectedDate) : [];

  const monthShifts = useMemo(() => {
    const prefix = format(currentMonth, 'yyyy-MM');
    return filteredShifts
      .filter(s => s.date.startsWith(prefix) && s.status !== 'cancelado')
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_datetime.localeCompare(b.start_datetime));
  }, [filteredShifts, currentMonth]);

  const monthShiftsByDay = useMemo(() => {
    const map: Record<string, Shift[]> = {};
    monthShifts.forEach(s => {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    });
    return map;
  }, [monthShifts]);

  const today = new Date();

  // Weekday headers (starting Sunday)
  const weekHeaders = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  // Leading empty cells
  const firstDayOfWeek = days[0].getDay();

  function getShiftDots(day: Date) {
    return shiftsForDay(day).slice(0, 3);
  }

  async function handleMarkDone(id: string) {
    updateShift(id, { status: 'realizado' });
    refreshShifts();
    setSheetShift(null);
  }

  async function handleMarkReceived(id: string) {
    const shift = allShifts.find(s => s.id === id);
    if (!shift) return;
    const amt = shift.expected_value;
    updateShift(id, { status: 'recebido', received_value: amt, payment_received_date: new Date().toISOString() });
    refreshShifts();
    setSheetShift(null);
  }

  async function handleDelete(id: string) {
    deleteShift(id);
    refreshShifts();
    setSheetShift(null);
  }

  function renderShiftCard(shift: Shift, compact = false) {
    const wp = getWorkplace(shift.workplace_id);
    if (!wp) return null;
    const startTime = format(parseISO(shift.start_datetime), 'HH:mm');
    const endTime = format(parseISO(shift.end_datetime), 'HH:mm');
    return (
      <div key={shift.id} className="border border-slate-100 rounded-xl p-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="rounded-lg flex items-center justify-center shrink-0" style={{ background: wp.color, width: 28, height: 28, fontSize: 10, color: 'white', fontWeight: 700 }}>
              {wp.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 text-[13px] truncate leading-tight">{wp.name}</p>
              <p className="text-[11px] text-slate-400">{startTime}–{endTime}</p>
            </div>
          </div>
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded status-${shift.status}`}>{t(STATUS_LABELS[shift.status])}</span>
        </div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide">Valor</p>
          <p className="font-bold text-slate-900 text-[13px]">{formatCurrency(shift.expected_value)}</p>
        </div>
        {!compact && (
          <div className="flex gap-1.5">
            <button onClick={() => setSheetShift(shift)}
              className="flex-1 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-[12px] font-medium flex items-center justify-center gap-1">
              <Edit3 size={12} /> {t('Editar')}
            </button>
            {shift.status === 'previsto' && (
              <button onClick={() => handleMarkDone(shift.id)}
                className="flex-1 py-1.5 rounded-lg text-white text-[12px] font-medium flex items-center justify-center gap-1"
                style={{ background: '#03bb85' }}>
                <Check size={12} /> {t('Concluir')}
              </button>
            )}
            {shift.status === 'realizado' && (
              <button onClick={() => handleMarkReceived(shift.id)}
                className="flex-1 py-1.5 rounded-lg text-white text-[12px] font-medium"
                style={{ background: '#22c55e' }}>
                {t('Recebido')}
              </button>
            )}
          </div>
        )}
        {compact && (
          <button onClick={() => setSheetShift(shift)}
            className="w-full py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-medium flex items-center justify-center gap-1 hover:bg-slate-50 transition">
            <Edit3 size={11} /> {t('Detalhes')}
          </button>
        )}
      </div>
    );
  }

  async function handleDuplicate(shift: Shift) {
    // Duplicate to next day
    const nextDate = new Date(parseISO(shift.date));
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = format(nextDate, 'yyyy-MM-dd');
    const startDt = new Date(shift.start_datetime);
    startDt.setDate(startDt.getDate() + 1);
    const endDt = new Date(shift.end_datetime);
    endDt.setDate(endDt.getDate() + 1);
    createShift({
      ...shift,
      date: nextDateStr,
      start_datetime: startDt.toISOString(),
      end_datetime: endDt.toISOString(),
      status: 'previsto',
      received_value: undefined,
      payment_received_date: undefined,
    });
    refreshShifts();
    setSheetShift(null);
  }

  return (
    <div className="page-content min-h-screen bg-white">
      {/* Header */}
      <div className="px-5 pt-7 pb-2 bg-white">
        <div className="flex items-center justify-between mb-2.5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{t('Agenda')}</p>
            <h1 className="text-[20px] font-black text-slate-900 tracking-tight leading-tight">{t('Calendário')}</h1>
            <p className="text-[12px] text-slate-500 mt-0.5">{t('Toque em um dia para ver os plantões.')}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-3">
            <button onClick={() => setShowHelp(true)}
              className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition-all active:scale-95"
              title="Sobre esta tela">
              <HelpCircle size={16} strokeWidth={2.5} />
            </button>
            <button onClick={() => onAddShift(selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined)}
              className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-all active:scale-95"
              title="Novo plantão">
              <Plus size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Filter — multi-select, flex wrap */}
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label={t('Todos')} active={filterWorkplaces.length === 0} onClick={() => setFilterWorkplaces([])} />
          {workplaces.map(wp => (
            <FilterChip
              key={wp.id}
              label={abbreviateWorkplace(wp.name)}
              color={wp.color}
              active={filterWorkplaces.includes(wp.id)}
              onClick={() => setFilterWorkplaces(prev =>
                prev.includes(wp.id) ? prev.filter(id => id !== wp.id) : [...prev, wp.id]
              )}
            />
          ))}
        </div>

        {/* Conectar Google Agendas — em desenvolvimento, exclusivo do plano Max */}
        <button
          onClick={() => setShowGoogleSync(true)}
          className="w-full mt-2.5 flex items-center justify-between gap-2 py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 transition active:scale-[0.99]"
        >
          <span className="flex items-center gap-2 min-w-0">
            <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
              <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/>
              <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/>
              <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"/>
              <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/>
            </svg>
            <span className="flex flex-col text-left min-w-0">
              <span className="text-[12px] font-semibold text-slate-700 leading-tight">Conectar Google Agendas</span>
              <span className="text-[10px] text-slate-400 leading-tight">Em breve — importe seus plantões da agenda</span>
            </span>
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <span className="text-[9px] font-bold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded uppercase tracking-wider">Em breve</span>
            <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded uppercase tracking-wider">
              <Crown size={9} strokeWidth={2.5} /> Max
            </span>
          </span>
        </button>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between px-5 py-2">
        <button onClick={goToPrevMonth}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100">
          <ChevronLeft size={14} />
        </button>
        <h2 className="font-semibold text-gray-900 uppercase text-[13px] tracking-wide">
          {format(currentMonth, 'MMMM yyyy', { locale: ptBR }).toUpperCase()}
        </h2>
        <button onClick={goToNextMonth}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100">
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Calendar grid (swipeable) */}
      <div
        className="px-3 mb-1 select-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'pan-y' }}
      >
        {/* Week headers */}
        <div className="grid grid-cols-7 mb-0.5">
          {weekHeaders.map((h, i) => (
            <div key={i} className="text-center text-[10px] font-bold text-slate-400 py-0.5">{h}</div>
          ))}
        </div>
        {/* Days */}
        <div
          key={format(currentMonth, 'yyyy-MM')}
          className={`grid grid-cols-7 gap-0.5 ${
            slideDir === 'left' ? 'animate-tab-in' : slideDir === 'right' ? 'animate-tab-in-left' : ''
          }`}
        >
          {/* Empty cells for first row */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}
          {days.map(day => {
            const dots = getShiftDots(day);
            const isToday = isSameDay(day, today);
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const hasShifts = dots.length > 0;

            return (
              <button
                key={day.toISOString()}
                onClick={() => handleSelectDay(day)}
                data-selected={isSelected ? 'true' : undefined}
                data-today={isToday && !isSelected ? 'true' : undefined}
                className="calendar-day flex flex-col items-center justify-start pt-1 rounded-lg transition-all"
                style={{ aspectRatio: '1', minHeight: 38 }}
              >
                <span className="calendar-day-num text-[11px] font-semibold leading-none mb-0.5">
                  {format(day, 'd')}
                </span>
                {hasShifts && (
                  <div className="flex gap-0.5">
                    {dots.map(s => {
                      const wp = getWorkplace(s.workplace_id);
                      return (
                        <span key={s.id} className="w-1 h-1 rounded-full"
                          style={{ background: isSelected ? 'rgba(255,255,255,0.85)' : (wp?.color || '#03bb85') }} />
                      );
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel: shifts for selected day OR all month */}
      <div
        ref={panelRef}
        className={`mx-5 bg-white rounded-2xl border p-3 shadow-sm transition-all duration-500 ${
          panelHighlight
            ? 'border-blue-300 shadow-[0_0_0_3px_rgba(59,130,246,0.15),0_8px_24px_rgba(59,130,246,0.18)] scale-[1.01]'
            : 'border-slate-100'
        }`}
      >
        {/* Mode Toggle */}
        <div className="flex bg-slate-100 p-0.5 rounded-lg mb-3">
          <button
            onClick={() => setPanelMode('day')}
            className={`flex-1 py-1.5 rounded-[6px] text-[12px] font-semibold transition-all flex items-center justify-center gap-1.5 ${
              panelMode === 'day' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t('Dia')}
            {selectedDate && selectedDayShifts.length > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                panelMode === 'day' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'
              }`}>{selectedDayShifts.length}</span>
            )}
          </button>
          <button
            onClick={() => setPanelMode('month')}
            className={`flex-1 py-1.5 rounded-[6px] text-[12px] font-semibold transition-all flex items-center justify-center gap-1.5 ${
              panelMode === 'month' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t('Mês')}
            {monthShifts.length > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                panelMode === 'month' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'
              }`}>{monthShifts.length}</span>
            )}
          </button>
        </div>

        {panelMode === 'day' && selectedDate && (
          <>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-bold text-slate-900 text-[14px] leading-tight">
                  {format(selectedDate, "d 'de' MMMM", { locale: ptBR })}
                </h3>
                <p className="text-[11px] text-slate-400 capitalize">
                  {format(selectedDate, 'EEEE', { locale: ptBR })}
                </p>
              </div>
              <button onClick={() => onAddShift(format(selectedDate, 'yyyy-MM-dd'))}
                className="flex items-center gap-1 text-blue-600 text-[12px] font-semibold px-2.5 py-1 rounded-lg bg-blue-50">
                <Plus size={12} /> {t('Plantão')}
              </button>
            </div>

            {selectedDayShifts.length === 0 ? (
              <div className="text-center py-3">
                <p className="text-slate-400 text-[12px]">{t('Nenhum plantão neste dia')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedDayShifts.map(shift => renderShiftCard(shift))}
              </div>
            )}
          </>
        )}

        {panelMode === 'month' && (
          <>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-bold text-slate-900 text-[14px] leading-tight capitalize">
                  {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {monthShifts.length} {monthShifts.length !== 1 ? 'plantões' : 'plantão'} {monthShifts.length > 0 && `· ${formatCurrency(monthShifts.reduce((s, x) => s + x.expected_value, 0))}`}
                </p>
              </div>
              <button onClick={() => onAddShift(selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(currentMonth, 'yyyy-MM-dd'))}
                className="flex items-center gap-1 text-blue-600 text-[12px] font-semibold px-2.5 py-1 rounded-lg bg-blue-50">
                <Plus size={12} /> {t('Plantão')}
              </button>
            </div>

            {monthShifts.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-slate-400 text-[12px]">{t('Nenhum plantão neste mês')}</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto hide-scrollbar -mx-1 px-1">
                {Object.entries(monthShiftsByDay).map(([dateStr, dayShifts]) => {
                  const day = parseISO(dateStr);
                  const isTodayGroup = isSameDay(day, today);
                  return (
                    <div key={dateStr}>
                      <button
                        onClick={() => { setSelectedDate(day); setPanelMode('day'); }}
                        className="w-full flex items-center justify-between gap-2 mb-1.5 group active:scale-[0.99] transition"
                      >
                        <div className="flex items-baseline gap-1.5 min-w-0">
                          <span className={`text-[12px] font-bold tabular-nums ${isTodayGroup ? 'text-blue-600' : 'text-slate-700'}`}>
                            {format(day, "dd 'de' MMM", { locale: ptBR })}
                          </span>
                          <span className="text-[10px] text-slate-400 capitalize truncate">
                            · {format(day, 'EEE', { locale: ptBR })}
                          </span>
                          {isTodayGroup && (
                            <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-wider leading-none">hoje</span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium shrink-0 group-hover:text-blue-600 transition">
                          {dayShifts.length} {dayShifts.length !== 1 ? 'plantões' : 'plantão'}
                        </span>
                      </button>
                      <div className="space-y-1.5">
                        {dayShifts.map(shift => renderShiftCard(shift, true))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Shift edit sheet */}
      {sheetShift && (
        <EditShiftSheet
          key={sheetShift.id}
          shift={sheetShift}
          onClose={() => setSheetShift(null)}
          onSaved={() => { refreshShifts(); setSheetShift(null); }}
          onDelete={() => handleDelete(sheetShift.id)}
          onDuplicate={() => handleDuplicate(sheetShift)}
        />
      )}

      {/* DRILLDOWN: SOBRE A TELA CALENDÁRIO */}
      <ScreenHelpSheet
        open={showHelp}
        onClose={() => setShowHelp(false)}
        icon={<CalendarDays size={20} className="text-blue-600" />}
        pretitle="Calendário"
        title="O que tem aqui"
        items={[
          { title: 'Visão Dia e Mês', desc: 'Alterne entre ver os plantões de um dia ou de todo o mês.' },
          { title: 'Navegação rápida', desc: 'Deslize para os lados ou use as setas para trocar de mês.' },
          { title: 'Filtro por local', desc: 'Toque nos chips para ver só os plantões de locais específicos.' },
          { title: 'Editar plantão', desc: 'Toque em um plantão para ajustar data, valor, status e mais.' },
        ]}
        proPitch="No Pro você cria escalas recorrentes (12x36, 24x72), cadastra locais ilimitados e nunca mais lança plantão a plantão."
        proFeature="recurrence"
      />

      {/* Integração Google Agendas */}
      {showGoogleSync && (
        <GoogleCalendarSync
          onClose={() => setShowGoogleSync(false)}
          onImported={() => refreshShifts()}
        />
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex-shrink-0"
      style={{
        background: active ? (color || '#03bb85') : '#f3f4f6',
        color: active ? 'white' : '#6b7280',
      }}>
      {color && !active && <span className="w-2 h-2 rounded-full" style={{ background: color }} />}
      {label}
    </button>
  );
}
