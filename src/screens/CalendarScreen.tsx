import { useState, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, HelpCircle, CalendarDays, Calendar } from 'lucide-react';
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

/** Abrevia o nome do local como no design: "Hospital São Marcos" → "H. São Marcos" */
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
  const rest = parts.slice(1).join(' ');
  const firstWord = parts[0].toLowerCase();
  const a = abbr[firstWord];
  if (a) return `${a} ${rest}`;
  if (parts[0].length > 4) return `${parts[0][0].toUpperCase()}. ${rest}`;
  return name;
}

interface CalendarScreenProps {
  onAddShift: (date?: string) => void;
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function capitalizeFirst(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** "12 h", "12,5 h" */
function formatHours(h: number) {
  const n = Number.isInteger(h) ? String(h) : h.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${n} h`;
}

export default function CalendarScreen({ onAddShift }: CalendarScreenProps) {
  const { workplaces, shifts, refreshShifts } = useApp();
  const { t } = useLanguage();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [filterWorkplaces, setFilterWorkplaces] = useState<string[]>([]); // empty = all
  const [sheetShift, setSheetShift] = useState<Shift | null>(null);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [panelMode, setPanelMode] = useState<'day' | 'month'>('day');
  const [showHelp, setShowHelp] = useState(false);
  const [showGoogleSync, setShowGoogleSync] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  function focusPanel() {
    // Rola suavemente até o painel do dia
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  const selectedDayTotal = selectedDayShifts.reduce((sum, s) => sum + s.expected_value, 0);

  const monthShifts = useMemo(() => {
    const prefix = format(currentMonth, 'yyyy-MM');
    return filteredShifts
      .filter(s => s.date.startsWith(prefix) && s.status !== 'cancelado')
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_datetime.localeCompare(b.start_datetime));
  }, [filteredShifts, currentMonth]);

  const monthTotal = monthShifts.reduce((sum, s) => sum + s.expected_value, 0);

  const monthShiftsByDay = useMemo(() => {
    const map: Record<string, Shift[]> = {};
    monthShifts.forEach(s => {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    });
    return map;
  }, [monthShifts]);

  const today = new Date();
  const monthName = capitalizeFirst(format(currentMonth, 'MMMM', { locale: ptBR }));

  // Weekday headers (starting Sunday)
  const weekHeaders = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  // Leading empty cells
  const firstDayOfWeek = days[0].getDay();

  function getShiftDots(day: Date) {
    return shiftsForDay(day).slice(0, 3);
  }

  /** "Dois plantões", "Três plantões", "4 plantões" — rótulo da linha de dia na visão Mês */
  function manyShiftsLabel(n: number) {
    if (n === 2) return t('Dois plantões');
    if (n === 3) return t('Três plantões');
    return `${n} ${t('plantões')}`;
  }

  /** "19:00 — 07:00 · noturno 12 h" / "07:00 — 07:00 · 24 h" */
  function shiftTimeLine(shift: Shift) {
    const start = parseISO(shift.start_datetime);
    const end = parseISO(shift.end_datetime);
    const range = `${format(start, 'HH:mm')} — ${format(end, 'HH:mm')}`;
    const hours = shift.duration_hours;
    if (!hours || hours <= 0) return range;
    if (hours >= 24) return `${range} · ${formatHours(hours)}`;
    const h = start.getHours();
    const period = h >= 6 && h < 18 ? t('diurno') : t('noturno');
    return `${range} · ${period} ${formatHours(hours)}`;
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

  /** Linha de plantão: régua de 2px na cor do local, nome, horário, valor e dois botões de 44px. */
  function renderShiftRow(shift: Shift) {
    const wp = getWorkplace(shift.workplace_id);
    if (!wp) return null;
    return (
      <div key={shift.id} className="mt-[22px] pb-[22px] border-b border-slate-200 last:border-b-0 last:pb-0">
        <div className="flex items-start justify-between gap-4">
          <div className="place-rule min-w-0" style={{ borderLeftColor: wp.color }}>
            <p className="text-[15.5px] font-medium tracking-[-0.015em] text-slate-900 truncate">{wp.name}</p>
            <p className="mt-[5px] text-[13px] text-slate-500 tabular-nums truncate">{shiftTimeLine(shift)}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[17px] text-slate-900 tabular-nums whitespace-nowrap">{formatCurrency(shift.expected_value)}</p>
            <span
              className={`status-badge status-${shift.status} mt-1.5 ${
                shift.status === 'previsto' ? 'bg-[#E9F2EF] text-[#0E6B55]' : ''
              }`}
            >
              {t(STATUS_LABELS[shift.status])}
            </span>
          </div>
        </div>

        <div className="flex gap-[10px] mt-4 pl-4">
          <button onClick={() => setSheetShift(shift)}
            className="btn-secondary flex-1 h-11 px-0">
            {t('Editar')}
          </button>
          {shift.status === 'previsto' && (
            <button onClick={() => handleMarkDone(shift.id)}
              className="btn-primary flex-1 h-11 px-0 text-[13.5px] font-medium tracking-normal">
              {t('Concluir')}
            </button>
          )}
          {shift.status === 'realizado' && (
            <button onClick={() => handleMarkReceived(shift.id)}
              className="btn-primary flex-1 h-11 px-0 text-[13.5px] font-medium tracking-normal">
              {t('Recebido')}
            </button>
          )}
        </div>
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

  /** Botão "+ Plantão" do painel — borda de filete, raio 12, texto jade. */
  function addShiftButton(date: string) {
    return (
      <button onClick={() => onAddShift(date)}
        title={t('Novo plantão')}
        className="shrink-0 inline-flex items-center gap-[7px] px-[14px] py-[9px] rounded-[12px] border border-slate-200 bg-white text-[12.5px] font-medium text-blue-600 hover:border-blue-600 transition-colors">
        <Plus size={14} strokeWidth={1.8} /> {t('Plantão')}
      </button>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Cabeçalho — sobre o papel: "Agenda", mês/ano e setas quadradas */}
      <header className="px-6 pt-[56px] pb-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[12.5px] text-slate-500">{t('Agenda')}</p>
          <button onClick={() => setShowHelp(true)}
            className="-my-2 -mr-2 w-[34px] h-[34px] rounded-full flex items-center justify-center text-slate-500 hover:text-blue-600 transition-colors"
            title="Sobre esta tela"
            aria-label={t('Sobre esta tela')}>
            <HelpCircle size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex items-end justify-between gap-4 mt-2">
          <h1 className="text-[28px] font-light tracking-[-0.035em] leading-none text-slate-900 min-w-0">
            {monthName}
            <span className="font-extralight text-slate-500 tabular-nums"> {format(currentMonth, 'yyyy')}</span>
          </h1>
          <div className="flex gap-2 shrink-0">
            <button onClick={goToPrevMonth}
              className="w-[34px] h-[34px] rounded-[12px] border border-slate-200 bg-white text-slate-600 flex items-center justify-center hover:border-blue-600 hover:text-blue-600 transition-colors"
              aria-label={t('Mês anterior')}>
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
            <button onClick={goToNextMonth}
              className="w-[34px] h-[34px] rounded-[12px] border border-slate-200 bg-white text-slate-600 flex items-center justify-center hover:border-blue-600 hover:text-blue-600 transition-colors"
              aria-label={t('Próximo mês')}>
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Filtro por local — chips de escolha múltipla */}
        <div className="flex flex-wrap gap-2 mt-[22px]">
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
      </header>

      {/* Grade do mês (deslizável) — zero caixas */}
      <div
        className="px-[18px] pt-2 pb-[22px] select-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'pan-y' }}
      >
        {/* Dias da semana */}
        <div className="grid grid-cols-7">
          {weekHeaders.map((h, i) => (
            <span key={i} className="text-center text-[11px] text-slate-500 pb-[10px]">{h}</span>
          ))}
        </div>
        <div
          key={format(currentMonth, 'yyyy-MM')}
          className={`grid grid-cols-7 ${
            slideDir === 'left' ? 'animate-tab-in' : slideDir === 'right' ? 'animate-tab-in-left' : ''
          }`}
        >
          {/* Células vazias antes do dia 1 */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <span key={`empty-${i}`} className="h-[46px]" />
          ))}
          {days.map(day => {
            const dots = getShiftDots(day);
            const isToday = isSameDay(day, today);
            const isSelected = !!selectedDate && isSameDay(day, selectedDate);
            // Selecionado = só o disco de mármore (sem ponto), como no design
            const showDots = dots.length > 0 && !isSelected;

            return (
              <button
                key={day.toISOString()}
                onClick={() => handleSelectDay(day)}
                data-selected={isSelected ? 'true' : undefined}
                data-today={isToday && !isSelected ? 'true' : undefined}
                aria-label={format(day, "d 'de' MMMM", { locale: ptBR })}
                aria-pressed={isSelected}
                className="calendar-day"
              >
                {/* Número solto; hoje = sublinhado jade, selecionado = disco de mármore (CSS) */}
                <span className="calendar-day-num">
                  {format(day, 'd')}
                </span>
                {/* Ponto de 4px na cor do local */}
                {showDots && (
                  <span className="flex gap-0.5">
                    {dots.map(s => {
                      const wp = getWorkplace(s.workplace_id);
                      return (
                        <span key={s.id} className="w-1 h-1 rounded-full"
                          style={{ background: wp?.color || 'var(--color-primary)' }} />
                      );
                    })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Folha branca: raio 28 no topo, sem caixa em volta do painel */}
      <div className="flex-1 bg-white rounded-t-[28px] px-6 pt-[26px] pb-[118px] min-h-[420px]">
        <div ref={panelRef}>
          {/* Dia / Mês — abas com filete */}
          <div className="tab-rule" role="tablist">
            <button role="tab" aria-selected={panelMode === 'day'} onClick={() => setPanelMode('day')}>
              {t('Dia')}
              {selectedDate && selectedDayShifts.length > 0 && (
                <> <span className="font-normal text-slate-500 tabular-nums">{selectedDayShifts.length}</span></>
              )}
            </button>
            <button role="tab" aria-selected={panelMode === 'month'} onClick={() => setPanelMode('month')}>
              {t('Mês')}
              {monthShifts.length > 0 && (
                <> <span className="font-normal text-slate-500 tabular-nums">{monthShifts.length}</span></>
              )}
            </button>
          </div>

          {panelMode === 'day' && selectedDate && (
            <div>
              <div className="flex items-end justify-between gap-4 mt-6">
                <div className="min-w-0">
                  <h3 className="text-[20px] font-light tracking-[-0.03em] leading-[1.1] text-slate-900">
                    {format(selectedDate, "d 'de' MMMM", { locale: ptBR })}
                  </h3>
                  <p className="mt-1.5 text-[12.5px] text-slate-500 tabular-nums">
                    {capitalizeFirst(format(selectedDate, 'EEEE', { locale: ptBR }))}
                    {selectedDayShifts.length > 0 && ` · ${formatCurrency(selectedDayTotal)} ${t('no dia')}`}
                  </p>
                </div>
                {addShiftButton(format(selectedDate, 'yyyy-MM-dd'))}
              </div>

              {selectedDayShifts.length === 0 ? (
                <p className="mt-[22px] py-6 text-center text-[13px] text-slate-500">{t('Nenhum plantão neste dia')}</p>
              ) : (
                <div>
                  {selectedDayShifts.map(shift => renderShiftRow(shift))}
                </div>
              )}

              {/* Google Agendas — fora do cabeçalho; no fim do painel do dia, em uma linha */}
              <button
                onClick={() => setShowGoogleSync(true)}
                className="w-full mt-[22px] pt-[14px] min-h-[44px] border-t border-slate-200 flex items-center gap-3 text-left group"
              >
                <Calendar size={20} strokeWidth={1.5} className="shrink-0 text-blue-600" />
                <span className="flex-1 min-w-0 truncate text-[14px] text-slate-900">
                  {t('Google Agendas')} <span className="text-[12.5px] text-slate-500">· {t('em breve no Max')}</span>
                </span>
                <ChevronRight size={18} strokeWidth={1.5} className="shrink-0 text-slate-500 group-hover:text-blue-600 transition-colors" />
              </button>
            </div>
          )}

          {panelMode === 'month' && (
            <div>
              <div className="flex items-end justify-between gap-4 mt-6">
                <div className="min-w-0">
                  <h3 className="text-[20px] font-light tracking-[-0.03em] leading-[1.1] text-slate-900">
                    {monthName} {t('inteiro')}
                  </h3>
                  <p className="mt-1.5 text-[12.5px] text-slate-500 tabular-nums">
                    {monthShifts.length} {monthShifts.length !== 1 ? t('plantões') : t('plantão')}
                    {monthShifts.length > 0 && ` · ${formatCurrency(monthTotal)} ${t('previstos')}`}
                  </p>
                </div>
                {/* Como no design, o mês cheio não leva botão; só o mês vazio oferece o atalho */}
                {monthShifts.length === 0 &&
                  addShiftButton(selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(currentMonth, 'yyyy-MM-dd'))}
              </div>

              {monthShifts.length === 0 ? (
                <p className="mt-5 py-6 text-center text-[13px] text-slate-500">{t('Nenhum plantão neste mês')}</p>
              ) : (
                <div className="mt-5">
                  {Object.entries(monthShiftsByDay).map(([dateStr, dayShifts]) => {
                    const day = parseISO(dateStr);
                    const isSel = !!selectedDate && isSameDay(day, selectedDate);
                    const single = dayShifts.length === 1 ? dayShifts[0] : null;
                    const label = single
                      ? (getWorkplace(single.workplace_id)?.name ?? single.title)
                      : manyShiftsLabel(dayShifts.length);
                    const total = dayShifts.reduce((sum, s) => sum + s.expected_value, 0);
                    return (
                      <button
                        key={dateStr}
                        onClick={() => { setSelectedDate(day); setPanelMode('day'); }}
                        className={`flex items-center gap-4 py-[14px] border-b border-slate-200 last:border-b-0 text-left ${
                          // Dia selecionado: faixa de papel sangrando até as bordas da folha
                          isSel ? 'bg-slate-50 -mx-6 px-6 w-[calc(100%+48px)]' : 'w-full'
                        }`}
                      >
                        <span className={`w-[34px] shrink-0 text-[13px] tabular-nums ${
                          isSel ? 'font-medium text-blue-600' : 'font-light text-slate-500'
                        }`}>
                          {format(day, 'dd')}
                        </span>
                        <span className="flex-1 min-w-0 truncate text-[14px] text-slate-900">{label}</span>
                        <span className="shrink-0 text-[14px] text-slate-900 tabular-nums whitespace-nowrap">{formatCurrency(total)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
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
        icon={<CalendarDays size={20} strokeWidth={1.5} className="text-blue-600" />}
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

/** Chip de local (design): 7×14, raio 12, 12.5px; ativo = jade 500; ponto quadrado de 6px (raio 2) na cor do local. */
function FilterChip({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`chip inline-flex items-center gap-2 whitespace-nowrap shrink-0 px-[14px] py-[7px] text-[12.5px] ${
        active ? 'font-medium' : 'font-normal'
      }`}>
      {color && (
        <span
          aria-hidden="true"
          className="w-1.5 h-1.5 rounded-[2px] shrink-0"
          // No chip ativo (fundo jade) o ponto ganha um contorno branco para não sumir.
          style={{ background: color, boxShadow: active ? '0 0 0 1.5px rgba(255,255,255,.9)' : undefined }}
        />
      )}
      {label}
    </button>
  );
}
