import { useState, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { updateShift, deleteShift, getMonthlyStats } from '../lib/db';
import { format, subMonths, isSameMonth, parseISO, startOfWeek, endOfWeek, addDays, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Shift, ShiftStatus } from '../types';
import { STATUS_LABELS } from '../types';
import {
  TrendingUp, ChevronRight, ChevronDown, Check, AlertCircle, X,
  ChevronLeft, Calendar as CalendarIcon, DollarSign, MapPin, CalendarRange, Edit3
} from 'lucide-react';
import EditShiftSheet from '../components/EditShiftSheet';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

function fmtCur(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function fmtShortCur(v: number) { return 'R$ ' + (v / 1000).toFixed(1).replace('.0', '') + 'k'; }

function CompactTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900/95 backdrop-blur rounded-lg px-2 py-1.5 shadow-lg pointer-events-none">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-1.5 leading-tight">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: entry.color }} />
          <span className="text-[10px] font-semibold text-white tabular-nums">{fmtShortCur(Number(entry.value))}</span>
        </div>
      ))}
    </div>
  );
}

export default function GanhosScreen() {
  const { user, workplaces, shifts, refreshShifts } = useApp();
  
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

  const chartData = useMemo(() => {
    if (!user) return [];
    const data = [];
    const numMonths = chartPeriod === '2y' ? 24 : chartPeriod === '1y' ? 12 : chartPeriod === '3m' ? 3 : 6;
    for (let i = numMonths - 1; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const st = getMonthlyStats(user.id, d.getFullYear(), d.getMonth() + 1);
      data.push({
        month: format(d, 'MMM', { locale: ptBR }),
        received: st.received,
        expected: st.expected
      });
    }
    return data;
  }, [user, chartPeriod, refreshShifts]);

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

  return (
    <div className="page-content relative min-h-screen bg-white">
      {/* HEADER */}
      <header className="bg-white px-5 pt-7 pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Visão Financeira</p>
            <button onClick={() => { setModalYear(selectedMonth.getFullYear()); setShowMonthModal(true); }}
              className="flex items-center gap-1.5 active:opacity-70 transition text-left group">
              <h1 className="text-[20px] font-black text-slate-900 tracking-tight leading-tight capitalize">
                {format(selectedMonth, 'MMMM, yyyy', { locale: ptBR })}
              </h1>
              <ChevronDown size={14} strokeWidth={2.5} className="text-slate-400 group-hover:text-blue-600 transition" />
            </button>
            <p className="text-[12px] text-slate-500 mt-0.5">{isCurrentMonth ? 'Mês atual em curso.' : 'Período histórico selecionado.'}</p>
          </div>
          {!isCurrentMonth && (
            <button
              onClick={() => setSelectedMonth(new Date())}
              className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-all active:scale-95 shrink-0 ml-3"
              title="Voltar para hoje"
            >
              <CalendarIcon size={15} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </header>

      {/* TABS (Visão Geral vs Por Plantão) */}
      <div className="px-5 mt-2.5 mb-1">
        <div className="flex bg-slate-200/50 rounded-xl p-0.5">
          {(['visao', 'lista'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className="flex-1 py-1.5 rounded-lg text-[12px] font-semibold transition-all shadow-sm"
              style={{ 
                background: activeTab === t ? 'white' : 'transparent', 
                color: activeTab === t ? '#0f172a' : '#64748b',
                boxShadow: activeTab === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}>
              {t === 'visao' ? 'Painel' : 'Extrato'}
            </button>
          ))}
        </div>
      </div>

      <main className="pb-8">
        {activeTab === 'visao' ? (
          <>
            {/* GRUPO DE CARDS (Realizado, A Receber, Atrasado) */}
            <div className="mt-2.5 mb-2 px-5">
              <div className="grid grid-cols-2 gap-2">

                {/* Realizado (Ocupa as duas colunas no topo) */}
                <div className="col-span-2 bg-white rounded-2xl p-3.5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-slate-100 relative overflow-hidden">
                  <div className="flex justify-between items-center mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                        <DollarSign size={13} strokeWidth={2.5} />
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Realizado</span>
                    </div>
                    <span className="text-[10px] text-slate-400">{monthShifts.filter(s=>s.status==='recebido').length} pagos</span>
                  </div>
                  <h2 className="text-[24px] font-bold text-slate-900 leading-none tracking-tight">{fmtCur(stats?.received || 0)}</h2>
                </div>

                {/* A Receber (Metade da tela) */}
                <div className="col-span-1 bg-white rounded-2xl p-3 shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-slate-100 relative overflow-hidden">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold">
                      <TrendingUp size={13} strokeWidth={2.5} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">A Receber</span>
                  </div>
                  <h2 className="text-[15px] font-bold text-slate-900 truncate tracking-tight">{fmtCur(stats?.pending || 0)}</h2>
                </div>

                {/* Atrasados (Metade da tela) */}
                <div className={`col-span-1 rounded-2xl p-3 shadow-[0_2px_10px_rgba(0,0,0,0.03)] relative overflow-hidden ${
                  (stats?.overdue || 0) > 0 ? 'bg-red-50 border border-red-100' : 'bg-white border border-slate-100'
                }`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold ${
                      (stats?.overdue || 0) > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'
                    }`}>
                      <AlertCircle size={13} strokeWidth={2.5} />
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${
                      (stats?.overdue || 0) > 0 ? 'text-red-600' : 'text-slate-500'
                    }`}>Atrasados</span>
                  </div>
                  <h2 className={`text-[15px] font-bold truncate tracking-tight ${
                    (stats?.overdue || 0) > 0 ? 'text-red-600' : 'text-slate-900'
                  }`}>{fmtCur(stats?.overdue || 0)}</h2>
                </div>

              </div>
            </div>

            {/* GRÁFICO EVOLUÇÃO & META */}
            <div className="px-5 mt-2 mb-4 flex flex-col gap-2">

              {/* Gráfico */}
              <div className="bg-white rounded-2xl p-3 shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-slate-100">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold text-slate-800 text-[13px]">Evolução</h3>
                  <div className="flex bg-slate-100 p-0.5 rounded-lg gap-0.5">
                    {([
                      { key: '3m',  label: '3m' },
                      { key: '6m',  label: '6m' },
                      { key: '1y',  label: '1a' },
                      { key: '2y',  label: '2a' },
                    ] as const).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setChartPeriod(key)}
                        className={`px-2 py-1 rounded-[6px] text-[11px] font-semibold transition-all ${
                          chartPeriod === key
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  className="h-36 w-full relative select-none"
                  style={{
                    touchAction: 'pan-y',
                    WebkitTouchCallout: 'none',
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                        tickFormatter={v => 'R$ ' + (v/1000).toFixed(0) + 'k'} />
                      <Tooltip
                        content={<CompactTooltip />}
                        cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.6 }}
                        wrapperStyle={{ outline: 'none' }}
                        offset={12}
                        animationDuration={120}
                        trigger="hover"
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#64748b', fontWeight: 500, paddingTop: '10px' }} />
                      <Line type="monotone" dataKey="received" stroke="#2563eb" strokeWidth={2.5} dot={{ fill: '#fff', stroke: '#2563eb', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff', fill: '#2563eb' }} name="Realizado (Pago)" />
                      <Line type="monotone" dataKey="expected" stroke="#a855f7" strokeWidth={2} strokeDasharray="4 4" dot={{ fill: '#fff', stroke: '#a855f7', strokeWidth: 2, r: 3 }} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: '#a855f7' }} name="Previsto" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Meta Mensal — card inteiro clicável (drill-down) */}
              <button
                onClick={() => { setGoalInput(monthGoal?.toString() || ''); setEditGoal(true); }}
                className="w-full text-left bg-white rounded-2xl p-3 shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-slate-100 active:scale-[0.99] transition-all hover:border-blue-100 hover:shadow-[0_2px_12px_rgba(24,119,242,0.07)] group"
              >
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold text-slate-800 text-[13px]">Meta do Mês</h3>
                  <span className="text-[11px] text-slate-400 group-hover:text-blue-500 transition flex items-center gap-1">
                    Toque para editar
                    <ChevronRight size={11} strokeWidth={2.5} />
                  </span>
                </div>

                {monthGoal ? (() => {
                  const received = stats?.received || 0;
                  const remaining = Math.max(0, monthGoal - received);
                  const pctReceived = Math.min(100, Math.round((received / monthGoal) * 100));
                  const pctRemaining = 100 - pctReceived;
                  const goalData = [
                    { label: 'Recebido',  value: received,  pct: pctReceived,  color: '#2563eb' },
                    { label: 'Restante',  value: remaining, pct: pctRemaining, color: '#e2e8f0' },
                  ];
                  return (
                    <div className="flex items-center gap-3">
                      <div className="h-24 w-24 shrink-0 relative">
                        <PieChart width={96} height={96}>
                          <Pie data={goalData} cx={48} cy={48} innerRadius={32} outerRadius={44}
                            dataKey="value" startAngle={90} endAngle={-270} strokeWidth={1.5} stroke="transparent">
                            {goalData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                        </PieChart>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-[9px] text-slate-400 leading-none">Meta</span>
                          <span className="text-[11px] font-bold text-slate-800 leading-none mt-0.5">{fmtShortCur(monthGoal)}</span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        {goalData.map((entry, i) => (
                          <div key={i} className="flex justify-between items-center gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color }} />
                              <span className="text-[11px] font-medium text-slate-700 truncate">{entry.label}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] text-slate-400">{entry.pct}%</span>
                              <span className="text-[11px] font-bold text-slate-900">{fmtShortCur(entry.value)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })() : (
                  <div className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-[12px] font-medium text-center">
                    Toque para definir uma meta financeira
                  </div>
                )}
              </button>

              {/* Rentabilidade por Local (compacto) */}
              {workplaceBreakdown.length > 0 && (
                <div className="bg-white rounded-2xl p-3 shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-slate-100">
                  <h3 className="font-semibold text-slate-800 text-[13px] mb-2">Rentabilidade por Local</h3>
                  <div className="flex items-center gap-3">
                    <div className="h-24 w-24 shrink-0 relative">
                      <PieChart width={96} height={96}>
                        <Pie data={workplaceBreakdown} cx={48} cy={48} innerRadius={32} outerRadius={44} dataKey="value" strokeWidth={1.5} stroke="transparent">
                          {workplaceBreakdown.map((entry, i) => {
                            const wp = workplaces.find(w => w.id === entry.id);
                            return <Cell key={i} fill={wp?.color || '#cbd5e1'} />;
                          })}
                        </Pie>
                      </PieChart>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[9px] text-slate-400 leading-none">Total</span>
                        <span className="text-[11px] font-bold text-slate-800 leading-none mt-0.5">{fmtShortCur(stats?.expected || 0)}</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      {workplaceBreakdown.slice(0, 3).map(entry => {
                        const wp = workplaces.find(w => w.id === entry.id);
                        if (!wp) return null;
                        return (
                          <div key={entry.id} className="flex justify-between items-center gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: wp.color }} />
                              <span className="text-[11px] font-medium text-slate-700 truncate">{wp.name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] text-slate-400">{entry.pct}%</span>
                              <span className="text-[11px] font-bold text-slate-900">{fmtShortCur(entry.value)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

          </>
        ) : (
          /* TAB: LISTA COMPLETA POR STATUS */
          <div className="px-5 mt-4">
            {/* Filtros — barra compacta */}
            {(() => {
              const fmtDate = (s: string) => format(parseISO(s), 'dd/MM');
              const dateLabel =
                filterDateFrom && filterDateTo ? `${fmtDate(filterDateFrom)} – ${fmtDate(filterDateTo)}` :
                filterDateFrom ? `A partir de ${fmtDate(filterDateFrom)}` :
                filterDateTo ? `Até ${fmtDate(filterDateTo)}` :
                'Período';
              const dateActive = !!(filterDateFrom || filterDateTo);

              // Workplace pill label
              const wpPillActive = filterWorkplaces.length > 0;
              const wpPillLabel = filterWorkplaces.length === 0
                ? 'Local'
                : filterWorkplaces.length === 1
                  ? (workplaces.find(w => w.id === filterWorkplaces[0])?.name ?? 'Local')
                  : `${filterWorkplaces.length} locais`;
              const wpPillColor = filterWorkplaces.length === 1
                ? workplaces.find(w => w.id === filterWorkplaces[0])?.color
                : undefined;

              return (
                <div className="flex items-center gap-2 mb-4">
                  {/* Pill: Local */}
                  <button
                    onClick={() => { setWorkplacesDraft(filterWorkplaces); setShowWorkplaceSheet(true); }}
                    className={`flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-full text-[12px] font-semibold transition-all active:scale-95 border ${
                      wpPillActive
                        ? 'bg-white border-slate-200 text-slate-800 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {wpPillColor ? (
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: wpPillColor }} />
                    ) : filterWorkplaces.length > 1 ? (
                      <span className="text-[10px] font-black text-blue-600 bg-blue-50 rounded-full w-4 h-4 flex items-center justify-center shrink-0">{filterWorkplaces.length}</span>
                    ) : (
                      <MapPin size={12} strokeWidth={2.5} className="text-slate-400" />
                    )}
                    <span className="truncate max-w-[110px]">{wpPillLabel}</span>
                    <ChevronDown size={12} strokeWidth={2.5} className="text-slate-400 -mr-0.5" />
                  </button>

                  {/* Pill: Período */}
                  <button
                    onClick={() => { setDateFromDraft(filterDateFrom); setDateToDraft(filterDateTo); setShowDateSheet(true); }}
                    className={`flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-full text-[12px] font-semibold transition-all active:scale-95 border ${
                      dateActive
                        ? 'bg-white border-slate-200 text-slate-800 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <CalendarIcon size={12} strokeWidth={2.5} className={dateActive ? 'text-blue-600' : 'text-slate-400'} />
                    <span className="truncate">{dateLabel}</span>
                    <ChevronDown size={12} strokeWidth={2.5} className="text-slate-400 -mr-0.5" />
                  </button>

                  {/* Clear (only when active) */}
                  {hasActiveFilter && (
                    <button
                      onClick={() => { setFilterWorkplaces([]); setFilterDateFrom(''); setFilterDateTo(''); }}
                      className="ml-auto w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center active:scale-90 transition shrink-0"
                      title="Limpar filtros"
                    >
                      <X size={13} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              );
            })()}

            <div className="space-y-6">
            {(['atrasado', 'realizado', 'previsto', 'recebido', 'cancelado'] as ShiftStatus[]).map(status => {
              const group = byStatus[status];
              if (!group.length) return null;
              const total = group.reduce((sum, s) => sum + s.expected_value, 0);
              return (
                <div key={status} className="mb-2">
                  <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide uppercase ${
                      status === 'recebido' ? 'bg-emerald-50 text-emerald-600' :
                      status === 'atrasado' ? 'bg-red-50 text-red-600' :
                      status === 'realizado' ? 'bg-blue-50 text-blue-600' :
                      'bg-slate-100 text-slate-600'
                    }`}>{STATUS_LABELS[status]}</span>
                    <span className="text-sm font-bold text-slate-900">{fmtCur(total)}</span>
                  </div>
                  
                  <div className="space-y-3">
                    {group.map(shift => {
                      const wp = workplaces.find(w => w.id === shift.workplace_id);
                      return (
                        <div key={shift.id} className="bg-white p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-slate-100">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                                style={{ background: wp?.color ? `${wp.color}20` : '#f8fafc', color: wp?.color || '#64748b' }}>
                                <span className="font-bold text-xs">{wp?.name.slice(0,2).toUpperCase()}</span>
                              </div>
                              <div>
                                <h4 className="font-semibold text-slate-900 text-sm">{wp?.name}</h4>
                                <p className="text-xs text-slate-500">{format(new Date(shift.date), 'dd/MM/yyyy')}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-slate-900 text-sm">{fmtCur(shift.expected_value)}</p>
                              {shift.received_value && shift.received_value !== shift.expected_value && (
                                <p className="text-[10px] text-red-500 font-medium mt-0.5">Rec: {fmtCur(shift.received_value)}</p>
                              )}
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="mt-3 flex gap-2">
                            <button onClick={() => setEditSheetShift(shift)}
                              className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition active:scale-[0.98] flex items-center justify-center gap-1.5">
                              <Edit3 size={12} strokeWidth={2.5} /> Editar
                            </button>
                            {status === 'previsto' && (
                              <button onClick={() => handleMarkDone(shift)}
                                className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm shadow-blue-600/20">
                                <Check size={12} strokeWidth={3} /> Concluir
                              </button>
                            )}
                            {['realizado', 'atrasado'].includes(status) && (
                              <button onClick={() => handleMarkReceived(shift)}
                                className="flex-1 py-2 rounded-xl text-emerald-600 bg-emerald-50 text-xs font-bold uppercase tracking-wider hover:bg-emerald-100 transition flex items-center justify-center gap-1.5">
                                <DollarSign size={12} strokeWidth={2.5} />
                                Receber
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {filteredShifts.length === 0 && (
              <div className="text-center py-10 text-slate-400 text-sm">
                {hasActiveFilter ? 'Nenhum plantão corresponde aos filtros.' : 'Nenhum plantão neste mês'}
              </div>
            )}
            </div>
          </div>
        )}
      </main>

      {/* MODAL: SELETOR DE MÊS */}
      {showMonthModal && (() => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const canGoNextYear = modalYear < currentYear;
        return (
          <div className="bottom-sheet-overlay" onClick={() => setShowMonthModal(false)}>
            <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
              <div className="sheet-handle" />

              {/* Header */}
              <div className="flex items-start justify-between mb-5">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Período</p>
                  <h3 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight">Selecionar mês</h3>
                  <p className="text-[12px] text-slate-500 mt-0.5 capitalize">Atual: {format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}</p>
                </div>
                <button onClick={() => setShowMonthModal(false)}
                  className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all active:scale-95 shrink-0 ml-3"
                  title="Fechar">
                  <X size={16} />
                </button>
              </div>

              {/* Year Selector */}
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setModalYear(y => y - 1)}
                  className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center active:scale-95 transition-all">
                  <ChevronLeft size={16} strokeWidth={2.5} />
                </button>
                <div className="flex items-baseline gap-2">
                  <span className="text-[22px] font-black text-slate-900 tracking-tight tabular-nums">{modalYear}</span>
                  {modalYear === currentYear && (
                    <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-wider">atual</span>
                  )}
                </div>
                <button onClick={() => canGoNextYear && setModalYear(y => y + 1)}
                  disabled={!canGoNextYear}
                  className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronRight size={16} strokeWidth={2.5} />
                </button>
              </div>

              {/* Month Grid */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                {Array.from({ length: 12 }, (_, i) => {
                  const mName = format(new Date(2000, i, 1), 'MMM', { locale: ptBR }).replace(/^\w/, c => c.toUpperCase());
                  const isSelected = selectedMonth.getMonth() === i && selectedMonth.getFullYear() === modalYear;
                  const isCurrent = i === currentMonth && modalYear === currentYear;
                  const isFuture = modalYear > currentYear || (modalYear === currentYear && i > currentMonth);

                  return (
                    <button key={i}
                      onClick={() => { if (!isFuture) { setSelectedMonth(new Date(modalYear, i, 1)); setShowMonthModal(false); } }}
                      disabled={isFuture}
                      className={`relative py-2.5 rounded-xl text-[13px] font-semibold transition-all active:scale-95
                        ${isSelected
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                          : isFuture
                            ? 'text-slate-300 bg-slate-50/50 cursor-not-allowed'
                            : isCurrent
                              ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100'
                              : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}>
                      {mName}
                      {isCurrent && !isSelected && (
                        <span className="absolute top-1 right-1.5 w-1 h-1 rounded-full bg-blue-500" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Footer: quick action */}
              {!(selectedMonth.getMonth() === currentMonth && selectedMonth.getFullYear() === currentYear) && (
                <button onClick={() => { setSelectedMonth(new Date()); setShowMonthModal(false); }}
                  className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold hover:bg-slate-200 transition active:scale-[0.98]">
                  Voltar para o mês atual
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* BOTTOM SHEET: FILTRO POR LOCAL (multi-select) */}
      {showWorkplaceSheet && (
        <div className="bottom-sheet-overlay" onClick={() => setShowWorkplaceSheet(false)}>
          <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />

            <div className="flex items-start justify-between mb-5">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Filtro</p>
                <h3 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight">Local</h3>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  {workplacesDraft.length === 0
                    ? 'Todos os locais selecionados.'
                    : workplacesDraft.length === 1
                      ? '1 local selecionado.'
                      : `${workplacesDraft.length} locais selecionados.`}
                </p>
              </div>
              <button onClick={() => setShowWorkplaceSheet(false)}
                className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all active:scale-95 shrink-0 ml-3">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-1.5 mb-4">
              {/* Todos os locais */}
              <button
                onClick={() => setWorkplacesDraft([])}
                className={`w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl transition-all active:scale-[0.99] ${
                  workplacesDraft.length === 0 ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    workplacesDraft.length === 0 ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 border border-slate-200'
                  }`}>
                    <MapPin size={14} strokeWidth={2.5} />
                  </div>
                  <div className="text-left min-w-0">
                    <p className={`text-[14px] font-bold truncate ${workplacesDraft.length === 0 ? 'text-blue-700' : 'text-slate-800'}`}>Todos os locais</p>
                    <p className="text-[11px] text-slate-500">{monthShifts.length} {monthShifts.length !== 1 ? 'plantões' : 'plantão'} no mês</p>
                  </div>
                </div>
                {workplacesDraft.length === 0 && (
                  <Check size={16} strokeWidth={3} className="text-blue-600 shrink-0" />
                )}
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
                    className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl transition-all active:scale-[0.99]"
                    style={isChecked
                      ? { background: `${wp.color}12`, boxShadow: `0 0 0 1.5px ${wp.color}70` }
                      : { background: '#f8fafc' }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-[11px]"
                        style={{ background: `${wp.color}20`, color: wp.color }}>
                        {wp.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="text-left min-w-0">
                        <p className="text-[14px] font-bold text-slate-800 truncate">{wp.name}</p>
                        <p className="text-[11px] text-slate-500">{count} {count !== 1 ? 'plantões' : 'plantão'} no mês</p>
                      </div>
                    </div>
                    {/* Checkbox visual */}
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                      isChecked ? 'border-transparent' : 'border-slate-300 bg-white'
                    }`} style={isChecked ? { background: wp.color } : undefined}>
                      {isChecked && <Check size={12} strokeWidth={3} className="text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex gap-2 pt-1 border-t border-slate-100">
              <button
                onClick={() => { setWorkplacesDraft([]); setFilterWorkplaces([]); setShowWorkplaceSheet(false); }}
                disabled={workplacesDraft.length === 0 && filterWorkplaces.length === 0}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold hover:bg-slate-200 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <MapPin size={14} strokeWidth={2.25} />
                Todos
              </button>
              <button
                onClick={() => { setFilterWorkplaces(workplacesDraft); setShowWorkplaceSheet(false); }}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 transition active:scale-[0.98] shadow-sm shadow-blue-600/20"
              >
                Aplicar{workplacesDraft.length > 0 ? ` (${workplacesDraft.length})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM SHEET: FILTRO POR PERÍODO */}
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
          const f = dateFromDraft ? format(parseISO(dateFromDraft), "dd 'de' MMM", { locale: ptBR }) : '...';
          const t = dateToDraft ? format(parseISO(dateToDraft), "dd 'de' MMM", { locale: ptBR }) : '...';
          if (dateFromDraft && dateToDraft && dateFromDraft === dateToDraft) return f;
          return `${f} – ${t}`;
        })();

        const renderChip = (p: { label: string; from: string; to: string }) => {
          const active = isActive(p);
          return (
            <button key={p.label}
              onClick={() => { setDateFromDraft(p.from); setDateToDraft(p.to); }}
              className={`px-3 py-2 rounded-full text-[12.5px] font-semibold transition-all active:scale-95 whitespace-nowrap ${
                active
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          );
        };

        return (
          <div className="bottom-sheet-overlay" onClick={() => setShowDateSheet(false)}>
            <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
              <div className="sheet-handle" />

              <div className="flex items-start justify-between mb-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Filtro</p>
                  <h3 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight">Período</h3>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    {previewLabel ? <>Mostrando <span className="font-semibold text-slate-700">{previewLabel}</span></> : 'Por padrão, exibe o mês inteiro.'}
                  </p>
                </div>
                <button onClick={() => setShowDateSheet(false)}
                  className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all active:scale-95 shrink-0 ml-3">
                  <X size={16} />
                </button>
              </div>

              {/* Group: Recentes */}
              <div className="mb-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Atalhos rápidos</p>
                <div className="flex flex-wrap gap-1.5">
                  {quickPresets.map(renderChip)}
                </div>
              </div>

              {/* Group: Quinzena */}
              <div className="mb-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Divisão do mês</p>
                <div className="flex flex-wrap gap-1.5">
                  {monthPresets.map(renderChip)}
                </div>
              </div>

              {/* Custom range */}
              <div className="mb-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Intervalo personalizado</p>
                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="block text-[10px] text-slate-500 mb-1 ml-0.5">De</label>
                    <input
                      type="date"
                      value={dateFromDraft}
                      onChange={e => setDateFromDraft(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
                    />
                  </div>
                  <span className="pb-3 text-slate-400 text-[11px] font-medium">até</span>
                  <div className="flex-1 min-w-0">
                    <label className="block text-[10px] text-slate-500 mb-1 ml-0.5">Até</label>
                    <input
                      type="date"
                      value={dateToDraft}
                      onChange={e => setDateToDraft(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setDateFromDraft(''); setDateToDraft(''); setFilterDateFrom(''); setFilterDateTo(''); setShowDateSheet(false); }}
                  disabled={!anyDraft && !filterDateFrom && !filterDateTo}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold hover:bg-slate-200 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CalendarRange size={14} strokeWidth={2.25} />
                  Mês todo
                </button>
                <button
                  onClick={() => { setFilterDateFrom(dateFromDraft); setFilterDateTo(dateToDraft); setShowDateSheet(false); }}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 transition active:scale-[0.98] shadow-sm shadow-blue-600/20"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: META MENSAL */}
      {editGoal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditGoal(false)}>
          <div className="bg-white w-full max-w-xs rounded-2xl p-5 shadow-xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-900 text-lg mb-1">Meta do Mês</h3>
            <p className="text-slate-500 text-xs mb-4">Defina quanto deseja faturar neste mês.</p>
            <input 
              type="number" 
              value={goalInput} 
              onChange={e => setGoalInput(e.target.value)} 
              placeholder="Ex: 25000" 
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold mb-4 outline-none focus:border-blue-500 focus:bg-white transition-all" 
              autoFocus 
            />
            <div className="flex gap-2">
              <button onClick={() => setEditGoal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition">Cancelar</button>
              <button onClick={() => { const v = parseFloat(goalInput); if (!isNaN(v) && v > 0) setMonthGoal(v); setEditGoal(false); }}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition shadow-sm">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REGISTRAR PAGAMENTO */}
      {receiveModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setReceiveModal(null)}>
          <div className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-900 text-lg mb-1">Registrar Pagamento</h3>
            <p className="text-slate-500 text-xs mb-4">
              Valor esperado: <strong className="text-slate-800">{fmtCur(receiveModal.expected_value)}</strong>
            </p>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Valor recebido na conta</label>
            <input 
              type="number" 
              value={receiveValue} 
              onChange={e => setReceiveValue(e.target.value)} 
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 mb-3 outline-none focus:border-emerald-500 focus:bg-white transition-all" 
              autoFocus 
            />
            
            {receiveValue && Math.abs(parseFloat(receiveValue) - receiveModal.expected_value) > 0.01 && (
              <div className="flex items-start gap-2 p-3 bg-orange-50 rounded-xl mb-4 border border-orange-100">
                <AlertCircle size={14} className="text-orange-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-orange-800 leading-tight">
                  Diferença de <strong>{fmtCur(Math.abs(parseFloat(receiveValue) - receiveModal.expected_value))}</strong>. O plantão será marcado como <strong className="text-orange-600">Divergente</strong> para análise posterior.
                </p>
              </div>
            )}
            
            <div className="flex gap-2 mt-4">
              <button onClick={() => setReceiveModal(null)} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition">Cancelar</button>
              <button onClick={confirmReceive} className="flex-1 py-3 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition shadow-sm flex items-center justify-center gap-1.5">
                <Check size={16} /> Confirmar
              </button>
            </div>
          </div>
        </div>
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

    </div>
  );
}
