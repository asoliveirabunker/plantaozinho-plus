import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, Edit3, Copy, Check, Trash2, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { getWorkplace, updateShift, deleteShift, createShift } from '../lib/db';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Shift } from '../types';
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
    if (!confirm('Excluir este plantão?')) return;
    deleteShift(id);
    refreshShifts();
    setSheetShift(null);
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
      <div className="px-5 pt-7 pb-1">
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <h1 className="text-[20px] font-black text-slate-900 tracking-tight leading-tight">Calendário</h1>
            <p className="text-[12px] text-slate-500">Toque em um dia para ver os plantões.</p>
          </div>
          <button onClick={() => onAddShift(selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined)}
            className="w-9 h-9 rounded-full flex items-center justify-center shadow-sm"
            style={{ background: '#1877F2', color: 'white' }}>
            <Plus size={18} />
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
        <button onClick={() => setCurrentMonth(m => subMonths(m, 1))}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100">
          <ChevronLeft size={14} />
        </button>
        <h2 className="font-semibold text-gray-900 uppercase text-[13px] tracking-wide">
          {format(currentMonth, 'MMMM yyyy', { locale: ptBR }).toUpperCase()}
        </h2>
        <button onClick={() => setCurrentMonth(m => addMonths(m, 1))}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100">
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="px-3 mb-1">
        {/* Week headers */}
        <div className="grid grid-cols-7 mb-0.5">
          {weekHeaders.map((h, i) => (
            <div key={i} className="text-center text-[10px] font-bold text-slate-400 py-0.5">{h}</div>
          ))}
        </div>
        {/* Days */}
        <div className="grid grid-cols-7 gap-0.5">
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

      {/* Selected day panel */}
      {selectedDate && (
        <div className="mx-5 bg-white rounded-2xl border border-slate-100 p-3 shadow-sm">
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
              {selectedDayShifts.map(shift => {
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Shift action sheet */}
      {sheetShift && (
        <ShiftActionSheet
          shift={sheetShift}
          onClose={() => setSheetShift(null)}
          onMarkDone={() => handleMarkDone(sheetShift.id)}
          onMarkReceived={() => handleMarkReceived(sheetShift.id)}
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

function ShiftActionSheet({ shift, onClose, onMarkDone, onMarkReceived, onDelete, onDuplicate }: {
  shift: Shift; onClose: () => void;
  onMarkDone: () => void; onMarkReceived: () => void;
  onDelete: () => void; onDuplicate: () => void;
}) {
  const wp = getWorkplace(shift.workplace_id);
  return (
    <div className="bottom-sheet-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {wp && <div className="hospital-avatar" style={{ background: wp.color }}>{wp.name.slice(0,2).toUpperCase()}</div>}
            <div>
              <p className="font-semibold text-gray-900">{wp?.name}</p>
              <p className="text-gray-500 text-xs">{format(parseISO(shift.start_datetime), 'HH:mm')} – {format(parseISO(shift.end_datetime), 'HH:mm')}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-2">
          {shift.status === 'previsto' && (
            <button onClick={onMarkDone} className="w-full py-3.5 rounded-xl text-white font-semibold" style={{ background: '#1877F2' }}>
              ✓ Marcar como realizado
            </button>
          )}
          {(shift.status === 'realizado' || shift.status === 'faturado') && (
            <button onClick={onMarkReceived} className="w-full py-3.5 rounded-xl text-white font-semibold" style={{ background: '#22c55e' }}>
              💰 Marcar como recebido
            </button>
          )}
          <button onClick={onDuplicate} className="w-full py-3.5 rounded-xl bg-gray-50 text-gray-800 font-semibold flex items-center justify-center gap-2">
            <Copy size={16} /> Duplicar plantão
          </button>
          <button onClick={onDelete} className="w-full py-3.5 rounded-xl bg-red-50 text-red-600 font-semibold flex items-center justify-center gap-2">
            <Trash2 size={16} /> Excluir plantão
          </button>
        </div>
      </div>
    </div>
  );
}
