import { useState, useMemo } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useApp } from '../contexts/AppContext';
import { updateShift, deleteShift, getMonthlyStats } from '../lib/db';
import {
  format, subMonths, isSameMonth, parseISO, startOfWeek, endOfWeek, addDays, subDays,
  getDaysInMonth, differenceInCalendarDays,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Shift, ShiftStatus } from '../types';
import { STATUS_LABELS } from '../types';
import {
  ChevronRight, ChevronDown, ChevronLeft, Check, AlertCircle, X,
  Calendar as CalendarIcon, DollarSign, MapPin, CalendarRange, Lock, Crown, HelpCircle,
} from 'lucide-react';
import EditShiftSheet from '../components/EditShiftSheet';
import ScreenHelpSheet from '../components/ScreenHelpSheet';
import { useLanguage } from '../hooks/useLanguage';
import { usePlan } from '../contexts/PlanContext';

function fmtCur(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

/** Valor impresso sobre a barra: "R$ 14,3k", "R$ 11k" (vírgula decimal). */
function fmtK(v: number) {
  if (v <= 0) return 'R$ 0';
  const k = v / 1000;
  const r = k >= 100 ? Math.round(k) : Math.round(k * 10) / 10;
  if (r === 0) return 'R$ ' + Math.round(v);
  return 'R$ ' + String(r).replace('.', ',') + 'k';
}

/** Separa "R$ 3.900" de ",00" para o centavo ir em corpo menor. */
function splitCur(v: number): [string, string] {
  const full = fmtCur(v);
  const i = full.lastIndexOf(',');
  return i === -1 ? [full, ''] : [full.slice(0, i), full.slice(i)];
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

/** Enter/Espaço ativam elementos `role="button"` que não são <button>. */
function onKeyActivate(fn: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
  };
}

/**
 * Bloqueio Pro — cartão de papel (#F6F8F7) com filete e raio 20, cadeado jade e
 * rótulo centralizados; ocupa exatamente o espaço da seção bloqueada. É o ÚNICO
 * elemento clicável da área: o conteúdo por baixo fica invisível e inerte.
 */
function ProLockCard({ label, onUnlock }: { label: string; onUnlock: () => void }) {
  return (
    <button
      type="button"
      onClick={onUnlock}
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[20px] border border-slate-200 bg-slate-50 transition-colors hover:border-[color:var(--color-primary)]"
    >
      <Lock size={18} strokeWidth={1.5} className="text-blue-600" />
      <span className="text-[13.5px] font-medium text-slate-900">{label}</span>
    </button>
  );
}

/** Título de seção do painel: 15/600, sem filete. */
function SectionTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={`text-[15px] font-semibold tracking-[-0.015em] text-slate-900 ${className}`}>{children}</h3>
  );
}

/** Seta 14px do seletor de mês / 13px dos chips (mesmo traço do design). */
function Caret({ size }: { size: number }) {
  return <ChevronDown size={size} strokeWidth={1.6} className="shrink-0" />;
}

type ChartBar = {
  key: string;
  label: string;
  received: number;
  expected: number;
  /** Intervalo que contém o mês selecionado — rótulo em tinta. */
  current: boolean;
};

/** Modal centrado padrão do sistema (cartão branco rounded-3xl, fechar em icon-btn). */
function CenterModal({ title, subtitle, onClose, children, footer }: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white w-full max-w-sm rounded-3xl overflow-hidden animate-scale-in flex flex-col max-h-[88vh]"
        style={{ boxShadow: '0 40px 80px -30px rgba(7,56,45,.5)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 pb-5 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h3 className="text-[22px] font-light tracking-[-0.03em] leading-tight text-slate-900">{title}</h3>
            {subtitle && <p className="mt-1.5 text-[13px] text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn w-10 h-10 -mr-2 -mt-1.5 flex items-center justify-center shrink-0"
            title="Fechar"
          >
            <X size={19} strokeWidth={1.5} />
          </button>
        </div>
        <div className="px-6 pb-6 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-slate-200 flex gap-2 shrink-0">{footer}</div>
        )}
      </div>
    </div>
  );
}

export default function GanhosScreen() {
  const { user, workplaces, shifts, refreshShifts } = useApp();
  const { t } = useLanguage();
  const { can, gate } = usePlan();
  const canCharts = can('charts');
  const canGoals = can('goals');

  // States
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [chartPeriod, setChartPeriod] = useState<'3m' | '6m' | '1y' | '2y'>('6m');
  const [activeTab, setActiveTab] = useState<'visao' | 'lista'>('visao');

  // Modals
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [modalYear, setModalYear] = useState(selectedMonth.getFullYear());
  const [receiveModal, setReceiveModal] = useState<Shift | null>(null);
  const [receiveValue, setReceiveValue] = useState('');
  const [editSheetShift, setEditSheetShift] = useState<Shift | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Goals
  const [monthGoal, setMonthGoal] = useState<number | null>(25000); // Exemplo default
  const [editGoal, setEditGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  // Extrato filters
  const [filterWorkplaces, setFilterWorkplaces] = useState<string[]>([]); // empty = all
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [showWorkplaceSheet, setShowWorkplaceSheet] = useState(false);
  const [showDateSheet, setShowDateSheet] = useState(false);
  const [workplacesDraft, setWorkplacesDraft] = useState<string[]>([]);
  const [dateFromDraft, setDateFromDraft] = useState('');
  const [dateToDraft, setDateToDraft] = useState('');

  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth() + 1;
  const isCurrentMonth = isSameMonth(selectedMonth, new Date());

  const allShifts = shifts;
  const stats = useMemo(() => user ? getMonthlyStats(user.id, year, month) : null, [user, year, month, shifts]);

  const monthShifts = useMemo(() => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return allShifts.filter(s => s.date.startsWith(prefix) && s.status !== 'cancelado');
  }, [allShifts, year, month]);

  const filteredShifts = useMemo(() => {
    return monthShifts.filter(s => {
      if (filterWorkplaces.length > 0 && !filterWorkplaces.includes(s.workplace_id)) return false;
      if (filterDateFrom) {
        const from = parseISO(filterDateFrom);
        if (parseISO(s.date) < from) return false;
      }
      if (filterDateTo) {
        const to = parseISO(filterDateTo);
        if (parseISO(s.date) > to) return false;
      }
      return true;
    });
  }, [monthShifts, filterWorkplaces, filterDateFrom, filterDateTo]);

  const hasActiveFilter = filterWorkplaces.length > 0 || filterDateFrom !== '' || filterDateTo !== '';

  const byStatus = useMemo(() => {
    const groups: Record<ShiftStatus, Shift[]> = {
      previsto: [], realizado: [], recebido: [], atrasado: [], cancelado: []
    };
    filteredShifts.forEach(s => groups[s.status].push(s));
    return groups;
  }, [filteredShifts]);

  const workplaceBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    monthShifts.forEach(s => { map[s.workplace_id] = (map[s.workplace_id] || 0) + s.expected_value; });
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    return Object.entries(map).map(([id, val]) => ({
      id, value: val, pct: total ? Math.round((val / total) * 100) : 0,
    })).sort((a, b) => b.value - a.value);
  }, [monthShifts]);

  /**
   * Série do gráfico de barras — histórico real, janela terminando no mês atual.
   * 3m/6m: uma barra por mês. 1a/2a: os 12/24 meses agregados em 6 barras
   * (2 e 4 meses por barra). Rótulos como no design: mês abreviado (a última
   * barra de 1a leva o mês atual) e "aa/n" no 2a (n = terço do ano da janela).
   */
  const chartBars = useMemo<ChartBar[]>(() => {
    if (!user) return [];
    const now = new Date();
    const perBar = chartPeriod === '2y' ? 4 : chartPeriod === '1y' ? 2 : 1;
    const numBars = chartPeriod === '3m' ? 3 : 6;
    const bars: ChartBar[] = [];
    for (let b = numBars - 1; b >= 0; b--) {
      const months: Date[] = [];
      let received = 0;
      let expected = 0;
      for (let m = perBar - 1; m >= 0; m--) {
        const d = subMonths(now, b * perBar + m);
        months.push(d);
        const st = getMonthlyStats(user.id, d.getFullYear(), d.getMonth() + 1);
        received += st.received;
        expected += st.expected;
      }
      const first = months[0];
      const last = months[months.length - 1];
      const idx = numBars - 1 - b;
      let label: string;
      if (chartPeriod === '2y') {
        const yearEnd = subMonths(now, (1 - Math.floor(idx / 3)) * 12);
        label = `${format(yearEnd, 'yy')}/${(idx % 3) + 1}`;
      } else {
        label = format(b === 0 ? last : first, 'MMM', { locale: ptBR });
      }
      bars.push({
        key: format(first, 'yyyy-MM'),
        label,
        received,
        expected,
        current: months.some(d => isSameMonth(d, selectedMonth)),
      });
    }
    return bars;
  }, [user, chartPeriod, shifts, selectedMonth]);

  const chartMax = Math.max(0, ...chartBars.map(b => Math.max(b.expected, b.received)));

  function handleMarkReceived(shift: Shift) {
    setReceiveModal(shift);
    setReceiveValue(shift.expected_value.toString());
  }

  function confirmReceive() {
    if (!receiveModal) return;
    const val = parseFloat(receiveValue.replace(',', '.'));
    if (isNaN(val)) return;
    updateShift(receiveModal.id, { status: 'recebido', received_value: val, payment_received_date: new Date().toISOString() });
    refreshShifts();
    setReceiveModal(null);
  }

  function handleMarkDone(shift: Shift) {
    updateShift(shift.id, { status: 'realizado' });
    refreshShifts();
  }

  function handleDeleteShift(id: string) {
    deleteShift(id);
    refreshShifts();
    setEditSheetShift(null);
  }

  function openGoalEditor() {
    if (!gate('goals')) return;
    setGoalInput(monthGoal?.toString() || ''); setEditGoal(true);
  }

  const monthLabel = capitalize(format(selectedMonth, 'MMMM', { locale: ptBR }));
  const [receivedInt, receivedCents] = splitCur(stats?.received || 0);
  const received = stats?.received || 0;
  const expected = stats?.expected || 0;
  const pending = stats?.pending || 0;
  const overdue = stats?.overdue || 0;

  // Contagens da frase de apoio e da treliça
  const paidCount = monthShifts.filter(s => s.status === 'recebido').length;
  const pendingCount = monthShifts.filter(s => s.status === 'previsto' || s.status === 'realizado').length;
  const overdueShifts = monthShifts.filter(s => s.status === 'atrasado');
  const receivedPct = expected > 0 ? Math.round((received / expected) * 100) : 0;
  // Maior atraso em dias: desde o vencimento do pagamento (ou da data do plantão, sem vencimento)
  const maxLateDays = overdueShifts.reduce((mx, s) => {
    const ref = parseISO(s.payment_due_date || s.date);
    return Math.max(mx, differenceInCalendarDays(new Date(), ref));
  }, 0);
  const plural = (n: number) => (n === 1 ? t('plantão') : t('plantões'));

  // Meta do mês
  const goalPct = monthGoal ? Math.round((received / monthGoal) * 100) : 0;
  const goalLine = (() => {
    if (!monthGoal) return '';
    const remaining = monthGoal - received;
    if (remaining <= 0) {
      return remaining < 0
        ? `${t('Meta atingida')} · ${fmtCur(-remaining)} ${t('acima')}`
        : t('Meta atingida');
    }
    if (isCurrentMonth) {
      const today = new Date();
      const daysLeft = getDaysInMonth(today) - today.getDate() + 1;
      return `${t('Faltam')} ${fmtCur(remaining)} · ${daysLeft} ${daysLeft === 1 ? t('dia no mês') : t('dias no mês')}`;
    }
    return `${t('Faltaram')} ${fmtCur(remaining)} · ${t('mês encerrado')}`;
  })();

  function clearFilters() {
    setFilterWorkplaces([]);
    setFilterDateFrom('');
    setFilterDateTo('');
  }

  // Abas com filete de 1.5px (Painel / Extrato)
  const tabClass = (active: boolean) =>
    `-mb-px pb-3 text-[14px] transition-colors ${
      active
        ? 'border-b-[1.5px] border-[color:var(--color-primary)] font-semibold text-slate-900'
        : 'border-b-0 font-normal text-slate-500 hover:text-slate-900'
    }`;

  // Botão quadrado 34×34 do cabeçalho (ajuda / voltar para hoje)
  const headerBtnClass =
    'w-[34px] h-[34px] shrink-0 p-0 rounded-[12px] border border-slate-200 bg-white flex items-center justify-center transition-colors hover:border-[color:var(--color-primary)] hover:text-blue-600';

  return (
    <div className="relative min-h-screen bg-white">
      {/* CABEÇALHO EM PAPEL — seletor de mês + abas */}
      <header className="bg-slate-50 px-6 pt-[56px] leading-[normal]">
        <p className="text-[13px] font-normal text-slate-500">{t('Visão financeira')}</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <button
            type="button"
            onClick={() => { setModalYear(selectedMonth.getFullYear()); setShowMonthModal(true); }}
            aria-haspopup="dialog"
            className="flex items-baseline gap-2 p-0 text-left text-slate-500 transition-opacity active:opacity-70"
          >
            <span className="text-[28px] font-light tracking-[-0.035em] leading-none text-slate-900 whitespace-nowrap">
              {monthLabel}
              <span className="font-extralight text-slate-500 tabular-nums"> {format(selectedMonth, 'yyyy')}</span>
            </span>
            <span className="mb-[3px]"><Caret size={14} /></span>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            {!isCurrentMonth && (
              <button
                type="button"
                onClick={() => setSelectedMonth(new Date())}
                className={`${headerBtnClass} text-blue-600`}
                title="Voltar para hoje"
              >
                <CalendarIcon size={16} strokeWidth={1.5} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className={`${headerBtnClass} text-slate-600`}
              title="Sobre esta tela"
            >
              <HelpCircle size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <div className="mt-6 flex gap-[26px]" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'visao'}
            onClick={() => setActiveTab('visao')}
            className={tabClass(activeTab === 'visao')}
          >
            {t('Painel')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'lista'}
            // Extrato (detalhamento + atrasos) é recurso Pro
            onClick={() => gate('overdue_alerts', () => setActiveTab('lista'))}
            className={`${tabClass(activeTab === 'lista')} flex items-center gap-1`}
          >
            {t('Extrato')}
            <span className="font-light text-slate-500 tabular-nums">{monthShifts.length}</span>
            {!can('overdue_alerts') && <Crown size={11} strokeWidth={1.8} className="ml-0.5 text-slate-500" />}
          </button>
        </div>
      </header>
      <div className="h-px bg-slate-200" />

      {activeTab === 'visao' ? (
        /* PAINEL */
        <main className="bg-white px-6 pt-[30px] pb-[118px] leading-[normal]">
          {/* Número herói — recebido no mês */}
          <p className="text-[13px] font-normal text-slate-500">{t('Recebido em')} {monthLabel}</p>
          <p className="mt-[10px] text-[44px] font-extralight tracking-[-0.04em] leading-none text-slate-900 tabular-nums">
            {receivedInt}
            <span className="text-[24px] font-light text-slate-500">{receivedCents}</span>
          </p>
          <p className="mt-[10px] text-[13px] font-normal text-slate-500 tabular-nums">
            {monthShifts.length === 0
              ? t('Nenhum plantão neste mês')
              : `${paidCount} ${t('de')} ${monthShifts.length} ${monthShifts.length === 1 ? t('plantão pago') : t('plantões pagos')} · ${receivedPct}% ${t('do previsto')}`}
          </p>

          {/* Treliça: A receber / Atrasado */}
          <div className="mt-[26px] grid grid-cols-2 border-t border-slate-200">
            <div className="min-w-0 py-4 pr-4 border-r border-b border-slate-200">
              <p className="text-[12.5px] font-normal text-slate-500">{t('A receber')}</p>
              <p className="mt-1.5 text-[19px] font-normal tracking-[-0.02em] text-slate-900 tabular-nums truncate">
                {fmtCur(pending)}
              </p>
              <p className="mt-1 text-[12px] font-normal text-slate-500 tabular-nums">
                {pendingCount} {plural(pendingCount)}
              </p>
            </div>
            <div className="min-w-0 py-4 pl-4 border-b border-slate-200">
              <p className="text-[12.5px] font-normal text-slate-500">{t('Atrasado')}</p>
              <p className={`mt-1.5 text-[19px] font-normal tracking-[-0.02em] tabular-nums truncate ${overdue > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                {fmtCur(overdue)}
              </p>
              <p className="mt-1 text-[12px] font-normal text-slate-500 tabular-nums">
                {overdueShifts.length} {plural(overdueShifts.length)}
                {maxLateDays > 0 && ` · ${maxLateDays} ${maxLateDays === 1 ? t('dia') : t('dias')}`}
              </p>
            </div>
          </div>

          {/* EVOLUÇÃO — barras empilhadas */}
          <div className="mt-[34px] flex items-baseline justify-between gap-4">
            <SectionTitle>{t('Evolução')}</SectionTitle>
            <div className="flex gap-1" role="tablist" aria-label={t('Período')}>
              {([
                { key: '3m', label: '3m' },
                { key: '6m', label: '6m' },
                { key: '1y', label: '1a' },
                { key: '2y', label: '2a' },
              ] as const).map(({ key, label }) => {
                const active = chartPeriod === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setChartPeriod(key)}
                    className={`px-[10px] py-[5px] rounded-[12px] text-[12px] tabular-nums transition-colors ${
                      active
                        ? 'bg-slate-100 font-semibold text-slate-900'
                        : 'bg-transparent font-normal text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative mt-[22px]">
            {!canCharts && <ProLockCard label={t('Recurso Pro')} onUnlock={() => gate('charts')} />}
            <div
              className={!canCharts ? 'invisible pointer-events-none select-none' : ''}
              aria-hidden={!canCharts || undefined}
            >
              <div className="flex items-end gap-[10px] h-[132px]">
                {chartBars.map(bar => {
                  const hRec = chartMax > 0 ? Math.round((bar.received / chartMax) * 84) : 0;
                  const hPend = chartMax > 0 ? Math.round((Math.max(0, bar.expected - bar.received) / chartMax) * 84) : 0;
                  const low = bar.expected > 0 && bar.received / bar.expected < 0.5;
                  return (
                    <div key={bar.key} className="flex-1 min-w-0 flex flex-col items-center gap-2">
                      <span className={`text-[11px] font-medium tabular-nums whitespace-nowrap ${low ? 'text-red-600' : 'text-slate-600'}`}>
                        {fmtK(bar.expected)}
                      </span>
                      <span className="w-full max-w-[26px] h-[84px] flex flex-col justify-end">
                        <span
                          className="w-full rounded-t-[4px] bg-[#C9DED6] dark:bg-[#295045]"
                          style={{ height: hPend }}
                        />
                        <span
                          className="w-full bg-blue-600 dark:bg-[#12A87F]"
                          style={{ height: hRec, borderRadius: hPend > 1 ? 0 : '4px 4px 0 0' }}
                        />
                      </span>
                      <span className={`text-[11.5px] font-normal ${bar.current ? 'text-slate-900' : 'text-slate-500'}`}>
                        {bar.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-[14px] flex gap-5 border-t border-slate-200">
                <span className="flex items-center gap-2 text-[12.5px] font-normal text-slate-600">
                  <span className="w-1.5 h-1.5 rounded-[2px] bg-blue-600 dark:bg-[#12A87F]" />
                  {t('Recebido')}
                </span>
                <span className="flex items-center gap-2 text-[12.5px] font-normal text-slate-600">
                  <span className="w-1.5 h-1.5 rounded-[2px] bg-[#C9DED6] dark:bg-[#295045]" />
                  {t('Previsto')}
                </span>
              </div>
            </div>
          </div>

          {/* META DO MÊS */}
          <div className="mt-[34px] flex items-baseline justify-between gap-4">
            <SectionTitle>{t('Meta do mês')}</SectionTitle>
            {canGoals && (
              <button
                type="button"
                onClick={openGoalEditor}
                className="p-0 text-[12.5px] font-medium text-blue-600 border-b border-[#C9DED6] dark:border-[#295045] transition-colors hover:border-[color:var(--color-primary)]"
              >
                {t('Editar')}
              </button>
            )}
          </div>

          <div
            {...(canGoals
              ? { role: 'button', tabIndex: 0, onClick: openGoalEditor, onKeyDown: onKeyActivate(openGoalEditor) }
              : {})}
            className={`relative mt-[14px] ${canGoals ? 'cursor-pointer' : ''}`}
          >
            {!canGoals && <ProLockCard label={t('Recurso Pro')} onUnlock={() => gate('goals')} />}
            <div className={!canGoals ? 'invisible pointer-events-none select-none' : ''} aria-hidden={!canGoals || undefined}>
              {monthGoal ? (
                <>
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="text-[26px] font-extralight tracking-[-0.035em] text-slate-900 tabular-nums">
                      {fmtCur(monthGoal)}
                    </p>
                    <p className="text-[13px] font-medium text-blue-600 tabular-nums">{goalPct}%</p>
                  </div>
                  {/* Progresso: filete de 4px jade */}
                  <div
                    className="mt-3 h-1 rounded-[4px] bg-slate-200 overflow-hidden"
                    role="progressbar"
                    aria-valuenow={Math.min(100, goalPct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-1 rounded-[4px] bg-blue-600 dark:bg-[#12A87F] transition-all duration-500"
                      style={{ width: `${Math.min(100, goalPct)}%` }}
                    />
                  </div>
                  <p className="mt-3 text-[12.5px] font-normal text-slate-500 tabular-nums">{goalLine}</p>
                </>
              ) : (
                <div className="py-5 rounded-[12px] border border-dashed border-slate-300 text-center text-[13px] text-slate-500">
                  {t('Toque para definir uma meta financeira')}
                </div>
              )}
            </div>
          </div>

          {/* ONDE O DINHEIRO NASCE — ranking por local */}
          {workplaceBreakdown.length > 0 && (
            <>
              <SectionTitle className="mt-[34px]">{t('Onde o dinheiro nasce')}</SectionTitle>
              <div className="mt-[14px]">
                {workplaceBreakdown.map(entry => {
                  const wp = workplaces.find(w => w.id === entry.id);
                  if (!wp) return null;
                  return (
                    <div key={entry.id} className="py-[14px] border-b border-slate-200">
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="flex items-center gap-[10px] min-w-0">
                          <span className="w-1.5 h-1.5 shrink-0 rounded-[2px]" style={{ background: wp.color }} />
                          <span className="text-[14px] font-normal text-slate-900 truncate">{wp.name}</span>
                        </span>
                        <span className="flex items-baseline gap-[10px] shrink-0">
                          <span className="text-[14.5px] font-normal text-slate-900 tabular-nums">{fmtCur(entry.value)}</span>
                          <span className="w-[30px] text-right text-[12px] font-normal text-slate-500 tabular-nums">{entry.pct}%</span>
                        </span>
                      </div>
                      <div className="mt-[10px] h-[3px] rounded-[3px] bg-slate-100 overflow-hidden">
                        <div className="h-[3px] rounded-[3px]" style={{ width: `${entry.pct}%`, background: wp.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </main>
      ) : (
        /* EXTRATO — lista completa por status */
        <main className="bg-white px-6 pt-[22px] pb-[118px] leading-[normal]">
          {/* Filtros */}
          {(() => {
            const fmtDate = (s: string) => format(parseISO(s), 'dd/MM');
            const dateLabel =
              filterDateFrom && filterDateTo ? `${fmtDate(filterDateFrom)} – ${fmtDate(filterDateTo)}` :
              filterDateFrom ? `${t('A partir de')} ${fmtDate(filterDateFrom)}` :
              filterDateTo ? `${t('Até')} ${fmtDate(filterDateTo)}` :
              t('Período');
            const dateActive = !!(filterDateFrom || filterDateTo);

            const wpPillActive = filterWorkplaces.length > 0;
            const wpPillLabel = filterWorkplaces.length === 0
              ? t('Local')
              : filterWorkplaces.length === 1
                ? (workplaces.find(w => w.id === filterWorkplaces[0])?.name ?? t('Local'))
                : `${filterWorkplaces.length} ${t('locais')}`;

            const chipClass = (active: boolean) =>
              `flex items-center gap-2 min-w-0 px-[14px] py-[9px] rounded-[12px] border text-[12.5px] transition-colors hover:border-[color:var(--color-primary)] ${
                active
                  ? 'bg-slate-100 border-[color:var(--color-primary)] text-slate-900'
                  : 'bg-white border-slate-200 text-slate-600'
              }`;

            return (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setWorkplacesDraft(filterWorkplaces); setShowWorkplaceSheet(true); }}
                  aria-pressed={wpPillActive}
                  className={`${chipClass(wpPillActive)} font-medium`}
                >
                  <span className="truncate max-w-[130px]">{wpPillLabel}</span>
                  <Caret size={13} />
                </button>

                <button
                  type="button"
                  onClick={() => { setDateFromDraft(filterDateFrom); setDateToDraft(filterDateTo); setShowDateSheet(true); }}
                  aria-pressed={dateActive}
                  className={`${chipClass(dateActive)} font-normal`}
                >
                  <span className="truncate tabular-nums">{dateLabel}</span>
                  <Caret size={13} />
                </button>

                {hasActiveFilter && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="ml-auto w-9 h-9 shrink-0 p-0 rounded-[12px] border border-slate-200 bg-white text-slate-600 flex items-center justify-center transition-colors hover:border-[color:var(--color-primary)] hover:text-blue-600"
                    title="Limpar filtros"
                  >
                    <X size={15} strokeWidth={1.5} />
                  </button>
                )}
              </div>
            );
          })()}

          {(['atrasado', 'realizado', 'previsto', 'recebido', 'cancelado'] as ShiftStatus[]).map(status => {
            const group = byStatus[status];
            if (!group.length) return null;
            const total = group.reduce((sum, s) => sum + s.expected_value, 0);
            const titleColor =
              status === 'atrasado' ? 'text-red-600' :
              status === 'recebido' ? 'text-blue-600' :
              'text-slate-600';
            return (
              <section key={status} className="mt-[30px]">
                <div className="flex items-baseline justify-between gap-4 pb-[10px] border-b border-slate-200">
                  <h3 className={`text-[10.5px] font-medium tracking-[0.06em] uppercase ${titleColor}`}>
                    {t(STATUS_LABELS[status])}
                  </h3>
                  <span className="text-[14px] font-normal text-slate-900 tabular-nums">{fmtCur(total)}</span>
                </div>

                {group.map(shift => {
                  const wp = workplaces.find(w => w.id === shift.workplace_id);
                  const hasDiff = !!shift.received_value && shift.received_value !== shift.expected_value;
                  const action =
                    status === 'previsto'
                      ? { label: t('Concluir'), run: () => handleMarkDone(shift) }
                      : status === 'realizado' || status === 'atrasado'
                        ? { label: t('Receber'), run: () => handleMarkReceived(shift) }
                        : null;
                  return (
                    <div key={shift.id} className="py-4 border-b border-slate-200">
                      <div className="flex items-start justify-between gap-4">
                        <div
                          className="min-w-0 border-l-2 pl-[14px]"
                          style={{ borderLeftColor: wp?.color || 'var(--color-border)' }}
                        >
                          <p className="text-[14.5px] font-medium tracking-[-0.01em] text-slate-900 truncate">{wp?.name}</p>
                          <p className="mt-1 text-[12.5px] font-normal text-slate-500 tabular-nums">
                            {format(parseISO(shift.date), 'dd MMM', { locale: ptBR })}
                            {' · '}
                            {format(parseISO(shift.start_datetime), 'HH:mm')} — {format(parseISO(shift.end_datetime), 'HH:mm')}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[15px] font-normal text-slate-900 tabular-nums">{fmtCur(shift.expected_value)}</p>
                          {hasDiff && (
                            <p className="mt-1 text-[12px] font-normal text-red-600 tabular-nums">Rec: {fmtCur(shift.received_value!)}</p>
                          )}
                        </div>
                      </div>

                      {/* Ações: dois botões de 44px */}
                      <div className="mt-[14px] pl-4 flex gap-[10px]">
                        <button
                          type="button"
                          onClick={() => setEditSheetShift(shift)}
                          className="flex-1 h-11 rounded-[12px] border border-slate-200 bg-white text-[13.5px] font-medium text-slate-600 transition-colors hover:border-[color:var(--color-primary)] hover:text-blue-600"
                        >
                          {t('Editar')}
                        </button>
                        {action && (
                          <button
                            type="button"
                            onClick={action.run}
                            className="flex-1 h-11 rounded-[12px] border-0 bg-blue-600 text-[13.5px] font-medium text-white transition-colors hover:bg-blue-700"
                          >
                            {action.label}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}

          {filteredShifts.length === 0 && (
            <div className="pt-[60px] pb-10 text-center">
              <p className="text-[19px] font-light tracking-[-0.025em] text-slate-900">
                {hasActiveFilter ? t('Nada neste filtro') : t('Nenhum plantão neste mês')}
              </p>
              {hasActiveFilter && (
                <>
                  <p className="mt-[10px] text-[13.5px] font-normal leading-[1.6] text-slate-500">
                    {t('Nenhum plantão em')} {monthLabel}{' '}
                    {filterWorkplaces.length > 0 && (filterDateFrom || filterDateTo)
                      ? t('para os filtros escolhidos.')
                      : filterWorkplaces.length > 1
                        ? t('para os locais escolhidos.')
                        : filterWorkplaces.length === 1
                          ? t('para o local escolhido.')
                          : t('para o período escolhido.')}
                  </p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-[22px] h-11 px-5 rounded-[12px] border border-slate-200 bg-white text-[13.5px] font-medium text-blue-600 transition-colors hover:border-[color:var(--color-primary)]"
                  >
                    {t('Limpar filtro')}
                  </button>
                </>
              )}
            </div>
          )}
        </main>
      )}

      {/* MODAL: SELETOR DE MÊS */}
      {showMonthModal && (() => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const canGoNextYear = modalYear < currentYear;
        return (
          <CenterModal
            title={t('Selecionar mês')}
            subtitle={<span className="capitalize">{t('Atual:')} {format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}</span>}
            onClose={() => setShowMonthModal(false)}
          >
            {/* Ano */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setModalYear(y => y - 1)}
                aria-label="Ano anterior"
                className="icon-btn w-10 h-10 flex items-center justify-center">
                <ChevronLeft size={19} strokeWidth={1.5} />
              </button>
              <div className="flex items-baseline gap-2">
                <span className="text-[24px] font-light tracking-[-0.03em] text-slate-900 tabular-nums">{modalYear}</span>
                {modalYear === currentYear && (
                  <span className="text-[12px] text-blue-600">{t('atual')}</span>
                )}
              </div>
              <button onClick={() => canGoNextYear && setModalYear(y => y + 1)}
                disabled={!canGoNextYear}
                aria-label="Próximo ano"
                className="icon-btn w-10 h-10 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronRight size={19} strokeWidth={1.5} />
              </button>
            </div>

            {/* Meses */}
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 12 }, (_, i) => {
                const mName = format(new Date(2000, i, 1), 'MMM', { locale: ptBR }).replace(/^\w/, c => c.toUpperCase());
                const isSelected = selectedMonth.getMonth() === i && selectedMonth.getFullYear() === modalYear;
                const isCurrent = i === currentMonth && modalYear === currentYear;
                const isFuture = modalYear > currentYear || (modalYear === currentYear && i > currentMonth);

                return (
                  <button key={i}
                    onClick={() => { if (!isFuture) { setSelectedMonth(new Date(modalYear, i, 1)); setShowMonthModal(false); } }}
                    disabled={isFuture}
                    aria-pressed={isSelected}
                    className={`chip relative w-full text-center disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-200 ${
                      isCurrent && !isSelected ? 'text-blue-600' : ''
                    }`}
                  >
                    {mName}
                    {isCurrent && !isSelected && (
                      <span className="absolute top-1.5 right-2 w-1 h-1 rounded-full bg-blue-600" />
                    )}
                  </button>
                );
              })}
            </div>

            {!(selectedMonth.getMonth() === currentMonth && selectedMonth.getFullYear() === currentYear) && (
              <button onClick={() => { setSelectedMonth(new Date()); setShowMonthModal(false); }}
                className="mt-5 w-full text-center text-[13.5px] font-medium text-blue-600 hover:text-blue-700 transition-colors">
                {t('Voltar para o mês atual')}
              </button>
            )}
          </CenterModal>
        );
      })()}

      {/* MODAL: FILTRO POR LOCAL (multi-select) */}
      {showWorkplaceSheet && (
        <CenterModal
          title={t('Local')}
          subtitle={
            workplacesDraft.length === 0
              ? t('Todos os locais selecionados.')
              : workplacesDraft.length === 1
                ? `1 ${t('local selecionado.')}`
                : `${workplacesDraft.length} ${t('locais selecionados.')}`
          }
          onClose={() => setShowWorkplaceSheet(false)}
          footer={
            <>
              <button
                onClick={() => { setWorkplacesDraft([]); setFilterWorkplaces([]); setShowWorkplaceSheet(false); }}
                disabled={workplacesDraft.length === 0 && filterWorkplaces.length === 0}
                className="btn-secondary w-auto shrink-0 h-[52px] flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <MapPin size={16} strokeWidth={1.5} />
                {t('Todos')}
              </button>
              <button
                onClick={() => { setFilterWorkplaces(workplacesDraft); setShowWorkplaceSheet(false); }}
                className="btn-primary flex-1"
              >
                {t('Aplicar')}{workplacesDraft.length > 0 ? ` (${workplacesDraft.length})` : ''}
              </button>
            </>
          }
        >
          <div className="border-t border-slate-200">
            {/* Todos os locais */}
            <button
              onClick={() => setWorkplacesDraft([])}
              aria-pressed={workplacesDraft.length === 0}
              className="list-row w-full text-left !py-3.5"
            >
              <span className="flex items-center gap-3 min-w-0">
                <MapPin size={18} strokeWidth={1.5} className="shrink-0 text-blue-600" />
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-medium text-slate-900 truncate">{t('Todos os locais')}</span>
                  <span className="block mt-0.5 text-[12.5px] text-slate-500 tabular-nums">
                    {monthShifts.length} {monthShifts.length !== 1 ? t('plantões') : t('plantão')} {t('no mês')}
                  </span>
                </span>
              </span>
              <span className={`w-5 h-5 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${
                workplacesDraft.length === 0 ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'
              }`}>
                {workplacesDraft.length === 0 && <Check size={13} strokeWidth={2} className="text-white" />}
              </span>
            </button>

            {workplaces.map(wp => {
              const count = monthShifts.filter(s => s.workplace_id === wp.id).length;
              const isChecked = workplacesDraft.includes(wp.id);

              function toggleWp() {
                setWorkplacesDraft(prev =>
                  prev.includes(wp.id) ? prev.filter(id => id !== wp.id) : [...prev, wp.id]
                );
              }

              return (
                <button
                  key={wp.id}
                  onClick={toggleWp}
                  aria-pressed={isChecked}
                  className="list-row w-full text-left !py-3.5"
                >
                  <span className="place-rule min-w-0" style={{ borderLeftColor: wp.color }}>
                    <span className="block text-[14.5px] font-medium text-slate-900 truncate">{wp.name}</span>
                    <span className="block mt-0.5 text-[12.5px] text-slate-500 tabular-nums">
                      {count} {count !== 1 ? t('plantões') : t('plantão')} {t('no mês')}
                    </span>
                  </span>
                  <span className={`w-5 h-5 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${
                    isChecked ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'
                  }`}>
                    {isChecked && <Check size={13} strokeWidth={2} className="text-white" />}
                  </span>
                </button>
              );
            })}
          </div>
        </CenterModal>
      )}

      {/* MODAL: FILTRO POR PERÍODO */}
      {showDateSheet && (() => {
        const iso = (d: Date) => format(d, 'yyyy-MM-dd');
        const todayD = new Date();
        const today = iso(todayD);
        const monthStart = iso(new Date(year, month - 1, 1));
        const monthMid = iso(new Date(year, month - 1, 15));
        const monthMidNext = iso(new Date(year, month - 1, 16));
        const monthEnd = iso(new Date(year, month, 0));
        const weekStart = iso(startOfWeek(todayD, { weekStartsOn: 1 }));
        const weekEnd = iso(endOfWeek(todayD, { weekStartsOn: 1 }));

        const quickPresets = [
          { label: 'Hoje', from: today, to: today },
          { label: 'Esta semana', from: weekStart, to: weekEnd },
          { label: 'Próx. 7 dias', from: today, to: iso(addDays(todayD, 6)) },
          { label: 'Últ. 7 dias', from: iso(subDays(todayD, 6)), to: today },
        ];
        const monthPresets = [
          { label: '1ª quinzena', from: monthStart, to: monthMid },
          { label: '2ª quinzena', from: monthMidNext, to: monthEnd },
        ];
        const isActive = (p: { from: string; to: string }) => dateFromDraft === p.from && dateToDraft === p.to;
        const anyDraft = !!(dateFromDraft || dateToDraft);

        const previewLabel = (() => {
          if (!dateFromDraft && !dateToDraft) return null;
          const fromStr = dateFromDraft ? format(parseISO(dateFromDraft), "dd 'de' MMM", { locale: ptBR }) : '...';
          const toStr = dateToDraft ? format(parseISO(dateToDraft), "dd 'de' MMM", { locale: ptBR }) : '...';
          if (dateFromDraft && dateToDraft && dateFromDraft === dateToDraft) return fromStr;
          return `${fromStr} – ${toStr}`;
        })();

        const renderChip = (p: { label: string; from: string; to: string }) => (
          <button key={p.label}
            onClick={() => { setDateFromDraft(p.from); setDateToDraft(p.to); }}
            aria-pressed={isActive(p)}
            className="chip whitespace-nowrap"
          >
            {t(p.label)}
          </button>
        );

        return (
          <CenterModal
            title={t('Período')}
            subtitle={previewLabel
              ? <>{t('Mostrando')} <span className="font-semibold text-slate-900">{previewLabel}</span></>
              : t('Por padrão, exibe o mês inteiro.')}
            onClose={() => setShowDateSheet(false)}
            footer={
              <>
                <button
                  onClick={() => { setDateFromDraft(''); setDateToDraft(''); setFilterDateFrom(''); setFilterDateTo(''); setShowDateSheet(false); }}
                  disabled={!anyDraft && !filterDateFrom && !filterDateTo}
                  className="btn-secondary w-auto shrink-0 h-[52px] flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CalendarRange size={16} strokeWidth={1.5} />
                  {t('Mês todo')}
                </button>
                <button
                  onClick={() => { setFilterDateFrom(dateFromDraft); setFilterDateTo(dateToDraft); setShowDateSheet(false); }}
                  className="btn-primary flex-1"
                >
                  {t('Aplicar')}
                </button>
              </>
            }
          >
            <div className="section-rule !mt-0 !mb-3"><span>{t('Atalhos rápidos')}</span></div>
            <div className="flex flex-wrap gap-2">
              {quickPresets.map(renderChip)}
            </div>

            <div className="section-rule !mt-6 !mb-3"><span>{t('Divisão do mês')}</span></div>
            <div className="flex flex-wrap gap-2">
              {monthPresets.map(renderChip)}
            </div>

            <div className="section-rule !mt-6 !mb-3"><span>{t('Intervalo personalizado')}</span></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label htmlFor="ganhos-date-from" className="input-label">{t('De')}</label>
                <input
                  id="ganhos-date-from"
                  type="date"
                  value={dateFromDraft}
                  onChange={e => setDateFromDraft(e.target.value)}
                  className="input-field tabular-nums"
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="ganhos-date-to" className="input-label">{t('Até')}</label>
                <input
                  id="ganhos-date-to"
                  type="date"
                  value={dateToDraft}
                  onChange={e => setDateToDraft(e.target.value)}
                  className="input-field tabular-nums"
                />
              </div>
            </div>
          </CenterModal>
        );
      })()}

      {/* MODAL: META MENSAL */}
      {editGoal && (
        <CenterModal
          title={t('Meta do mês')}
          subtitle={t('Defina quanto deseja faturar neste mês.')}
          onClose={() => setEditGoal(false)}
        >
          <input
            type="number"
            inputMode="decimal"
            value={goalInput}
            onChange={e => setGoalInput(e.target.value)}
            placeholder="Ex: 25000"
            aria-label={t('Meta do mês')}
            className="input-field tabular-nums"
            autoFocus
          />
          <div className="mt-5 flex gap-2">
            <button onClick={() => setEditGoal(false)} className="btn-secondary flex-1 h-[52px]">{t('Cancelar')}</button>
            <button onClick={() => { const v = parseFloat(goalInput); if (!isNaN(v) && v > 0) setMonthGoal(v); setEditGoal(false); }}
              className="btn-primary flex-1">{t('Salvar')}</button>
          </div>
        </CenterModal>
      )}

      {/* MODAL: REGISTRAR PAGAMENTO */}
      {receiveModal && (
        <CenterModal
          title={t('Registrar Pagamento')}
          subtitle={<>{t('Valor esperado')}: <span className="font-semibold text-slate-900 tabular-nums">{fmtCur(receiveModal.expected_value)}</span></>}
          onClose={() => setReceiveModal(null)}
        >
          <label htmlFor="ganhos-receive-value" className="input-label">{t('Valor recebido na conta')}</label>
          <input
            id="ganhos-receive-value"
            type="number"
            inputMode="decimal"
            value={receiveValue}
            onChange={e => setReceiveValue(e.target.value)}
            className="input-field tabular-nums"
            autoFocus
          />

          {receiveValue && Math.abs(parseFloat(receiveValue) - receiveModal.expected_value) > 0.01 && (
            <div className="notice notice-warn mt-4 items-start">
              <AlertCircle size={17} strokeWidth={1.6} className="text-red-600 shrink-0 mt-0.5" />
              <p className="text-[13px] leading-[1.5] text-slate-700">
                {t('Diferença de')} <strong className="font-semibold text-slate-900 tabular-nums">{fmtCur(Math.abs(parseFloat(receiveValue) - receiveModal.expected_value))}</strong>.{' '}
                {t('O plantão será marcado como')} <strong className="font-semibold text-red-700">{t('Divergente')}</strong> {t('para análise posterior.')}
              </p>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button onClick={() => setReceiveModal(null)} className="btn-secondary flex-1 h-[52px]">{t('Cancelar')}</button>
            <button onClick={confirmReceive} className="btn-primary flex-1">
              <Check size={17} strokeWidth={1.8} /> {t('Confirmar')}
            </button>
          </div>
        </CenterModal>
      )}

      {/* EDIT SHEET (shared with Calendar) */}
      {editSheetShift && (
        <EditShiftSheet
          key={editSheetShift.id}
          shift={editSheetShift}
          onClose={() => setEditSheetShift(null)}
          onSaved={() => { refreshShifts(); setEditSheetShift(null); }}
          onDelete={() => handleDeleteShift(editSheetShift.id)}
        />
      )}

      {/* DRILLDOWN: SOBRE A TELA GANHOS */}
      <ScreenHelpSheet
        open={showHelp}
        onClose={() => setShowHelp(false)}
        icon={<DollarSign size={20} strokeWidth={1.5} className="text-blue-600" />}
        pretitle="Ganhos"
        title="O que tem aqui"
        items={[
          { title: 'Painel financeiro', desc: 'Veja realizado, a receber e atrasado do mês selecionado.' },
          { title: 'Extrato detalhado', desc: 'Liste plantão a plantão por status, com filtros de local e período.' },
          { title: 'Evolução e meta', desc: 'Acompanhe o gráfico de ganhos e defina sua meta mensal.' },
          { title: 'Onde o dinheiro nasce', desc: 'Descubra quais locais mais contribuem para o seu faturamento.' },
        ]}
        proPitch="No Pro você desbloqueia o gráfico de evolução, metas financeiras e os alertas de pagamentos atrasados."
        proFeature="charts"
      />

    </div>
  );
}
