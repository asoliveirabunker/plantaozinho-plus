import { useState, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { updateShift, getMonthlyStats } from '../lib/db';
import { format, subMonths, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Shift, ShiftStatus } from '../types';
import { STATUS_LABELS } from '../types';
import {
  TrendingUp, ChevronRight, ChevronDown, Check, AlertCircle, X,
  ChevronLeft, Calendar as CalendarIcon, DollarSign
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

function fmtCur(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function fmtShortCur(v: number) { return 'R$ ' + (v / 1000).toFixed(1).replace('.0', '') + 'k'; }

export default function GanhosScreen() {
  const { user, workplaces, shifts, refreshShifts } = useApp();
  
  // States
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [chartPeriod, setChartPeriod] = useState<'6m' | '1y'>('6m');
  const [activeTab, setActiveTab] = useState<'visao' | 'lista'>('visao');
  
  // Modals
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [modalYear, setModalYear] = useState(selectedMonth.getFullYear());
  const [receiveModal, setReceiveModal] = useState<Shift | null>(null);
  const [receiveValue, setReceiveValue] = useState('');
  
  // Goals
  const [monthGoal, setMonthGoal] = useState<number | null>(25000); // Exemplo default
  const [editGoal, setEditGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth() + 1;
  const isCurrentMonth = isSameMonth(selectedMonth, new Date());

  const allShifts = shifts;
  const stats = useMemo(() => user ? getMonthlyStats(user.id, year, month) : null, [user, year, month, shifts]);

  const monthShifts = useMemo(() => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return allShifts.filter(s => s.date.startsWith(prefix) && s.status !== 'cancelado');
  }, [allShifts, year, month]);

  const byStatus = useMemo(() => {
    const groups: Record<ShiftStatus, Shift[]> = {
      previsto: [], realizado: [], faturado: [], recebido: [], atrasado: [], divergente: [], cancelado: []
    };
    monthShifts.forEach(s => groups[s.status].push(s));
    return groups;
  }, [monthShifts]);

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
    const numMonths = chartPeriod === '1y' ? 12 : 6;
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
    const status: ShiftStatus = Math.abs(val - receiveModal.expected_value) > 0.01 ? 'divergente' : 'recebido';
    updateShift(receiveModal.id, { status, received_value: val, payment_received_date: new Date().toISOString() });
    refreshShifts();
    setReceiveModal(null);
  }

  return (
    <div className="page-content relative min-h-screen bg-white">
      {/* HEADER */}
      <header className="bg-white px-5 pt-7 pb-2.5 shadow-sm z-10 shrink-0 flex justify-between items-center sticky top-0">
        <div>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0">Visão Financeira</p>
          <button onClick={() => { setModalYear(selectedMonth.getFullYear()); setShowMonthModal(true); }}
            className="flex items-center gap-1.5 active:opacity-70 transition text-left group">
            <h1 className="text-[18px] font-bold text-slate-900 group-hover:text-blue-700 transition capitalize">
              {format(selectedMonth, 'MMMM, yyyy', { locale: ptBR })}
            </h1>
            <div className="bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 rounded-full p-0.5 transition">
              <ChevronDown size={14} strokeWidth={2.5} />
            </div>
          </button>
        </div>

        <button
          onClick={() => setSelectedMonth(new Date())}
          className={`text-[11px] font-bold px-2.5 py-1.5 rounded-full flex items-center gap-1 transition-all duration-300 ${
            !isCurrentMonth
              ? 'text-blue-600 bg-blue-100 shadow-sm'
              : 'text-slate-400 bg-slate-50'
          }`}
        >
          <CalendarIcon size={12} strokeWidth={2.5} />
          Hoje
        </button>
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
                <div className="flex justify-between items-center mb-1.5">
                  <h3 className="font-semibold text-slate-800 text-[13px]">Evolução</h3>
                  <select
                    value={chartPeriod}
                    onChange={e => setChartPeriod(e.target.value as '6m'|'1y')}
                    className="text-[11px] bg-slate-50 border border-slate-200 rounded-md px-1.5 py-0.5 outline-none text-slate-600 font-medium cursor-pointer hover:bg-slate-100 transition"
                  >
                    <option value="6m">6 meses</option>
                    <option value="1y">1 ano</option>
                  </select>
                </div>

                <div className="h-36 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                        tickFormatter={v => 'R$ ' + (v/1000).toFixed(0) + 'k'} />
                      <Tooltip formatter={(v: any) => fmtCur(Number(v))} cursor={{ stroke: '#e2e8f0', strokeWidth: 1, strokeDasharray: '4 4' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#64748b', fontWeight: 500, paddingTop: '10px' }} />
                      <Line type="monotone" dataKey="received" stroke="#2563eb" strokeWidth={2.5} dot={{ fill: '#fff', stroke: '#2563eb', strokeWidth: 2, r: 4 }} name="Realizado (Pago)" />
                      <Line type="monotone" dataKey="expected" stroke="#a855f7" strokeWidth={2} strokeDasharray="4 4" dot={{ fill: '#fff', stroke: '#a855f7', strokeWidth: 2, r: 3 }} name="Previsto" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Meta Mensal */}
              <div className="bg-white rounded-2xl p-3 shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-slate-100">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold text-slate-800 text-[13px]">Meta do Mês</h3>
                  <button onClick={() => { setGoalInput(monthGoal?.toString() || ''); setEditGoal(true); }}
                    className="text-blue-600 text-[11px] font-medium bg-blue-50 px-2 py-0.5 rounded-full active:scale-95 transition">
                    Editar
                  </button>
                </div>

                {monthGoal ? (
                  <>
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <h2 className="text-[20px] font-bold text-slate-900 leading-none tracking-tight">{fmtShortCur(stats?.received || 0)}</h2>
                      <span className="text-[12px] text-slate-400">/ {fmtShortCur(monthGoal)}</span>
                      <span className="text-[11px] text-blue-600 font-semibold ml-auto">{Math.min(100, Math.round(((stats?.received || 0)/monthGoal)*100))}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-blue-600 h-2 rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, ((stats?.received || 0)/monthGoal)*100)}%` }} />
                    </div>
                  </>
                ) : (
                  <button onClick={() => setEditGoal(true)} className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-[12px] font-medium">
                    Definir meta financeira
                  </button>
                )}
              </div>

              {/* Rentabilidade por Local (compacto) */}
              {workplaceBreakdown.length > 0 && (
                <div className="bg-white rounded-2xl p-3 shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-slate-100">
                  <h3 className="font-semibold text-slate-800 text-[13px] mb-2">Rentabilidade por Local</h3>
                  <div className="flex items-center gap-3">
                    <div className="h-20 w-20 shrink-0 relative">
                      <PieChart width={80} height={80}>
                        <Pie data={workplaceBreakdown} cx={40} cy={40} innerRadius={26} outerRadius={36} dataKey="value" strokeWidth={1.5} stroke="#fff">
                          {workplaceBreakdown.map((entry, i) => {
                            const wp = workplaces.find(w => w.id === entry.id);
                            return <Cell key={i} fill={wp?.color || '#cbd5e1'} />;
                          })}
                        </Pie>
                      </PieChart>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[8px] text-slate-400 leading-none">Total</span>
                        <span className="text-[10px] font-bold text-slate-800 leading-none mt-0.5">{fmtShortCur(stats?.expected || 0)}</span>
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

            {/* ÚLTIMOS PLANTÕES */}
            <div className="px-5 mb-4">
              <div className="flex justify-between items-center mb-1.5">
                <h3 className="font-semibold text-slate-800 text-[13px]">Últimos Plantões</h3>
                <button onClick={() => setActiveTab('lista')} className="text-[11px] text-blue-600 font-medium">Ver todos</button>
              </div>

              <div className="space-y-1.5">
                {monthShifts.slice(0, 3).map(shift => {
                  const wp = workplaces.find(w => w.id === shift.workplace_id);
                  const isPaid = shift.status === 'recebido';
                  return (
                    <div key={shift.id} className="bg-white p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-slate-100 active:bg-slate-50 transition">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center border border-slate-100 shrink-0"
                            style={{ background: wp?.color ? `${wp.color}20` : '#f8fafc', color: wp?.color || '#64748b' }}>
                            <span className="text-xs font-bold">{wp?.name.slice(0,2).toUpperCase()}</span>
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-900 text-sm">{wp?.name}</h4>
                            <p className="text-xs text-slate-500">
                              {format(new Date(shift.date), 'EEE, dd MMM', { locale: ptBR })} • {format(new Date(shift.start_datetime), 'HH:mm')} - {format(new Date(shift.end_datetime), 'HH:mm')}
                            </p>
                          </div>
                        </div>
                        <span className="font-bold text-slate-900 text-sm">{fmtCur(shift.expected_value)}</span>
                      </div>
                      <div className={`flex items-center mt-2 ${!isPaid ? 'justify-between' : 'justify-end'}`}>
                        {!isPaid && (
                          <button onClick={() => handleMarkReceived(shift)} className="text-[11px] text-slate-400 font-medium flex items-center gap-1 active:scale-95 transition hover:text-emerald-600">
                            <Check size={14} /> Marcar como pago
                          </button>
                        )}
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide uppercase ${
                          isPaid ? 'bg-emerald-50 text-emerald-600' :
                          shift.status === 'atrasado' ? 'bg-red-50 text-red-600' :
                          'bg-purple-50 text-purple-600'
                        }`}>
                          {STATUS_LABELS[shift.status]}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {monthShifts.length === 0 && (
                  <div className="text-center py-6 text-slate-400 text-sm bg-white rounded-2xl border border-slate-100">
                    Nenhum plantão registrado neste mês.
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* TAB: LISTA COMPLETA POR STATUS */
          <div className="px-5 space-y-6 mt-4">
            {(['atrasado', 'divergente', 'realizado', 'faturado', 'previsto', 'recebido'] as ShiftStatus[]).map(status => {
              const group = byStatus[status];
              if (!group.length) return null;
              const total = group.reduce((sum, s) => sum + s.expected_value, 0);
              return (
                <div key={status} className="mb-2">
                  <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide uppercase ${
                      status === 'recebido' ? 'bg-emerald-50 text-emerald-600' :
                      status === 'atrasado' ? 'bg-red-50 text-red-600' :
                      status === 'divergente' ? 'bg-orange-50 text-orange-600' :
                      status === 'realizado' || status === 'faturado' ? 'bg-blue-50 text-blue-600' :
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
                          {['realizado', 'faturado', 'atrasado'].includes(status) && (
                            <button onClick={() => handleMarkReceived(shift)}
                              className="mt-3 w-full py-2.5 rounded-xl text-emerald-600 bg-emerald-50 text-xs font-bold uppercase tracking-wider hover:bg-emerald-100 transition">
                              💰 Registrar Pagamento
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {monthShifts.length === 0 && (
              <div className="text-center py-10 text-slate-400 text-sm">Nenhum plantão neste mês</div>
            )}
          </div>
        )}
      </main>

      {/* MODAL: SELETOR DE MÊS */}
      {showMonthModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end justify-center transition-opacity" onClick={() => setShowMonthModal(false)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] transform transition-transform pb-8 mt-20 mb-[61px] animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Selecionar Período</h3>
                <p className="text-xs text-slate-500">Filtrar ganhos por competência</p>
              </div>
              <button onClick={() => setShowMonthModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-500 hover:bg-slate-100 transition">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6">
              {/* Year Selector */}
              <div className="flex justify-between items-center mb-6 bg-slate-50 rounded-2xl p-2 border border-slate-100">
                <button onClick={() => setModalYear(y => y - 1)} className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-slate-600 active:scale-95 transition">
                  <ChevronLeft size={20} />
                </button>
                <span className="font-bold text-xl text-slate-800">{modalYear}</span>
                <button onClick={() => setModalYear(y => y + 1)} className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-slate-600 active:scale-95 transition">
                  <ChevronRight size={20} />
                </button>
              </div>

              {/* Month Grid */}
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 12 }, (_, i) => {
                  const mName = format(new Date(2000, i, 1), 'MMM', { locale: ptBR }).replace(/^\w/, c => c.toUpperCase());
                  const isSelected = selectedMonth.getMonth() === i && selectedMonth.getFullYear() === modalYear;
                  
                  return (
                    <button key={i} onClick={() => { setSelectedMonth(new Date(modalYear, i, 1)); setShowMonthModal(false); }}
                      className={`py-3 rounded-xl border text-sm transition relative ${
                        isSelected 
                          ? 'border-blue-600 bg-blue-50 font-bold text-blue-700 shadow-sm' 
                          : 'border-slate-100 font-semibold text-slate-600 hover:bg-slate-50 active:bg-slate-100'
                      }`}>
                      {mName}
                      {isSelected && (
                        <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-blue-600 rounded-full border-2 border-white"></div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

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

    </div>
  );
}
