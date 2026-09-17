import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { X, Check, LogOut, DollarSign, Sun, Moon, HelpCircle, Home, Plus, type LucideIcon } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { getMonthlyStats, getWorkplace, markShiftReceived, createShift, updateShift } from '../lib/db';
import { format, parseISO, addDays, differenceInDays, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useTheme } from '../hooks/useTheme';
import { useLanguage } from '../hooks/useLanguage';
import ProfileScreen from './ProfileScreen';
import ScreenHelpSheet from '../components/ScreenHelpSheet';
import MonthSummaryCard from '../components/MonthSummaryCard';
import ConfirmDialog from '../components/ConfirmDialog';
import { usePlan } from '../contexts/PlanContext';
import { PLAN_META } from '../lib/plans';
import type { Shift } from '../types';
import { STATUS_LABELS, FISCAL_NATURE_LABELS } from '../types';

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

/* ---------------------------------------------------------------------------
 * Formatação
 * ------------------------------------------------------------------------- */

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** "R$ 1.400" — o valor da placa vai sem ",00" (centavos só quando existem). */
function formatCurrencyShort(v: number) {
  const cents = Math.round(v * 100) % 100 !== 0;
  return v.toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
    minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0,
  });
}

/** Separa "R$ 1.400" de ",00" para o centavo ir em corpo menor. */
function splitCurrency(v: number): [string, string] {
  const full = formatCurrency(v);
  const i = full.lastIndexOf(',');
  return i === -1 ? [full, ''] : [full.slice(0, i), full.slice(i)];
}

/** 12 → "12", 6.5 → "6,5". */
function formatHours(h: number) {
  return h.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/** "07:00 — 19:00" (travessão com espaços, como no design). */
function timeRange(shift: Shift) {
  return `${format(parseISO(shift.start_datetime), 'HH:mm')} — ${format(parseISO(shift.end_datetime), 'HH:mm')}`;
}

/** "Terça, 16 de setembro". */
function longDate(date: Date) {
  const s = format(date, "EEEE, d 'de' MMMM", { locale: ptBR }).replace('-feira', '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Frase de status por extenso: "O próximo é em dois dias." */
const PT_NUMBER_WORDS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];

/** Partes do nome sem título ("Dra. Ana Souza" → ["Ana", "Souza"]), para não saudar "Dr. Dra.". */
function nameParts(name: string) {
  return name.trim().split(/\s+/).filter(p => p && !/^(dr|dra|doutor|doutora)\.?$/i.test(p));
}

/** Iniciais do avatar: "Marcos Andrade" → "MA"; nome único "Marcos" → "MA". */
function getInitials(name: string) {
  const parts = nameParts(name);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] || name || 'M').slice(0, 2).toUpperCase();
}

/* ---------------------------------------------------------------------------
 * Peças visuais do design (ícones 20px / traço 1.5, pedra com enquadramento)
 * ------------------------------------------------------------------------- */

/** Ícone com a geometria exata do design (sem preenchimento, traço fino). */
function Glyph({ size = 20, stroke = 1.5, className, children }: {
  size?: number; stroke?: number; className?: string; children: ReactNode;
}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} className={className} aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICON = {
  plus: <path d="M12 5v14M5 12h14" />,
  repeat: <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4.5V9h-4.5" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" /></>,
  chevron: <path d="M9 6l6 6-6 6" />,
  dots: <><circle cx="12" cy="6" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="18" r="1.4" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
};

/**
 * Pedra com o enquadramento exato de cada peça do design (tamanho e posição
 * da textura diferem entre a placa da Hoje e o cabeçalho do detalhe).
 * Pai precisa ser `relative`.
 */
function Stone({ size, position, filter, veil }: {
  size: string; position: string; filter: string; veil: string;
}) {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-[#2f6f60]">
      <div
        className="absolute inset-0"
        style={{ backgroundImage: 'url(/marble.webp)', backgroundSize: size, backgroundPosition: position, filter }}
      />
      <div className="absolute inset-0" style={{ background: veil }} />
    </div>
  );
}

/** Botão fechar de vidro sobre a pedra (34px, borda .3, fundo .14). */
function GlassClose({ onClick }: { onClick: () => void }) {
  const { t } = useLanguage();
  return (
    <button
      onClick={onClick}
      className="w-[34px] h-[34px] shrink-0 rounded-full border border-white/30 bg-white/[0.14] hover:bg-white/[0.26] text-white flex items-center justify-center p-0 transition-colors"
      aria-label={t('Fechar')}
      title={t('Fechar')}
    >
      <Glyph size={15} stroke={1.6}>{ICON.close}</Glyph>
    </button>
  );
}

/** Item do menu da placa (Sobre esta tela, tema, sair). */
function PlateMenuItem({ icon: Icon, label, onClick, danger = false }: {
  icon: LucideIcon; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`w-full h-11 flex items-center gap-3 px-4 text-left text-[14px] font-normal hover:bg-slate-50 transition-colors ${danger ? 'text-red-600' : 'text-slate-700'}`}
    >
      <Icon size={18} strokeWidth={1.5} />
      {label}
    </button>
  );
}

/** Aviso de atenção (atraso = terracota; a receber = jade). Sem ícone, como no design. */
function Notice({ tone, title, desc, onClick }: {
  tone: 'warn' | 'info'; title: string; desc: string; onClick?: () => void;
}) {
  const warn = tone === 'warn';
  const body = (
    <>
      <span className="flex-1 min-w-0">
        <span className="block text-[14.5px] font-semibold tracking-[-0.01em] text-slate-900">{title}</span>
        <span className="block mt-[3px] text-[12.5px] font-normal text-slate-500">{desc}</span>
      </span>
      {onClick && (
        <Glyph size={18} className={`shrink-0 ${warn ? 'text-red-600' : 'text-blue-600'}`}>{ICON.chevron}</Glyph>
      )}
    </>
  );
  const cls = `notice ${warn ? 'notice-warn' : ''} w-full items-center gap-3.5 py-4 pr-4 pl-[18px] text-left transition-colors`;
  return onClick ? (
    // hover: #F5E9E3 (design) / jade pálido — ambos têm override no modo escuro
    <button onClick={onClick} className={`${cls} ${warn ? 'hover:bg-red-100' : 'hover:bg-emerald-100'}`}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Rótulo de seção do design: sentença 12.5/400 cinza, sem filete. */
function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[12.5px] font-normal text-slate-500 ${className}`}>{children}</p>;
}

/* Caixa dos modais centrados: 14px das laterais, raio 28, sombra elevada. */
const MODAL_WRAP = 'fixed inset-0 z-50 flex items-center justify-center p-3.5 leading-[normal] transition-all duration-300';
const MODAL_BOX = 'bg-white w-full max-w-[402px] rounded-[28px] overflow-hidden transition-transform duration-300 flex flex-col';
const MODAL_SHADOW = { boxShadow: '0 40px 80px -30px rgba(7,56,45,.5)' };

export default function TodayScreen({ onAddShift, onNavigate }: TodayScreenProps) {
  const { user, shifts, refreshShifts, logout } = useApp();
  const { t, language } = useLanguage();
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
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_datetime.localeCompare(b.start_datetime));
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

  const wp = nextShift ? getWorkplace(nextShift.workplace_id) : null;

  function getFirstName(name: string) {
    return nameParts(name)[0] || name.split(' ')[0];
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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const { plan, gate } = usePlan();
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

  function handleMarkDone(shift: Shift) {
    updateShift(shift.id, { status: 'realizado' });
    refreshShifts();
    setShiftDetails(null);
    showToast(`${t('Plantão concluído.')} ${formatCurrency(shift.expected_value)} ${t('somados aos ganhos.')}`);
  }

  function handleCancelShift(shift: Shift) {
    updateShift(shift.id, { status: 'cancelado' });
    refreshShifts();
    setShiftDetails(null);
    showToast(t('Plantão cancelado.'));
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
    showToast(t('Plantão repetido.'));
  }

  function handleConfirmPaid() {
    selectedPending.forEach(id => {
        const s = pendingShifts.find(x => x.id === id);
        if (s) markShiftReceived(id, s.expected_value);
    });
    refreshShifts();
    setSelectedPending([]);
    setShowMarcarPagoModal(false);
    showToast(t('Plantões marcados como recebidos.'));
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

  function handleRegisterPayment(shift: Shift) {
    updateShift(shift.id, {
      status: 'recebido',
      received_value: shift.expected_value,
      payment_received_date: new Date().toISOString(),
    });
    refreshShifts();
    showToast(`${t('Pagamento registrado:')} ${formatCurrency(shift.expected_value)}`);
  }

  /* ---- Avisos ---------------------------------------------------------- */

  // Atraso: "1 pagamento atrasado" / "R$ 1.100,00 · Hospital São Marcos · 12 dias"
  let overdueNotice: { title: string; desc: string } | null = null;
  if (overdueShiftsData.length > 0) {
    const n = overdueShiftsData.length;
    const total = overdueShiftsData.reduce((sum, s) => sum + s.expected_value, 0);
    const placeIds = [...new Set(overdueShiftsData.map(s => s.workplace_id))];
    const placeLabel = placeIds.length === 1
      ? (getWorkplace(placeIds[0])?.name ?? '')
      : `${placeIds.length} ${t('locais')}`;
    const maxDays = Math.max(...overdueShiftsData.map(daysOverdue));
    const daysLabel = maxDays > 0
      ? `${n > 1 ? `${t('até')} ` : ''}${maxDays} ${maxDays !== 1 ? t('dias') : t('dia')}`
      : '';
    overdueNotice = {
      title: `${n} ${n > 1 ? t('pagamentos atrasados') : t('pagamento atrasado')}`,
      desc: [formatCurrency(total), placeLabel, daysLabel].filter(Boolean).join(' · '),
    };
  }

  // A receber (o design não mostra; mantido do app com a mesma peça, em jade)
  let pendingNotice: { title: string; desc: string } | null = null;
  {
    const pendingCount = pendingShiftsData.length;
    const next7 = new Date(now.getTime() + 7 * 86400000);
    const upcoming7Value = allShifts
      .filter(s => {
        if (!s.payment_due_date) return false;
        const due = parseISO(s.payment_due_date);
        return due >= now && due <= next7 && !['recebido', 'cancelado'].includes(s.status);
      })
      .reduce((sum, s) => sum + s.expected_value, 0);
    if (upcoming7Value > 0) {
      pendingNotice = { title: `${formatCurrency(upcoming7Value)} ${t('A receber').toLowerCase()}`, desc: t('Plantões realizados aguardando pagamento.') };
    } else if (pendingCount > 0 && overdueShiftsData.length === 0) {
      const label = pendingCount > 1 ? t('plantões a receber') : t('plantão a receber');
      pendingNotice = { title: `${pendingCount} ${label}`, desc: t('Plantões realizados aguardando pagamento.') };
    }
  }

  /* ---- Placa ----------------------------------------------------------- */

  // "Nenhum plantão hoje. O próximo é em dois dias." / "Você tem 1 plantão hoje."
  let statusLine: string;
  if (todayShifts.length > 0) {
    const n = todayShifts.length;
    statusLine = `${t('Você tem')} ${n} ${n !== 1 ? t('plantões') : t('plantão')} ${t('hoje.')}`;
  } else {
    const future = nextShift && nextShift.date > todayStr ? nextShift : null;
    if (!future) {
      statusLine = `${t('Nenhum plantão hoje.')} ${t('Nada agendado por enquanto.')}`;
    } else {
      const d = differenceInCalendarDays(parseISO(future.date), parseISO(todayStr));
      if (d <= 1) {
        statusLine = `${t('Nenhum plantão hoje.')} ${t('O próximo é amanhã.')}`;
      } else {
        const nWord = language === 'pt-BR' && d <= 10 ? PT_NUMBER_WORDS[d] : String(d);
        statusLine = `${t('Nenhum plantão hoje.')} ${t('O próximo é em')} ${nWord} ${t('dias')}.`;
      }
    }
  }

  const nextLabel = nextShift
    ? `${t('Próximo plantão')} · ${nextShift.date === todayStr
        ? t('hoje')
        : format(parseISO(nextShift.date), "d 'de' MMMM", { locale: ptBR })}`
    : t('Próximo plantão');

  const anyModalOpen = shiftDetails || showRepetirModal || showMarcarPagoModal || showOverdueSheet || showPendingSheet;

  const planMeta = PLAN_META[plan];
  const userName = user?.name || 'Médico';
  const initials = getInitials(user?.name || 'M');
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const doctorTitle = /^(dra|doutora)\b/i.test(userName.trim()) ? 'Dra.' : 'Dr.';

  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden bg-white">

      {/* leading-[normal]: o design não define entrelinha (o preflight do Tailwind forçaria 1.5) */}
      <main className="flex-1 overflow-y-auto hide-scrollbar leading-[normal]">
        {/* Placa de pedra sangrada: data + menu + avatar, saudação e próximo plantão */}
        <div className="relative px-6 pt-5 pb-11">
          <Stone
            size="150% auto"
            position="34% 46%"
            filter="var(--marble-filter)"
            veil="var(--marble-veil)"
          />

          <div className="relative flex items-center justify-between gap-4 pt-3">
            <p className="min-w-0 truncate text-[13.5px] font-medium text-white/[0.82]">{longDate(now)}</p>

            <div className="relative flex items-center gap-2.5 shrink-0">
              <button
                onClick={() => setShowMenu(v => !v)}
                className="glass-icon-btn hover:bg-white/[0.22]"
                title={t('Mais opções')}
                aria-label={t('Mais opções')}
                aria-haspopup="menu"
                aria-expanded={showMenu}
              >
                <Glyph size={18}>{ICON.dots}</Glyph>
              </button>

              {/* Avatar sempre claro sobre a pedra: cores fixas (bg-white/text-slate-* são remapeados no escuro) */}
              <button
                onClick={() => setShowProfile(true)}
                className="w-9 h-9 rounded-full bg-[#F6F8F7] text-[#0E6B55] text-[13px] font-semibold tracking-[0.02em] flex items-center justify-center p-0 hover:opacity-90 transition-opacity"
                title={t('Editar perfil')}
                aria-label={t('Editar perfil')}
              >
                {initials}
              </button>

              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div
                    role="menu"
                    className="absolute right-0 top-[46px] z-50 w-60 pb-1.5 bg-white rounded-[20px] border border-slate-200 shadow-lg overflow-hidden animate-scale-in"
                  >
                    {/* Plano atual — saiu da placa e vive aqui */}
                    <div className="px-4 pt-3.5 pb-3 mb-1.5 border-b border-[var(--color-border)]">
                      <p className="text-[12px] font-normal text-slate-500">{t('Seu plano')}</p>
                      <p className="mt-0.5 text-[14px] font-medium text-slate-900">{t(`Plano ${planMeta.name}`)}</p>
                    </div>
                    <PlateMenuItem icon={HelpCircle} label={t('Sobre esta tela')}
                      onClick={() => { setShowMenu(false); setShowHelp(true); }} />
                    <PlateMenuItem icon={theme === 'dark' ? Sun : Moon}
                      label={theme === 'dark' ? t('Modo claro') : t('Modo escuro')}
                      onClick={() => { setShowMenu(false); toggleTheme(); }} />
                    <PlateMenuItem icon={LogOut} label={t('Sair')} danger
                      onClick={() => { setShowMenu(false); setShowLogoutConfirm(true); }} />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="relative mt-[30px]">
            <h1 className="text-[30px] font-light leading-[1.08] tracking-[-0.035em] text-white">
              {t(getGreeting())},<br />
              <span className="font-semibold">{doctorTitle} {getFirstName(userName)}</span>
            </h1>
            <p className="mt-2.5 text-[14.5px] font-normal text-white/[0.84]">{statusLine}</p>
          </div>

          {/* Próximo plantão: dentro da placa, separado por filete */}
          {nextShift ? (
            <button
              onClick={() => setShiftDetails(nextShift)}
              className="relative block w-full mt-[34px] pt-[18px] border-t border-white/[0.26] hover:border-white/50 bg-transparent text-left text-white transition-colors"
            >
              <p className="mb-3 text-[13.5px] font-medium text-white/[0.84]">{nextLabel}</p>
              <div className="flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-[20px] font-semibold leading-[1.15] tracking-[-0.025em]">
                    {wp?.name || nextShift.title}
                  </p>
                  <p className="mt-1.5 text-[14px] font-medium text-white/[0.86] tabular-nums">
                    {timeRange(nextShift)} · {formatHours(nextShift.duration_hours)} h
                  </p>
                </div>
                <p className="shrink-0 text-[26px] font-light leading-none tracking-[-0.03em] whitespace-nowrap tabular-nums">
                  {formatCurrencyShort(nextShift.expected_value)}
                </p>
              </div>
            </button>
          ) : (
            <div className="relative mt-[34px] pt-[18px] border-t border-white/[0.26] text-white">
              <p className="mb-3 text-[13.5px] font-medium text-white/[0.84]">{nextLabel}</p>
              <div className="flex items-end justify-between gap-4">
                <p className="min-w-0 text-[20px] font-semibold leading-[1.15] tracking-[-0.025em]">
                  {t('Nenhum plantão agendado')}
                </p>
                <button onClick={onAddShift} className="glass-pill shrink-0">
                  <Plus size={14} strokeWidth={1.8} /> {t('Adicionar plantão')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Folha branca: sobe -28px sobre a placa, raio 28 */}
        <div className="jade-sheet min-h-[560px]">
          <MonthSummaryCard
            monthLabel={capitalize(format(now, 'MMMM', { locale: ptBR }))}
            expected={stats?.expected || 0}
            received={stats?.received || 0}
            pending={stats?.pending || 0}
            overdue={stats?.overdue || 0}
          />

          {/* Avisos: filete terracota (atraso) / jade (a receber), sem ícone */}
          {(overdueNotice || pendingNotice) && (
            <div className="mt-5 space-y-2.5">
              {overdueNotice && (
                <Notice tone="warn" {...overdueNotice} onClick={() => setShowOverdueSheet(true)} />
              )}
              {pendingNotice && (
                <Notice
                  tone="info"
                  {...pendingNotice}
                  onClick={pendingShiftsData.length > 0 ? () => setShowPendingSheet(true) : undefined}
                />
              )}
            </div>
          )}

          {/* Ações rápidas — treliça 2×2 de filetes */}
          <SectionLabel className="mt-[34px]">{t('Ações rápidas')}</SectionLabel>
          <div className="quick-action-grid mt-3">
            <button onClick={onAddShift} className="quick-action-btn">
              <Glyph>{ICON.plus}</Glyph>
              <span className="text-[14px] font-medium tracking-[-0.01em] text-slate-900">{t('Novo plantão')}</span>
            </button>

            <button onClick={() => setShowRepetirModal(true)} className="quick-action-btn">
              <Glyph>{ICON.repeat}</Glyph>
              <span className="min-w-0 w-full text-[14px] font-medium tracking-[-0.01em] text-slate-900">
                {t('Repetir último')}
                <span className="block mt-0.5 truncate text-[12px] font-normal text-slate-500">
                  {latestShift ? getWorkplace(latestShift.workplace_id)?.name : t('Nenhum plantão')}
                </span>
              </span>
            </button>

            <button onClick={() => setShowMarcarPagoModal(true)} className="quick-action-btn">
              <Glyph>{ICON.check}</Glyph>
              <span className="text-[14px] font-medium tracking-[-0.01em] text-slate-900">{t('Marcar pago')}</span>
            </button>

            <button onClick={() => onNavigate('calendario')} className="quick-action-btn">
              <Glyph>{ICON.calendar}</Glyph>
              <span className="text-[14px] font-medium tracking-[-0.01em] text-slate-900">{t('Ver agenda')}</span>
            </button>
          </div>

          {/* Depois deste — data tipográfica à esquerda, filete vertical */}
          {upcomingShifts.length > 0 && (
            <>
              <SectionLabel className="mt-[34px]">{t('Depois deste')}</SectionLabel>
              <div className="mt-2">
                {upcomingShifts.map(s => {
                  const wpp = getWorkplace(s.workplace_id);
                  const d = parseISO(s.date);
                  return (
                    <button key={s.id} onClick={() => setShiftDetails(s)} className="list-row w-full text-left">
                      <span className="w-10 shrink-0 text-center">
                        <span className="block text-[22px] font-light leading-none text-slate-900 tabular-nums">
                          {format(d, 'd')}
                        </span>
                        <span className="block mt-[3px] text-[11px] font-normal text-slate-500">
                          {format(d, 'MMM', { locale: ptBR })}
                        </span>
                      </span>
                      <span className="flex-1 min-w-0 pl-4 border-l border-[var(--color-border)]">
                        <span className="block truncate text-[14.5px] font-medium tracking-[-0.01em] text-slate-900">
                          {wpp?.name || s.title}
                        </span>
                        <span className="block mt-[3px] text-[12.5px] font-normal text-slate-500 tabular-nums">
                          {timeRange(s)}{s.duration_hours !== 12 ? ` · ${formatHours(s.duration_hours)} h` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-[15px] font-normal text-slate-900 tabular-nums">
                        {formatCurrency(s.expected_value)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Evolução dos ganhos — bloqueio Pro, só no Free */}
          {plan === 'free' && (
            <button
              onClick={() => gate('charts', () => onNavigate('ganhos'))}
              className="mt-7 flex w-full items-center gap-3 px-[18px] py-4 rounded-[20px] border border-slate-200 bg-slate-50 text-left transition-colors hover:border-blue-600"
            >
              <Glyph size={18} className="shrink-0 text-blue-600">{ICON.lock}</Glyph>
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-medium text-slate-900">{t('Ver evolução dos ganhos')}</span>
                <span className="block mt-0.5 text-[12px] font-normal text-slate-500">{t('Disponível no Pro')}</span>
              </span>
              <Glyph size={18} className="shrink-0 text-slate-500">{ICON.chevron}</Glyph>
            </button>
          )}
        </div>
      </main>

      {/* Backdrop Global (sem blur) */}
      <div
        onClick={() => { setShiftDetails(null); setShowRepetirModal(false); setShowMarcarPagoModal(false); }}
        className={`absolute inset-0 z-40 bg-slate-900/40 transition-opacity duration-300 ${anyModalOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      </div>

      {/* MODAL: DETALHE DO PLANTÃO — cabeçalho de pedra */}
      <div
        className={`${MODAL_WRAP} ${shiftDetails ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setShiftDetails(null)}
      >
        <div
          role="dialog"
          aria-modal="true"
          className={`${MODAL_BOX} max-h-[90vh] ${shiftDetails ? 'scale-100' : 'scale-95'}`}
          style={MODAL_SHADOW}
          onClick={e => e.stopPropagation()}
        >
          {shiftDetails && (
            <ShiftDetailsContent
              shift={shiftDetails}
              isToday={shiftDetails.date === todayStr}
              onClose={() => setShiftDetails(null)}
              onMarkDone={() => handleMarkDone(shiftDetails)}
              onEdit={() => { setShiftDetails(null); onNavigate('calendario'); }}
              onCancel={() => handleCancelShift(shiftDetails)}
            />
          )}
        </div>
      </div>

      {/* MODAL: REPETIR ÚLTIMO */}
      <div
        className={`${MODAL_WRAP} ${showRepetirModal ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setShowRepetirModal(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          className={`${MODAL_BOX} max-h-[90vh] ${showRepetirModal ? 'scale-100' : 'scale-95'}`}
          style={MODAL_SHADOW}
          onClick={e => e.stopPropagation()}
        >
          <ModalHeader
            title={t('Repetir plantão')}
            subtitle={t('Confirme os dados a duplicar')}
            onClose={() => setShowRepetirModal(false)}
          />

          <div className="px-6 pb-6 overflow-y-auto hide-scrollbar">
            <SectionLabel>{t('Último plantão')}</SectionLabel>
            {latestShift ? (
              <RepeatSummary shift={latestShift} />
            ) : (
              <p className="mt-2 py-6 text-center text-[13.5px] text-slate-500 border-y border-[var(--color-border)]">
                {t('Nenhum plantão anterior encontrado.')}
              </p>
            )}

            <SectionLabel className="mt-6">{t('Para qual data?')}</SectionLabel>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <button className="chip h-11 !py-0" aria-pressed={repDateOpt === 'hoje'} onClick={() => setRepDateOpt('hoje')}>
                {t('Hoje')}
              </button>
              <button className="chip h-11 !py-0" aria-pressed={repDateOpt === 'amanha'} onClick={() => setRepDateOpt('amanha')}>
                {t('Amanhã')}
              </button>
            </div>

            <div className="mt-6 flex gap-2.5">
              <button onClick={() => setShowRepetirModal(false)} className="btn-secondary !h-[52px] flex-1">
                {t('Cancelar')}
              </button>
              <button
                onClick={handleConfirmRepeat}
                disabled={!latestShift}
                className="btn-primary font-medium flex-[1.6] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('Confirmar')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: MARCAR PAGO */}
      <div
        className={`${MODAL_WRAP} ${showMarcarPagoModal ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setShowMarcarPagoModal(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          className={`${MODAL_BOX} max-h-[80vh] ${showMarcarPagoModal ? 'scale-100' : 'scale-95'}`}
          style={MODAL_SHADOW}
          onClick={e => e.stopPropagation()}
        >
          <ModalHeader
            title={t('Confirmar pagamento')}
            subtitle={t('Selecione os plantões recebidos')}
            onClose={() => setShowMarcarPagoModal(false)}
          />

          <div className="flex-1 overflow-y-auto px-6 hide-scrollbar border-t border-[var(--color-border)]">
            {pendingShifts.length === 0 ? (
              <div className="py-10 text-center">
                <Glyph className="mx-auto text-blue-600">{ICON.check}</Glyph>
                <p className="mt-3 text-[13.5px] text-slate-500">{t('Nenhum plantão pendente de pagamento.')}</p>
              </div>
            ) : pendingShifts.map(s => {
              const wpp = getWorkplace(s.workplace_id);
              const isSelected = selectedPending.includes(s.id);
              const isOverdue = s.status === 'atrasado';
              return (
                <label key={s.id} className="list-row last:border-b-0 cursor-pointer">
                  <span className="flex items-center gap-3.5 min-w-0">
                    {/* Caixa desenhada num irmão do input: o modo escuro força fundo em `input` com !important */}
                    <span className="relative w-5 h-5 shrink-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedPending([...selectedPending, s.id]);
                          else setSelectedPending(selectedPending.filter(id => id !== s.id));
                        }}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 rounded-[4px] border-[1.5px] border-slate-300 transition-colors peer-checked:bg-blue-600 peer-checked:border-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-200"
                      />
                      <Check
                        size={13}
                        strokeWidth={2.2}
                        aria-hidden="true"
                        className="absolute inset-0 m-auto text-white opacity-0 transition-opacity pointer-events-none peer-checked:opacity-100"
                      />
                    </span>
                    <span
                      className="place-rule min-w-0"
                      style={{ borderLeftColor: isOverdue ? 'var(--color-danger)' : wpp?.color }}
                    >
                      <span className="block text-[14.5px] font-medium tracking-[-0.01em] text-slate-900 truncate">{wpp?.name}</span>
                      <span className="mt-[3px] flex items-center gap-2 text-[12.5px] text-slate-500">
                        <span className="tabular-nums">{capitalize(format(parseISO(s.date), "EEE, d 'de' MMM", { locale: ptBR }))}</span>
                        {isOverdue && <span className="status-badge status-atrasado">{t('Atrasado')}</span>}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-[15px] text-slate-900 tabular-nums">{formatCurrency(s.expected_value)}</span>
                </label>
              );
            })}
          </div>

          <div className="px-6 pt-4 pb-6 shrink-0 border-t border-[var(--color-border)]">
            {pendingShifts.length > 0 && (
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-slate-500">{t('Total selecionado')}</span>
                <span className="text-[22px] font-light tracking-[-0.03em] text-slate-900 tabular-nums">
                  {formatCurrency(totalSelected)}
                </span>
              </div>
            )}
            <button
              onClick={handleConfirmPaid}
              disabled={selectedPending.length === 0}
              className="btn-primary font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {selectedPending.length > 0
                ? `${t('Confirmar')} (${formatCurrency(totalSelected)})`
                : t('Confirmar recebimento')}
            </button>
          </div>
        </div>
      </div>

      {/* MODAL: PAGAMENTOS ATRASADOS */}
      <div
        className={`${MODAL_WRAP} ${showOverdueSheet ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setShowOverdueSheet(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          className={`${MODAL_BOX} max-h-[80vh] ${showOverdueSheet ? 'scale-100' : 'scale-95'}`}
          style={MODAL_SHADOW}
          onClick={e => e.stopPropagation()}
        >
          <ModalHeader
            title={t('Pagamentos atrasados')}
            subtitle={
              <>
                <span className="tabular-nums">{overdueShiftsData.length}</span>{' '}
                {overdueShiftsData.length !== 1 ? t('plantões') : t('plantão')} ·{' '}
                <span className="font-medium text-red-600 tabular-nums">
                  {formatCurrency(overdueShiftsData.reduce((s, x) => s + x.expected_value, 0))}
                </span>
              </>
            }
            onClose={() => setShowOverdueSheet(false)}
          />

          <div className="flex-1 overflow-y-auto px-6 pb-6 hide-scrollbar">
            {overdueShiftsData.map(shift => {
              const owp = getWorkplace(shift.workplace_id);
              if (!owp) return null;
              const days = daysOverdue(shift);
              return (
                <div key={shift.id} className="pt-5 pb-6 first:pt-1 last:pb-0 border-b border-[var(--color-border)] last:border-b-0">
                  {/* Régua terracota: a mesma "atenção" do sistema */}
                  <div className="place-rule flex items-start justify-between gap-3" style={{ borderLeftColor: 'var(--color-danger)' }}>
                    <div className="min-w-0">
                      <p className="text-[15.5px] font-medium tracking-[-0.015em] text-slate-900 truncate">{owp.name}</p>
                      <p className="mt-[5px] text-[13px] text-slate-500 truncate">{shift.title}</p>
                    </div>
                    <span className="status-badge status-atrasado shrink-0">{t('Atrasado')}</span>
                  </div>

                  <div className="data-lattice mt-4">
                    <div>
                      <p className="text-[12px] text-slate-500">{t('Vencimento')}</p>
                      <p className="mt-[5px] text-[15px] text-slate-900 tabular-nums">
                        {shift.payment_due_date
                          ? format(parseISO(shift.payment_due_date), "d 'de' MMM", { locale: ptBR })
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[12px] text-slate-500">{t('Em atraso')}</p>
                      <p className="mt-[5px] text-[15px] text-red-600 tabular-nums">
                        {days > 0 ? `${days} ${days !== 1 ? t('dias') : t('dia')}` : t('Hoje')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[12px] text-slate-500">{t('Plantão em')}</p>
                      <p className="mt-[5px] text-[15px] text-slate-900 tabular-nums">
                        {format(parseISO(shift.date), "d 'de' MMM", { locale: ptBR })}
                      </p>
                    </div>
                    <div>
                      <p className="text-[12px] text-slate-500">{t('Valor')}</p>
                      <p className="mt-[5px] text-[15px] text-slate-900 tabular-nums">
                        {formatCurrency(shift.expected_value)}
                      </p>
                    </div>
                  </div>

                  {shift.notes && (
                    <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">{shift.notes}</p>
                  )}

                  <button
                    onClick={() => { handleRegisterPayment(shift); if (overdueShiftsData.length <= 1) setShowOverdueSheet(false); }}
                    className="btn-primary font-medium mt-4 !h-11 text-[13.5px]"
                  >
                    <DollarSign size={16} strokeWidth={1.8} />
                    {t('Registrar pagamento')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* MODAL: PLANTÕES A RECEBER */}
      <div
        className={`${MODAL_WRAP} ${showPendingSheet ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setShowPendingSheet(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          className={`${MODAL_BOX} max-h-[80vh] ${showPendingSheet ? 'scale-100' : 'scale-95'}`}
          style={MODAL_SHADOW}
          onClick={e => e.stopPropagation()}
        >
          <ModalHeader
            title={t('Plantões a receber')}
            subtitle={
              <>
                <span className="tabular-nums">{pendingShiftsData.length}</span>{' '}
                {pendingShiftsData.length !== 1 ? t('plantões') : t('plantão')} ·{' '}
                <span className="font-medium text-blue-600 tabular-nums">
                  {formatCurrency(pendingShiftsData.reduce((s, x) => s + x.expected_value, 0))}
                </span>
              </>
            }
            onClose={() => setShowPendingSheet(false)}
          />

          <div className="flex-1 overflow-y-auto px-6 pb-3 hide-scrollbar border-t border-[var(--color-border)]">
            {pendingShiftsData.map(shift => {
              const wpp = getWorkplace(shift.workplace_id);
              if (!wpp) return null;
              const isRealizado = shift.status === 'realizado';
              const dueLabel = shift.payment_due_date
                ? `${t('Vence')} ${format(parseISO(shift.payment_due_date), 'dd/MM', { locale: ptBR })}`
                : null;
              return (
                <div key={shift.id} className="list-row !items-start hover:bg-transparent last:border-b-0">
                  <div className="place-rule min-w-0 flex-1" style={{ borderLeftColor: wpp.color }}>
                    <p className="text-[14.5px] font-medium tracking-[-0.01em] text-slate-900 truncate">{wpp.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[12.5px] text-slate-500 tabular-nums">
                        {format(parseISO(shift.date), 'dd/MM', { locale: ptBR })}
                      </span>
                      <span className={`status-badge status-${shift.status}`}>{t(STATUS_LABELS[shift.status])}</span>
                      {dueLabel && <span className="text-[12.5px] text-slate-500 tabular-nums">· {dueLabel}</span>}
                    </div>
                    {isRealizado ? (
                      <button
                        onClick={() => { handleRegisterPayment(shift); if (pendingShiftsData.length <= 1) setShowPendingSheet(false); }}
                        className="mt-1.5 h-11 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-blue-600 hover:opacity-75 transition-opacity"
                      >
                        <DollarSign size={15} strokeWidth={1.8} />
                        {t('Registrar pagamento')}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleMarkDone(shift)}
                        className="mt-1.5 h-11 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-blue-600 hover:opacity-75 transition-opacity"
                      >
                        <Glyph size={15} stroke={1.8}>{ICON.check}</Glyph>
                        {t('Marcar como concluído')}
                      </button>
                    )}
                  </div>
                  <p className="shrink-0 text-[15px] text-slate-900 tabular-nums">{formatCurrency(shift.expected_value)}</p>
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
          onSaved={() => showToast(t('Perfil atualizado.'))}
        />
      )}

      {/* CONFIRMAÇÃO: SAIR DA CONTA */}
      <ConfirmDialog
        open={showLogoutConfirm}
        icon={LogOut}
        title={t('Sair da conta?')}
        description={t('Você precisará entrar novamente para acessar seus dados.')}
        confirmLabel={t('Sair')}
        tone="danger"
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => { setShowLogoutConfirm(false); logout(); }}
      />

      {/* DRILLDOWN: SOBRE A TELA HOJE */}
      <ScreenHelpSheet
        open={showHelp}
        onClose={() => setShowHelp(false)}
        icon={<Home size={20} strokeWidth={1.5} className="text-blue-600" />}
        pretitle="Hoje"
        title="O que tem aqui"
        items={[
          { title: 'Próximo plantão', desc: 'Veja seu plantão mais próximo com horário e valor em destaque.' },
          { title: 'Resumo do mês', desc: 'Acompanhe previsto, recebido, a receber e atrasado num relance.' },
          { title: 'Alertas de pagamento', desc: 'Toque para ver plantões a receber e pagamentos atrasados.' },
          { title: 'Ações rápidas', desc: 'Adicione, repita, marque como pago ou abra a agenda em 1 toque.' },
        ]}
        proPitch="No Pro você desbloqueia gráficos de evolução, metas, alertas de atraso e edição completa de plantões."
        proFeature="charts"
      />

      {/* Toast — pílula de tinta, check no jade-sinal, sem sombra colorida.
          Fixo acima da ilha de navegação (70px + 18px). */}
      <div
        role="status"
        aria-live="polite"
        className={`fixed left-1/2 -translate-x-1/2 bottom-[calc(104px+env(safe-area-inset-bottom,0px))] z-[60] max-w-[calc(100vw-32px)] h-11 px-4 rounded-full bg-slate-900 text-white ring-1 ring-white/10 text-[13px] font-medium flex items-center gap-2.5 whitespace-nowrap pointer-events-none transition-all duration-300 ${toastMsg ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}
      >
        <Glyph size={16} stroke={1.8} className="shrink-0 text-emerald-400">{ICON.check}</Glyph>
        <span className="truncate">{toastMsg}</span>
      </div>

    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Peças dos modais da tela Hoje
 * ------------------------------------------------------------------------- */

/** Cabeçalho padrão de modal centrado: título light + subtítulo + fechar. */
function ModalHeader({ title, subtitle, onClose }: {
  title: string; subtitle?: ReactNode; onClose: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="p-6 pb-4 flex items-start justify-between gap-4 shrink-0">
      <div className="min-w-0">
        <h2 className="text-[22px] font-light leading-[1.15] tracking-[-0.03em] text-slate-900">{title}</h2>
        {subtitle && <p className="mt-1.5 text-[13px] text-slate-500">{subtitle}</p>}
      </div>
      <button
        onClick={onClose}
        className="icon-btn w-10 h-10 -mr-2 -mt-1.5 flex items-center justify-center shrink-0"
        aria-label={t('Fechar')}
        title={t('Fechar')}
      >
        <X size={18} strokeWidth={1.5} />
      </button>
    </div>
  );
}

/** Detalhe do plantão: cabeçalho de pedra, valor herói, treliça 2×2 e ações. */
function ShiftDetailsContent({ shift, isToday, onClose, onMarkDone, onEdit, onCancel }: {
  shift: Shift;
  isToday: boolean;
  onClose: () => void;
  onMarkDone: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const wp = getWorkplace(shift.workplace_id);
  const date = parseISO(shift.date);
  const eyebrow = isToday
    ? `${t('Hoje')} · ${format(date, "d 'de' MMMM", { locale: ptBR })}`
    : longDate(date);
  const name = wp?.name || shift.title;
  // O título padrão ("Plantão <local>") repete o nome — só aparece quando é próprio.
  const customTitle = shift.title && wp && shift.title !== wp.name && shift.title !== `Plantão ${wp.name}`
    ? shift.title
    : null;
  const nature = shift.fiscal_nature ?? wp?.fiscal_nature;

  // Valor herói + linha de apoio ("valor previsto · recebimento dia 10/10")
  const received = shift.status === 'recebido';
  const heroValue = received ? (shift.received_value ?? shift.expected_value) : shift.expected_value;
  const [heroInt, heroCents] = splitCurrency(heroValue);
  const ddmm = (iso?: string) => (iso ? format(parseISO(iso), 'dd/MM') : null);
  let support: string;
  if (received) {
    const on = ddmm(shift.payment_received_date);
    support = `${t('valor recebido')}${on ? ` · ${t('recebido em')} ${on}` : ''}`;
  } else if (shift.status === 'atrasado') {
    const due = ddmm(shift.payment_due_date);
    support = `${t('valor previsto')}${due ? ` · ${t('venceu em')} ${due}` : ''}`;
  } else {
    const due = ddmm(shift.payment_due_date);
    support = `${t('valor previsto')}${due ? ` · ${t('recebimento dia')} ${due}` : ''}`;
  }

  const hours = shift.duration_hours;
  const cells: { label: string; value: string; warn?: boolean }[] = [
    { label: t('Horário'), value: timeRange(shift) },
    { label: t('Duração'), value: `${formatHours(hours)} ${hours === 1 ? t('hora') : t('horas')}` },
    { label: t('Situação'), value: t(STATUS_LABELS[shift.status]), warn: shift.status === 'atrasado' },
    { label: t('Valor hora'), value: hours > 0 ? formatCurrency(shift.expected_value / hours) : '—' },
  ];

  return (
    <>
      <div className="relative overflow-hidden shrink-0 px-6 pt-[22px] pb-6">
        <Stone
          size="200% auto"
          position="60% 30%"
          filter="saturate(.84)"
          veil="linear-gradient(160deg, rgba(6,48,39,.5), rgba(6,48,39,.66))"
        />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium text-white/[0.84]">{eyebrow}</p>
            <h2 className="mt-2 text-[22px] font-medium leading-[1.15] tracking-[-0.03em] text-white">{name}</h2>
            {customTitle && (
              <p className="mt-1 truncate text-[13.5px] font-medium text-white/[0.84]">{customTitle}</p>
            )}
          </div>
          <GlassClose onClick={onClose} />
        </div>
      </div>

      <div className="px-6 pt-[26px] pb-6 overflow-y-auto hide-scrollbar">
        <p className="text-[34px] font-extralight leading-none tracking-[-0.04em] text-slate-900 tabular-nums">
          {heroInt}
          <span className="text-[20px] font-light text-slate-500">{heroCents}</span>
        </p>
        <p className="mt-2 text-[12.5px] font-normal text-slate-500">{support}</p>

        {/* Treliça 2×2 de filetes (a última linha não tem filete inferior) */}
        <div className="mt-6 grid grid-cols-2 border-t border-[var(--color-border)]">
          {cells.map((c, i) => {
            const left = i % 2 === 0;
            const lastRow = i >= cells.length - 2;
            return (
              <div
                key={c.label}
                className={`py-3.5 border-[var(--color-border)] ${left ? 'pr-4 border-r' : 'pl-4'} ${lastRow ? '' : 'border-b'}`}
              >
                <p className="text-[12px] font-normal text-slate-500">{c.label}</p>
                <p className={`mt-[5px] text-[15px] font-normal tabular-nums ${c.warn ? 'text-red-600' : 'text-slate-900'}`}>
                  {c.value}
                </p>
              </div>
            );
          })}
        </div>

        {nature && (
          <div className="py-3.5 border-t border-[var(--color-border)]">
            <p className="text-[12px] font-normal text-slate-500">{t('Forma de recebimento')}</p>
            <p className="mt-[5px] text-[15px] font-normal text-slate-900">{t(FISCAL_NATURE_LABELS[nature])}</p>
          </div>
        )}

        {shift.notes && (
          <div className="pt-3.5 border-t border-[var(--color-border)]">
            <p className="text-[12px] font-normal text-slate-500">{t('Observações')}</p>
            <p className="mt-[5px] text-[13.5px] leading-relaxed text-slate-700">{shift.notes}</p>
          </div>
        )}

        <button onClick={onMarkDone} className="btn-primary font-medium mt-6">
          <Glyph size={18} stroke={1.8}>{ICON.check}</Glyph>
          {t('Marcar como concluído')}
        </button>
        <div className="mt-2.5 flex gap-2.5">
          <button onClick={onEdit} className="btn-secondary flex-1 !px-3">{t('Editar')}</button>
          <button onClick={onCancel} className="btn-danger flex-1 px-3">{t('Cancelar plantão')}</button>
        </div>
      </div>
    </>
  );
}

/** Resumo do último plantão (Repetir): linha com régua na cor do local. */
function RepeatSummary({ shift }: { shift: Shift }) {
  const { t } = useLanguage();
  const wp = getWorkplace(shift.workplace_id);
  return (
    <div className="list-row !items-start hover:bg-transparent">
      <div className="place-rule min-w-0" style={{ borderLeftColor: wp?.color }}>
        <p className="text-[15.5px] font-medium tracking-[-0.015em] text-slate-900 truncate">{wp?.name}</p>
        {shift.title && <p className="mt-[5px] text-[13px] text-slate-500 truncate">{shift.title}</p>}
        <p className="mt-0.5 text-[13px] text-slate-500 tabular-nums">
          {timeRange(shift)} · {formatHours(shift.duration_hours)} h
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[12px] text-slate-500">{t('Valor a repetir')}</p>
        <p className="mt-0.5 text-[17px] font-normal text-slate-900 tabular-nums">
          {formatCurrency(shift.expected_value)}
        </p>
      </div>
    </div>
  );
}
