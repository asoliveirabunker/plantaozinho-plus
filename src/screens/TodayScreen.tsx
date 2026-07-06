import { useState, useMemo, useEffect } from 'react';
import { Bell, AlertCircle, Clock, Plus, RefreshCw, List, Check, X, LogOut, ChevronRight, DollarSign, Calendar as CalendarIcon, Pencil, Sun, Moon, HelpCircle, Home } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { getMonthlyStats, getWorkplace, markShiftReceived, createShift, updateShift } from '../lib/db';
import { format, parseISO, addDays, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useTheme } from '../hooks/useTheme';
import { useLanguage } from '../hooks/useLanguage';
import ProfileScreen from './ProfileScreen';
import ScreenHelpSheet from '../components/ScreenHelpSheet';
import type { Shift } from '../types';

interface TodayScreenProps {
  onAddShift: () => void;
  onNavigate: (tab: string) => void;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function TodayScreen({ onAddShift, onNavigate }: TodayScreenProps) {
  const { user, shifts, refreshShifts, logout } = useApp();
  const { t, language } = useLanguage();
  const dateLocale = language === 'es-LATAM' ? undefined : ptBR;
  void dateLocale;
  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');

  const allShifts = shifts;

  const todayShifts = useMemo(() =>
    allShifts.filter(s => s.date === todayStr && s.status !== 'cancelado'),
    [allShifts, todayStr]
  );

  const upcomingAll = useMemo(() => {
    return allShifts
      .filter(s => s.date >= todayStr && s.status !== 'cancelado' && s.status !== 'recebido')
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [allShifts, todayStr]);

  const nextShift = upcomingAll[0] || null;
  const upcomingShifts = upcomingAll.slice(1, 3);

  const latestShift = useMemo(() => {
    return [...allShifts].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  }, [allShifts]);

  const stats = useMemo(() =>
    user ? getMonthlyStats(user.id, now.getFullYear(), now.getMonth() + 1) : null,
    [user, shifts]
  );

  const alerts = useMemo(() => {
    const list: {type: string; title: string; desc: string}[] = [];
    const pendingCount = allShifts.filter(s => ['previsto', 'realizado'].includes(s.status)).length;
    const overdueShifts = allShifts.filter(s => s.status === 'atrasado');
    const overdueValue = overdueShifts.reduce((sum, s) => sum + s.expected_value, 0);
    const next7 = new Date(now.getTime() + 7 * 86400000);
    const upcoming7Shifts = allShifts.filter(s => {
        if (!s.payment_due_date) return false;
        const due = parseISO(s.payment_due_date);
        return due >= now && due <= next7 && !['recebido', 'cancelado'].includes(s.status);
    });
    const upcoming7Value = upcoming7Shifts.reduce((sum, s) => sum + s.expected_value, 0);

    if (overdueShifts.length > 0) {
      const label = overdueShifts.length > 1 ? t('pagamentos atrasados') : t('pagamento atrasado');
      list.push({ type: 'overdue', title: `${overdueShifts.length} ${label}`, desc: `${t('Total de')} ${formatCurrency(overdueValue)} ${t('aguardando regularização.')}` });
    }
    if (upcoming7Value > 0) {
      list.push({ type: 'pending', title: `${formatCurrency(upcoming7Value)} ${t('A receber').toLowerCase()}`, desc: t('Plantões realizados aguardando pagamento.') });
    } else if (pendingCount > 0 && overdueShifts.length === 0) {
      const label = pendingCount > 1 ? t('plantões a receber') : t('plantão a receber');
      list.push({ type: 'pending', title: `${pendingCount} ${label}`, desc: t('Plantões realizados aguardando pagamento.') });
    }
    return list;
  }, [allShifts, now, t]);

  const wp = nextShift ? getWorkplace(nextShift.workplace_id) : null;

  function getFirstName(name: string) {
    return name.split(' ')[0];
  }

  // Modals & States
  const [shiftDetails, setShiftDetails] = useState<Shift | null>(null);
  const [showRepetirModal, setShowRepetirModal] = useState(false);
  const [showMarcarPagoModal, setShowMarcarPagoModal] = useState(false);
  const [repDateOpt, setRepDateOpt] = useState<'hoje' | 'amanha'>('hoje');
  const [selectedPending, setSelectedPending] = useState<string[]>([]);
  
  const [showOverdueSheet, setShowOverdueSheet] = useState(false);
  const [showPendingSheet, setShowPendingSheet] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();
  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);
  function showToast(msg: string) {
    setToastMsg(msg);
  }

  const pendingShifts = useMemo(() => {
    return allShifts.filter(s => ['realizado', 'atrasado'].includes(s.status)).sort((a,b) => a.date.localeCompare(b.date));
  }, [allShifts]);

  const totalSelected = useMemo(() => {
    return pendingShifts.filter(s => selectedPending.includes(s.id)).reduce((sum, s) => sum + s.expected_value, 0);
  }, [pendingShifts, selectedPending]);

  async function handleMarkDone(shift: Shift) {
    const { updateShift } = await import('../lib/db');
    updateShift(shift.id, { status: 'realizado' });
    refreshShifts();
    setShiftDetails(null);
    showToast(`Plantão concluído! ${formatCurrency(shift.expected_value)} adicionados aos ganhos.`);
  }

  async function handleCancelShift(shift: Shift) {
    const { updateShift } = await import('../lib/db');
    updateShift(shift.id, { status: 'cancelado' });
    refreshShifts();
    setShiftDetails(null);
    showToast('Plantão cancelado com sucesso.');
  }

  function handleConfirmRepeat() {
    if (!latestShift || !user) return;
    const targetDateStr = repDateOpt === 'hoje' ? todayStr : format(addDays(now, 1), 'yyyy-MM-dd');
    
    const startDt = new Date(parseISO(latestShift.start_datetime));
    const endDt = new Date(parseISO(latestShift.end_datetime));
    
    const [y, m, d] = targetDateStr.split('-').map(Number);
    startDt.setFullYear(y, m - 1, d);
    endDt.setFullYear(y, m - 1, d + (endDt.getDate() - new Date(parseISO(latestShift.start_datetime)).getDate()));
    
    createShift({
      user_id: user.id,
      workplace_id: latestShift.workplace_id,
      template_id: latestShift.template_id,
      title: latestShift.title,
      date: targetDateStr,
      start_datetime: startDt.toISOString(),
      end_datetime: endDt.toISOString(),
      duration_hours: latestShift.duration_hours,
      expected_value: latestShift.expected_value,
      status: 'previsto',
      payment_due_date: latestShift.payment_due_date,
      notes: latestShift.notes
    });
    
    refreshShifts();
    setShowRepetirModal(false);
    showToast('Plantão duplicado com sucesso!');
  }

  function handleConfirmPaid() {
    selectedPending.forEach(id => {
        const s = pendingShifts.find(x => x.id === id);
        if (s) markShiftReceived(id, s.expected_value);
    });
    refreshShifts();
    setSelectedPending([]);
    setShowMarcarPagoModal(false);
    showToast('Plantões marcados como recebidos!');
  }

  const overdueShiftsData = useMemo(() =>
    allShifts.filter(s => s.status === 'atrasado').sort((a, b) => a.date.localeCompare(b.date)),
    [allShifts]
  );

  const pendingShiftsData = useMemo(() =>
    allShifts
      .filter(s => ['previsto', 'realizado'].includes(s.status))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [allShifts]
  );

  function daysOverdue(shift: Shift): number {
    if (shift.payment_due_date) {
      const due = parseISO(shift.payment_due_date);
      const diff = differenceInDays(now, due);
      return diff > 0 ? diff : 0;
    }
    return differenceInDays(now, parseISO(shift.date));
  }

  async function handleRegisterPayment(shift: Shift) {
    updateShift(shift.id, {
      status: 'recebido',
      received_value: shift.expected_value,
      payment_received_date: new Date().toISOString(),
    });
    refreshShifts();
    showToast(`Pagamento registrado: ${formatCurrency(shift.expected_value)}`);
  }

  const anyModalOpen = shiftDetails || showRepetirModal || showMarcarPagoModal || showOverdueSheet || showPendingSheet;

  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden bg-white">

      {/* Header */}
      <header className="px-5 pt-7 pb-2 shrink-0 bg-white">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                {format(now, "EEEE, d 'de' MMMM", { locale: ptBR })}
              </p>
              <h1 className="text-[20px] font-black text-slate-900 tracking-tight leading-tight">
                {t(getGreeting())}, Dr. {getFirstName(user?.name || 'Médico')}
              </h1>
              <p className="text-[12px] text-slate-500 mt-0.5">
                {t('Você tem')} <strong className="text-slate-700">{todayShifts.length} {todayShifts.length !== 1 ? t('plantões') : t('plantão')}</strong> {t('hoje.')}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-3">
              <button
                onClick={() => setShowHelp(true)}
                className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all active:scale-95"
                title="Sobre esta tela"
              >
                <HelpCircle size={16} strokeWidth={2.5} />
              </button>
              <button
                onClick={toggleTheme}
                className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-all active:scale-95"
                title={theme === 'dark' ? t('Modo claro') : t('Modo escuro')}
              >
                {theme === 'dark' ? <Sun size={15} strokeWidth={2.25} /> : <Moon size={15} strokeWidth={2.25} />}
              </button>
              <button
                onClick={() => { if (confirm(t('Deseja sair da sua conta?'))) logout(); }}
                className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-red-50 hover:text-red-500 transition-all active:scale-95"
                title={t('Sair')}
              >
                <LogOut size={15} strokeWidth={2} />
              </button>
              <button
                onClick={() => setShowProfile(true)}
                className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-all active:scale-95"
                title={t('Editar perfil')}
              >
                <Pencil size={14} strokeWidth={2.25} />
              </button>
            </div>
          </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-5 pb-24 hide-scrollbar bg-white">

          {/* Próximo Plantão */}
          <div className="mt-3 mb-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                {nextShift?.date === todayStr ? t('Próximo Plantão (Hoje)') : t('Próximo Plantão')}
              </p>

              {nextShift && wp ? (
                <button onClick={() => setShiftDetails(nextShift)} className="hero-shift-card w-full text-left bg-[#4b80e5] rounded-[20px] p-4 text-white shadow-lg shadow-blue-500/20 relative overflow-hidden flex flex-col justify-between min-h-[120px] cursor-pointer">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-10 -mt-10 blur-2xl pointer-events-none"></div>

                    <div className="relative z-10 flex justify-between items-start">
                        <div>
                            <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider inline-block mb-1.5">
                              {nextShift.date === todayStr ? t('Hoje') : format(parseISO(nextShift.date), 'dd/MM')}
                            </span>
                            <h2 className="text-[19px] font-bold mb-0.5 leading-tight tracking-tight">{wp.name}</h2>
                            <p className="text-blue-100 text-[12px]">{nextShift.title}</p>
                        </div>
                    </div>

                    <div className="relative z-10 flex justify-between items-end mt-3">
                        <div>
                            <p className="text-[9px] text-blue-200/80 uppercase tracking-widest font-bold mb-0.5">{t('Horário')}</p>
                            <p className="font-bold text-[14px] tracking-tight">{format(parseISO(nextShift.start_datetime), 'HH:mm')}–{format(parseISO(nextShift.end_datetime), 'HH:mm')}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] text-blue-200/80 uppercase tracking-widest font-bold mb-0.5">{t('Valor')}</p>
                            <p className="font-bold text-[20px] tracking-tight leading-none">{formatCurrency(nextShift.expected_value)}</p>
                        </div>
                    </div>
                </button>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-100 p-5 text-center shadow-sm">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-2">
                    <Clock size={18} className="text-blue-500" />
                  </div>
                  <h3 className="font-semibold text-gray-900 text-sm mb-0.5">{t('Nenhum plantão hoje')}</h3>
                  <p className="text-gray-500 text-xs mb-3">{t('Aproveite o dia de folga! 🎉')}</p>
                  <button onClick={onAddShift} className="bg-[#4b80e5] text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-sm hover:bg-blue-600 transition active:scale-95 flex items-center gap-2 mx-auto">
                    <Plus size={14} /> {t('Adicionar plantão')}
                  </button>
                </div>
              )}
          </div>

          {/* Resumo do Mês */}
          <div className="mb-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{format(now, "MMMM 'de' yyyy", { locale: ptBR })}</p>
              <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white px-3 py-2.5 rounded-xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                      <p className="text-[11px] text-slate-500 font-medium">{t('Previsto')}</p>
                      <p className="text-[15px] font-bold text-slate-900 tracking-tight">{formatCurrency(stats?.expected || 0)}</p>
                  </div>
                  <div className="bg-white px-3 py-2.5 rounded-xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                      <p className="text-[11px] text-slate-500 font-medium">{t('Recebido')}</p>
                      <p className="text-[15px] font-bold text-emerald-500 tracking-tight">{formatCurrency(stats?.received || 0)}</p>
                  </div>
                  <div className="bg-white px-3 py-2.5 rounded-xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                      <p className="text-[11px] text-slate-500 font-medium">{t('A receber')}</p>
                      <p className="text-[15px] font-bold text-blue-500 tracking-tight">{formatCurrency(stats?.pending || 0)}</p>
                  </div>
                  <div className="bg-white px-3 py-2.5 rounded-xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                      <p className="text-[11px] text-slate-500 font-medium">{t('Atrasado')}</p>
                      <p className="text-[15px] font-bold text-red-500 tracking-tight">{formatCurrency(stats?.overdue || 0)}</p>
                  </div>
              </div>
          </div>

          {/* Alertas */}
          {alerts.length > 0 && (
              <div className="space-y-2 mb-4">
                  {alerts.map((alert, i) => {
                    const isOverdue = alert.type === 'overdue';
                    const isPending = alert.type === 'pending';
                    const pendingClickable = isPending && pendingShiftsData.length > 0;
                    const clickable = isOverdue || pendingClickable;
                    const Wrapper = clickable ? 'button' : 'div';
                    const handleClick = isOverdue
                      ? () => setShowOverdueSheet(true)
                      : pendingClickable
                        ? () => setShowPendingSheet(true)
                        : undefined;
                    return (
                      <Wrapper
                        key={i}
                        {...(handleClick ? { onClick: handleClick } : {})}
                        className={`w-full text-left border p-2.5 rounded-xl flex items-start gap-2.5 transition-all ${
                          isOverdue
                            ? 'bg-red-50/50 border-red-100 active:scale-[0.99] hover:border-red-200 hover:bg-red-50'
                            : pendingClickable
                              ? 'bg-blue-50/50 border-blue-100 active:scale-[0.99] hover:border-blue-200 hover:bg-blue-50'
                              : 'bg-blue-50/50 border-blue-100'
                        }`}
                      >
                          <div className={`mt-0.5 ${isOverdue ? 'text-red-500' : 'text-blue-500'}`}>
                              {isOverdue ? <AlertCircle size={18} /> : <Bell size={18} />}
                          </div>
                          <div className="flex-1 min-w-0">
                              <p className={`text-[13px] font-bold ${isOverdue ? 'text-red-800' : 'text-blue-800'}`}>{alert.title}</p>
                              <p className={`text-[11px] mt-0.5 ${isOverdue ? 'text-red-600/80' : 'text-blue-600/80'}`}>{alert.desc}</p>
                          </div>
                          {clickable && (
                            <ChevronRight size={15} strokeWidth={2.5}
                              className={`mt-0.5 shrink-0 ${isOverdue ? 'text-red-400' : 'text-blue-400'}`} />
                          )}
                      </Wrapper>
                    );
                  })}
              </div>
          )}

          {/* Atalhos */}
          <div className="mb-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t('Atalhos')}</p>
              <div className="grid grid-cols-2 gap-2">
                  <button onClick={onAddShift} className="quick-action-btn">
                      <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                          <Plus size={16} strokeWidth={2.5} />
                      </div>
                      <span className="text-sm font-semibold text-slate-700">{t('Novo plantão')}</span>
                  </button>

                  <button onClick={() => setShowRepetirModal(true)} className="quick-action-btn">
                      <div className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0">
                          <RefreshCw size={16} strokeWidth={2} />
                      </div>
                      <div className="flex flex-col text-left">
                          <span className="text-sm font-semibold text-slate-700 leading-tight">{t('Repetir último')}</span>
                          <span className="text-[9.5px] text-slate-400 font-medium truncate w-24">
                            {latestShift ? getWorkplace(latestShift.workplace_id)?.name : t('Nenhum plantão')}
                          </span>
                      </div>
                  </button>

                  <button onClick={() => setShowMarcarPagoModal(true)} className="quick-action-btn">
                      <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
                          <Check size={16} strokeWidth={2.5} />
                      </div>
                      <span className="text-sm font-semibold text-slate-700">{t('Marcar pago')}</span>
                  </button>

                  <button onClick={() => onNavigate('calendario')} className="quick-action-btn">
                      <div className="w-7 h-7 rounded-full bg-violet-50 text-violet-500 flex items-center justify-center shrink-0">
                          <List size={16} strokeWidth={2} />
                      </div>
                      <span className="text-sm font-semibold text-slate-700">{t('Ver agenda')}</span>
                  </button>
              </div>
          </div>

          {/* Próximos Plantões */}
          {upcomingShifts.length > 0 && (
            <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t('Próximos Plantões')}</p>
                <div className="space-y-2">
                    {upcomingShifts.map(s => {
                        const wpp = getWorkplace(s.workplace_id);
                        if (!wpp) return null;
                        return (
                          <button key={s.id} onClick={() => setShiftDetails(s)} className="card-interactive w-full text-left bg-white px-3 py-2.5 rounded-xl border border-slate-100 shadow-sm relative overflow-hidden flex items-center justify-between gap-2">
                              <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: wpp.color }}></div>
                              <div className="pl-2 min-w-0 flex-1">
                                  <h4 className="font-bold text-slate-800 text-[13px] leading-tight truncate">{wpp.name}</h4>
                                  <p className="text-[11px] text-slate-400 mt-0.5">{format(parseISO(s.start_datetime), "d MMM · HH:mm", { locale: ptBR })}–{format(parseISO(s.end_datetime), "HH:mm")}</p>
                              </div>
                              <span className="font-bold text-slate-900 text-[13px] tracking-tight shrink-0">{formatCurrency(s.expected_value)}</span>
                          </button>
                        );
                    })}
                </div>
            </div>
          )}
      </main>

      {/* Backdrop Global (sem blur) */}
      <div
        onClick={() => { setShiftDetails(null); setShowRepetirModal(false); setShowMarcarPagoModal(false); }}
        className={`absolute inset-0 z-40 bg-slate-900/40 transition-opacity duration-300 ${anyModalOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      </div>

      {/* MODAL: DETALHES DO PLANTÃO */}
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${shiftDetails ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className={`bg-white w-full max-w-sm rounded-[24px] shadow-2xl transition-transform duration-300 flex flex-col max-h-[90vh] ${shiftDetails ? 'scale-100' : 'scale-95'}`}>
          
          {shiftDetails && (
            <>
                <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
                    <h2 className="text-xl font-bold text-slate-900">Detalhes do Plantão</h2>
                    <button onClick={() => setShiftDetails(null)} className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition active:scale-95">
                        <X size={16} />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto hide-scrollbar">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mb-2 inline-block">
                              {shiftDetails.date === todayStr ? 'Hoje' : format(parseISO(shiftDetails.date), 'dd/MM/yyyy')}
                            </span>
                            <h2 className="text-xl font-bold text-slate-900 leading-tight">{getWorkplace(shiftDetails.workplace_id)?.name}</h2>
                            <p className="text-sm text-slate-500 mt-0.5">{format(parseISO(shiftDetails.start_datetime), 'HH:mm')} – {format(parseISO(shiftDetails.end_datetime), 'HH:mm')} ({shiftDetails.duration_hours}h)</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-0.5">Valor</p>
                            <p className="text-2xl font-black text-slate-900 leading-none">{formatCurrency(shiftDetails.expected_value)}</p>
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                        <button onClick={() => handleMarkDone(shiftDetails)} className="w-full py-3.5 rounded-xl bg-blue-600 text-white text-sm font-bold shadow-sm hover:bg-blue-700 transition active:scale-95 flex justify-center items-center gap-2">
                            <Check size={20} strokeWidth={2.5} />
                            Marcar como Concluído
                        </button>
                        
                        <div className="flex gap-3">
                            <button onClick={() => { setShiftDetails(null); onNavigate('calendario'); }} className="flex-1 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-bold shadow-sm hover:bg-slate-50 transition active:scale-95 flex justify-center items-center gap-2">
                                Editar
                            </button>
                            
                            <button onClick={() => handleCancelShift(shiftDetails)} className="flex-1 py-3 rounded-xl bg-red-50 text-red-600 text-sm font-bold hover:bg-red-100 transition active:scale-95 flex justify-center items-center gap-2">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            </>
          )}
          </div>
      </div>

      {/* MODAL: CONFIRMAR REPETIÇÃO */}
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${showRepetirModal ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className={`bg-white w-full max-w-sm rounded-[24px] shadow-2xl transition-transform duration-300 flex flex-col max-h-[90vh] ${showRepetirModal ? 'scale-100' : 'scale-95'}`}>
              <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
                  <div>
                      <h2 className="text-xl font-bold text-slate-900">Repetir Plantão</h2>
                      <p className="text-xs text-slate-500 mt-0.5">Confirme os dados a duplicar</p>
                  </div>
                  <button onClick={() => setShowRepetirModal(false)} className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition active:scale-95">
                      <X size={16} />
                  </button>
              </div>
          
              <div className="p-5 overflow-y-auto hide-scrollbar">
                  {latestShift ? (
                    <div className="bg-[#4b80e5] p-4 rounded-[16px] text-white shadow-lg shadow-blue-500/20 mb-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-white opacity-10 rounded-full -mr-8 -mt-8 blur-xl pointer-events-none"></div>
                        <div className="relative z-10 flex justify-between items-start">
                            <div>
                                <h4 className="font-bold text-[16px] leading-tight tracking-tight">{getWorkplace(latestShift.workplace_id)?.name}</h4>
                                <p className="text-blue-100 text-[12px] mt-0.5">{latestShift.title}</p>
                            </div>
                        </div>
                        <div className="relative z-10 flex justify-between items-end mt-4 pt-3 border-t border-white/10">
                            <div>
                                <p className="text-[8px] text-blue-200/80 uppercase tracking-widest font-bold mb-0.5">Horário</p>
                                <p className="font-bold text-[13px] tracking-tight">{format(parseISO(latestShift.start_datetime), 'HH:mm')}–{format(parseISO(latestShift.end_datetime), 'HH:mm')}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[8px] text-blue-200/80 uppercase tracking-widest font-bold mb-0.5">Valor a repetir</p>
                                <p className="font-bold text-[20px] tracking-tight leading-none">{formatCurrency(latestShift.expected_value)}</p>
                            </div>
                        </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 mb-4 text-center">Nenhum plantão anterior encontrado.</p>
                  )}

                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Para qual data?</label>
                  <div className="grid grid-cols-2 gap-2 mb-6">
                      <button onClick={() => setRepDateOpt('hoje')} className={`font-semibold text-sm py-3 rounded-xl border transition ${repDateOpt === 'hoje' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>Hoje</button>
                      <button onClick={() => setRepDateOpt('amanha')} className={`font-semibold text-sm py-3 rounded-xl border transition ${repDateOpt === 'amanha' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>Amanhã</button>
                  </div>

                  <div className="flex gap-3">
                      <button onClick={() => setShowRepetirModal(false)} className="flex-1 py-3.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-bold shadow-sm hover:bg-slate-50 transition active:scale-95">Cancelar</button>
                      <button onClick={handleConfirmRepeat} disabled={!latestShift} className="flex-[2] py-3.5 rounded-xl bg-blue-600 text-white text-sm font-bold shadow-sm hover:bg-blue-700 transition active:scale-95 disabled:opacity-50">Confirmar</button>
                  </div>
              </div>
          </div>
      </div>

      {/* MODAL: MARCAR COMO PAGO */}
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${showMarcarPagoModal ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className={`bg-white w-full max-w-sm rounded-[24px] shadow-2xl transition-transform duration-300 flex flex-col max-h-[80vh] ${showMarcarPagoModal ? 'scale-100' : 'scale-95'}`}>
              <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
                  <div>
                      <h2 className="text-xl font-bold text-slate-900">Confirmar Pagamento</h2>
                      <p className="text-xs text-slate-500 mt-0.5">Selecione os plantões recebidos</p>
                  </div>
                  <button onClick={() => setShowMarcarPagoModal(false)} className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition active:scale-95">
                      <X size={16} />
                  </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3 hide-scrollbar bg-slate-50/50">
                  {pendingShifts.length === 0 ? (
                    <p className="text-center text-sm text-slate-500 py-4">Nenhum plantão pendente de pagamento.</p>
                  ) : pendingShifts.map(s => {
                    const wpp = getWorkplace(s.workplace_id);
                    const isSelected = selectedPending.includes(s.id);
                    return (
                      <label key={s.id} className={`flex items-center justify-between p-4 bg-white border rounded-2xl cursor-pointer transition-colors ${isSelected ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-200 hover:border-emerald-500'}`}>
                          <div className="flex items-center gap-3">
                              <div className="relative flex items-center justify-center w-5 h-5">
                                  <input 
                                    type="checkbox" 
                                    checked={isSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) setSelectedPending([...selectedPending, s.id]);
                                      else setSelectedPending(selectedPending.filter(id => id !== s.id));
                                    }}
                                    className="peer appearance-none w-5 h-5 border-2 border-slate-300 rounded-md checked:bg-emerald-500 checked:border-emerald-500 transition-colors" 
                                  />
                                  <Check size={12} strokeWidth={3} className="absolute text-white pointer-events-none opacity-0 peer-checked:opacity-100" />
                              </div>
                              <div>
                                  <h4 className="font-bold text-slate-800 text-sm">{wpp?.name}</h4>
                                  <p className="text-xs text-slate-500">{format(parseISO(s.date), 'EEE, dd MMM', { locale: ptBR })}</p>
                              </div>
                          </div>
                          <span className="font-bold text-slate-900">{formatCurrency(s.expected_value)}</span>
                      </label>
                    );
                  })}
              </div>

              <div className="p-5 border-t border-slate-100 bg-white rounded-b-[24px]">
                  <button 
                    onClick={handleConfirmPaid} 
                    disabled={selectedPending.length === 0}
                    className="w-full py-3.5 rounded-xl bg-emerald-500 text-white text-sm font-bold shadow-sm hover:bg-emerald-600 transition active:scale-95 flex justify-center items-center gap-2 disabled:opacity-50 disabled:bg-slate-300"
                  >
                      {selectedPending.length > 0 ? `Confirmar (${formatCurrency(totalSelected)})` : 'Confirmar Recebimento'}
                  </button>
              </div>
          </div>
      </div>

      {/* MODAL: PAGAMENTOS ATRASADOS */}
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${showOverdueSheet ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setShowOverdueSheet(false)}>
        <div className={`bg-white w-full max-w-sm rounded-[24px] shadow-2xl overflow-hidden transition-transform duration-300 flex flex-col max-h-[80vh] ${showOverdueSheet ? 'scale-100' : 'scale-95'}`}
          onClick={e => e.stopPropagation()}>

          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Pagamentos Atrasados</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {overdueShiftsData.length} {overdueShiftsData.length !== 1 ? 'plantões' : 'plantão'} · <span className="text-red-500 font-semibold">{formatCurrency(overdueShiftsData.reduce((s, x) => s + x.expected_value, 0))}</span>
              </p>
            </div>
            <button onClick={() => setShowOverdueSheet(false)}
              className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition active:scale-95">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-3 hide-scrollbar bg-slate-50/50">
            {overdueShiftsData.map(shift => {
              const wp = getWorkplace(shift.workplace_id);
              if (!wp) return null;
              const days = daysOverdue(shift);
              const hasDueDate = !!shift.payment_due_date;
              return (
                <div key={shift.id} className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-xs"
                      style={{ background: `${wp.color}20`, color: wp.color }}>
                      {wp.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm truncate">{wp.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                        <CalendarIcon size={10} strokeWidth={2.5} />
                        Plantão em {format(parseISO(shift.date), "d 'de' MMM", { locale: ptBR })}
                      </p>
                    </div>
                    <p className="font-bold text-slate-900 text-sm shrink-0">{formatCurrency(shift.expected_value)}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-0.5">
                        {hasDueDate ? 'Vencimento' : 'Plantão em'}
                      </p>
                      <p className="text-[13px] font-bold text-slate-800">
                        {hasDueDate
                          ? format(parseISO(shift.payment_due_date!), "d 'de' MMM", { locale: ptBR })
                          : format(parseISO(shift.date), "d 'de' MMM", { locale: ptBR })}
                      </p>
                    </div>
                    <div className="bg-red-50 rounded-xl px-3 py-2 border border-red-100">
                      <p className="text-[10px] text-red-400 uppercase tracking-wider font-bold mb-0.5">Em atraso</p>
                      <p className="text-[13px] font-black text-red-600">
                        {days > 0 ? `${days} ${days !== 1 ? 'dias' : 'dia'}` : 'Hoje'}
                      </p>
                    </div>
                  </div>

                  {shift.notes && (
                    <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-2.5 py-2 border border-slate-100 mb-3">
                      {shift.notes}
                    </p>
                  )}

                  <button
                    onClick={() => { handleRegisterPayment(shift); if (overdueShiftsData.length <= 1) setShowOverdueSheet(false); }}
                    className="w-full py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-emerald-600 transition active:scale-[0.98] shadow-sm"
                  >
                    <DollarSign size={13} strokeWidth={2.5} />
                    Registrar Pagamento
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* MODAL: PLANTÕES A RECEBER */}
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${showPendingSheet ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setShowPendingSheet(false)}>
        <div className={`bg-white w-full max-w-sm rounded-[24px] shadow-2xl overflow-hidden transition-transform duration-300 flex flex-col max-h-[80vh] ${showPendingSheet ? 'scale-100' : 'scale-95'}`}
          onClick={e => e.stopPropagation()}>

          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Plantões a Receber</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {pendingShiftsData.length} {pendingShiftsData.length !== 1 ? 'plantões' : 'plantão'} · <span className="text-blue-600 font-semibold">{formatCurrency(pendingShiftsData.reduce((s, x) => s + x.expected_value, 0))}</span>
              </p>
            </div>
            <button onClick={() => setShowPendingSheet(false)}
              className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition active:scale-95">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2 hide-scrollbar bg-slate-50/50">
            {pendingShiftsData.map(shift => {
              const wpp = getWorkplace(shift.workplace_id);
              if (!wpp) return null;
              const isRealizado = shift.status === 'realizado';
              const statusLabel = isRealizado ? 'Realizado' : 'Agendado';
              const statusClass = isRealizado ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500';
              const dueLabel = shift.payment_due_date
                ? `Vence ${format(parseISO(shift.payment_due_date), "dd/MM", { locale: ptBR })}`
                : null;
              return (
                <div key={shift.id} className="bg-white rounded-xl p-3 border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold text-[11px]"
                      style={{ background: `${wpp.color}20`, color: wpp.color }}>
                      {wpp.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 text-[13px] truncate leading-tight">{wpp.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] text-slate-500">{format(parseISO(shift.date), "dd/MM", { locale: ptBR })}</span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${statusClass}`}>{statusLabel}</span>
                        {dueLabel && <span className="text-[10px] text-slate-400">· {dueLabel}</span>}
                      </div>
                    </div>
                    <p className="font-bold text-slate-900 text-[13px] tabular-nums shrink-0">{formatCurrency(shift.expected_value)}</p>
                  </div>
                  {isRealizado ? (
                    <button
                      onClick={() => { handleRegisterPayment(shift); if (pendingShiftsData.length <= 1) setShowPendingSheet(false); }}
                      className="mt-2.5 w-full py-2 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-emerald-100 transition active:scale-[0.98]"
                    >
                      <DollarSign size={12} strokeWidth={2.5} />
                      Registrar Pagamento
                    </button>
                  ) : (
                    <button
                      onClick={() => handleMarkDone(shift)}
                      className="mt-2.5 w-full py-2 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-blue-100 transition active:scale-[0.98]"
                    >
                      <Check size={12} strokeWidth={3} />
                      Marcar como Concluído
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* TELA: PERFIL */}
      {showProfile && (
        <ProfileScreen
          onClose={() => setShowProfile(false)}
          onSaved={() => showToast('Perfil atualizado com sucesso!')}
        />
      )}

      {/* DRILLDOWN: SOBRE A TELA HOJE */}
      <ScreenHelpSheet
        open={showHelp}
        onClose={() => setShowHelp(false)}
        icon={<Home size={20} className="text-blue-600" />}
        pretitle="Hoje"
        title="O que tem aqui"
        items={[
          { title: 'Próximo plantão', desc: 'Veja seu plantão mais próximo com horário e valor em destaque.' },
          { title: 'Resumo do mês', desc: 'Acompanhe previsto, recebido, a receber e atrasado num relance.' },
          { title: 'Alertas de pagamento', desc: 'Toque para ver plantões a receber e pagamentos atrasados.' },
          { title: 'Atalhos rápidos', desc: 'Adicione, repita, marque como pago ou abra a agenda em 1 toque.' },
        ]}
        proPitch="No Pro você desbloqueia gráficos de evolução, metas, alertas de atraso e relatórios fiscais completos."
        proFeature="charts"
      />

      {/* Toast Notification */}
      <div className={`absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-4 py-2.5 rounded-full shadow-lg text-xs font-medium flex items-center gap-2 z-[60] pointer-events-none whitespace-nowrap transition-all duration-300 ${toastMsg ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
          <Check size={16} className="text-emerald-400" />
          <span>{toastMsg}</span>
      </div>

    </div>
  );
}
