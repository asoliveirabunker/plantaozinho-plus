import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Edit3, Copy, Check, Trash2, X, Clock, DollarSign, CalendarDays, FileText, AlertCircle } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { getWorkplace, updateShift, deleteShift, createShift } from '../lib/db';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Shift, ShiftStatus } from '../types';
import { STATUS_LABELS } from '../types';

interface CalendarScreenProps {
  onAddShift: (date?: string) => void;
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function CalendarScreen({ onAddShift }: CalendarScreenProps) {
  const { user, workplaces, shifts, refreshShifts } = useApp();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [filterWorkplace, setFilterWorkplace] = useState<string>('all');
  const [sheetShift, setSheetShift] = useState<Shift | null>(null);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [panelMode, setPanelMode] = useState<'day' | 'month'>('day');
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

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
    allShifts.filter(s => filterWorkplace === 'all' || s.workplace_id === filterWorkplace),
    [allShifts, filterWorkplace]
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
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded status-${shift.status}`}>{STATUS_LABELS[shift.status]}</span>
        </div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide">Valor</p>
          <p className="font-bold text-slate-900 text-[13px]">{formatCurrency(shift.expected_value)}</p>
        </div>
        {!compact && (
          <div className="flex gap-1.5">
            <button onClick={() => setSheetShift(shift)}
              className="flex-1 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-[12px] font-medium flex items-center justify-center gap-1">
              <Edit3 size={12} /> Editar
            </button>
            {shift.status === 'previsto' && (
              <button onClick={() => handleMarkDone(shift.id)}
                className="flex-1 py-1.5 rounded-lg text-white text-[12px] font-medium flex items-center justify-center gap-1"
                style={{ background: '#1877F2' }}>
                <Check size={12} /> Concluir
              </button>
            )}
            {shift.status === 'realizado' && (
              <button onClick={() => handleMarkReceived(shift.id)}
                className="flex-1 py-1.5 rounded-lg text-white text-[12px] font-medium"
                style={{ background: '#22c55e' }}>
                Recebido
              </button>
            )}
          </div>
        )}
        {compact && (
          <button onClick={() => setSheetShift(shift)}
            className="w-full py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-medium flex items-center justify-center gap-1 hover:bg-slate-50 transition">
            <Edit3 size={11} /> Detalhes
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
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Agenda</p>
            <h1 className="text-[20px] font-black text-slate-900 tracking-tight leading-tight">Calendário</h1>
            <p className="text-[12px] text-slate-500 mt-0.5">Toque em um dia para ver os plantões.</p>
          </div>
          <button onClick={() => onAddShift(selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined)}
            className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-all active:scale-95 shrink-0 ml-3"
            title="Novo plantão">
            <Plus size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Filter */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
          <FilterChip label="Todos" active={filterWorkplace === 'all'} onClick={() => setFilterWorkplace('all')} />
          {workplaces.map(wp => (
            <FilterChip key={wp.id} label={wp.name.split(' ')[0]} color={wp.color}
              active={filterWorkplace === wp.id} onClick={() => setFilterWorkplace(wp.id)} />
          ))}
        </div>
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
                onClick={() => setSelectedDate(day)}
                className="flex flex-col items-center justify-start pt-1 rounded-lg transition-all"
                style={{
                  background: isSelected ? '#1877F2' : isToday ? '#eff6ff' : 'white',
                  border: isSelected ? 'none' : isToday ? '1.5px solid #1877F2' : '1px solid #f3f4f6',
                  aspectRatio: '1',
                  minHeight: 38,
                }}
              >
                <span className="text-[11px] font-semibold leading-none mb-0.5"
                  style={{ color: isSelected ? 'white' : isToday ? '#1877F2' : '#374151' }}>
                  {format(day, 'd')}
                </span>
                {hasShifts && (
                  <div className="flex gap-0.5">
                    {dots.map(s => {
                      const wp = getWorkplace(s.workplace_id);
                      return (
                        <span key={s.id} className="w-1 h-1 rounded-full"
                          style={{ background: isSelected ? 'rgba(255,255,255,0.8)' : (wp?.color || '#1877F2') }} />
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
      <div className="mx-5 bg-white rounded-2xl border border-slate-100 p-3 shadow-sm">
        {/* Mode Toggle */}
        <div className="flex bg-slate-100 p-0.5 rounded-lg mb-3">
          <button
            onClick={() => setPanelMode('day')}
            className={`flex-1 py-1.5 rounded-[6px] text-[12px] font-semibold transition-all flex items-center justify-center gap-1.5 ${
              panelMode === 'day' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Dia
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
            Mês
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
                <Plus size={12} /> Plantão
              </button>
            </div>

            {selectedDayShifts.length === 0 ? (
              <div className="text-center py-3">
                <p className="text-slate-400 text-[12px]">Nenhum plantão neste dia</p>
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
                <Plus size={12} /> Plantão
              </button>
            </div>

            {monthShifts.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-slate-400 text-[12px]">Nenhum plantão neste mês</p>
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
    </div>
  );
}

function FilterChip({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex-shrink-0"
      style={{
        background: active ? (color || '#1877F2') : '#f3f4f6',
        color: active ? 'white' : '#6b7280',
      }}>
      {color && !active && <span className="w-2 h-2 rounded-full" style={{ background: color }} />}
      {label}
    </button>
  );
}

const STATUS_ORDER: ShiftStatus[] = ['previsto', 'realizado', 'recebido', 'atrasado', 'cancelado'];

function statusChipStyle(status: ShiftStatus, active: boolean) {
  const map: Record<ShiftStatus, { bg: string; text: string; activeBg: string }> = {
    previsto:   { bg: 'bg-slate-100',  text: 'text-slate-600',  activeBg: 'bg-slate-700' },
    realizado:  { bg: 'bg-blue-50',    text: 'text-blue-600',   activeBg: 'bg-blue-600' },
    recebido:   { bg: 'bg-emerald-50', text: 'text-emerald-700',activeBg: 'bg-emerald-600' },
    atrasado:   { bg: 'bg-red-50',     text: 'text-red-600',    activeBg: 'bg-red-600' },
    cancelado:  { bg: 'bg-slate-100',  text: 'text-slate-500',  activeBg: 'bg-slate-500' },
  };
  const m = map[status];
  return active
    ? `${m.activeBg} text-white shadow-sm`
    : `${m.bg} ${m.text} hover:opacity-80`;
}

function isoToInputDate(iso?: string) {
  if (!iso) return '';
  return iso.length >= 10 ? iso.slice(0, 10) : '';
}
function isoToInputTime(iso?: string) {
  if (!iso) return '';
  try { return format(parseISO(iso), 'HH:mm'); } catch { return ''; }
}

function EditShiftSheet({ shift, onClose, onSaved, onDelete, onDuplicate }: {
  shift: Shift;
  onClose: () => void;
  onSaved: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const wp = getWorkplace(shift.workplace_id);

  const [status, setStatus] = useState<ShiftStatus>(shift.status);
  const [date, setDate] = useState(shift.date);
  const [startTime, setStartTime] = useState(isoToInputTime(shift.start_datetime));
  const [endTime, setEndTime] = useState(isoToInputTime(shift.end_datetime));
  const [expectedValue, setExpectedValue] = useState(String(shift.expected_value ?? ''));
  const [receivedValue, setReceivedValue] = useState(shift.received_value != null ? String(shift.received_value) : '');
  const [paymentDue, setPaymentDue] = useState(shift.payment_due_date || '');
  const [paymentReceived, setPaymentReceived] = useState(isoToInputDate(shift.payment_received_date));
  const [notes, setNotes] = useState(shift.notes || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const isReceivedFlow = status === 'recebido' || status === 'divergente';

  // Auto-set received_value when switching to received and empty
  useEffect(() => {
    if (status === 'recebido' && receivedValue === '') {
      setReceivedValue(String(shift.expected_value ?? ''));
    }
    if (status === 'recebido' && !paymentReceived) {
      setPaymentReceived(format(new Date(), 'yyyy-MM-dd'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function buildIsoDatetime(dateStr: string, timeStr: string) {
    const [h, m] = timeStr.split(':').map(Number);
    const [y, mo, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, (mo || 1) - 1, d || 1, h || 0, m || 0);
    return dt.toISOString();
  }

  function handleSave() {
    setError('');
    const expected = parseFloat(expectedValue.replace(',', '.'));
    if (!date) { setError('Informe a data do plantão.'); return; }
    if (!startTime || !endTime) { setError('Informe os horários de início e fim.'); return; }
    if (isNaN(expected) || expected < 0) { setError('Valor previsto inválido.'); return; }

    const startIso = buildIsoDatetime(date, startTime);
    let endIso = buildIsoDatetime(date, endTime);
    // If end <= start, push end to next day (overnight shift)
    if (new Date(endIso) <= new Date(startIso)) {
      const endDt = new Date(endIso);
      endDt.setDate(endDt.getDate() + 1);
      endIso = endDt.toISOString();
    }
    const durationHours = (new Date(endIso).getTime() - new Date(startIso).getTime()) / (1000 * 60 * 60);

    const receivedNum = receivedValue.trim() ? parseFloat(receivedValue.replace(',', '.')) : undefined;

    updateShift(shift.id, {
      date,
      start_datetime: startIso,
      end_datetime: endIso,
      duration_hours: durationHours,
      expected_value: expected,
      received_value: receivedNum,
      payment_due_date: paymentDue || undefined,
      payment_received_date: paymentReceived ? new Date(paymentReceived + 'T12:00:00').toISOString() : undefined,
      status,
      notes: notes.trim() || undefined,
    });
    onSaved();
  }

  return (
    <div className="bottom-sheet-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {wp && (
              <div className="hospital-avatar shrink-0" style={{ background: wp.color }}>
                {wp.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Editar plantão</p>
              <h3 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight truncate">{wp?.name || 'Plantão'}</h3>
              <p className="text-[12px] text-slate-500 mt-0.5 capitalize">{format(parseISO(shift.date), "EEEE, dd 'de' MMM", { locale: ptBR })}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all active:scale-95 shrink-0 ml-3">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Status */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Status</label>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_ORDER.map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide transition-all active:scale-95 ${statusChipStyle(s, status === s)}`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Data e horário */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <CalendarDays size={11} strokeWidth={2.5} /> Data e horário
            </label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="date" value={date} onChange={e => setDate(e.target.value)}
                className="col-span-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
              />
              <div className="col-span-1">
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5 flex items-center gap-1"><Clock size={10} strokeWidth={2.5} /> Início</p>
                <input
                  type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
                />
              </div>
              <span className="self-end pb-3 text-center text-slate-400 text-[12px]">até</span>
              <div className="col-span-1">
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5 flex items-center gap-1"><Clock size={10} strokeWidth={2.5} /> Fim</p>
                <input
                  type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
                />
              </div>
            </div>
          </div>

          {/* Valores */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <DollarSign size={11} strokeWidth={2.5} /> Valores
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Previsto (R$)</p>
                <input
                  type="number" inputMode="decimal" step="0.01" value={expectedValue}
                  onChange={e => setExpectedValue(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
                />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Recebido (R$)</p>
                <input
                  type="number" inputMode="decimal" step="0.01" value={receivedValue}
                  onChange={e => setReceivedValue(e.target.value)}
                  placeholder={isReceivedFlow ? '0,00' : 'Opcional'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
                />
              </div>
            </div>
            {receivedValue && expectedValue && Math.abs(parseFloat(receivedValue) - parseFloat(expectedValue)) > 0.01 && (
              <div className="flex items-start gap-1.5 mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                <span>Diferença de <strong>{formatCurrency(Math.abs(parseFloat(receivedValue) - parseFloat(expectedValue)))}</strong> entre o valor previsto e o recebido.</span>
              </div>
            )}
          </div>

          {/* Datas de pagamento */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <CalendarDays size={11} strokeWidth={2.5} /> Pagamento
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Previsto para</p>
                <input
                  type="date" value={paymentDue} onChange={e => setPaymentDue(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
                />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Pago em</p>
                <input
                  type="date" value={paymentReceived} onChange={e => setPaymentReceived(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
                />
              </div>
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <FileText size={11} strokeWidth={2.5} /> Observações
            </label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Anotações sobre o plantão (escala, contatos, divergências...)"
              rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition resize-none"
            />
          </div>

          {error && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <button onClick={onDuplicate}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[12.5px] font-semibold hover:bg-slate-200 transition active:scale-[0.98]">
              <Copy size={13} strokeWidth={2.5} /> Duplicar
            </button>
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-red-50 text-red-600 text-[12.5px] font-semibold hover:bg-red-100 transition active:scale-[0.98]">
              <Trash2 size={13} strokeWidth={2.5} /> Excluir
            </button>
            <button onClick={handleSave}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-[13px] font-bold hover:bg-blue-700 transition active:scale-[0.98] shadow-sm shadow-blue-600/20 flex items-center justify-center gap-1.5">
              <Check size={14} strokeWidth={3} /> Salvar alterações
            </button>
          </div>
        </div>

        {/* Confirm delete overlay */}
        {confirmDelete && (
          <div className="fixed inset-0 z-[400] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setConfirmDelete(false)}>
            <div className="bg-white w-full max-w-xs rounded-2xl p-5 shadow-xl animate-fade-in" onClick={e => e.stopPropagation()}>
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <h4 className="text-center font-bold text-slate-900 text-[15px] mb-1">Excluir plantão?</h4>
              <p className="text-center text-slate-500 text-[12px] mb-4">Essa ação não pode ser desfeita.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold hover:bg-slate-200 transition active:scale-[0.98]">
                  Cancelar
                </button>
                <button onClick={() => { setConfirmDelete(false); onDelete(); }}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-[13px] font-bold hover:bg-red-700 transition active:scale-[0.98]">
                  Excluir
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
