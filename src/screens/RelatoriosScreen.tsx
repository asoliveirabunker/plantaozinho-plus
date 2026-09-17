import React, { useState, useMemo, useCallback } from 'react';
import { baixarArquivo, entregarArquivo, openExternal } from '../lib/native';
import { useApp } from '../contexts/AppContext';
import { getMonthlyStats } from '../lib/db';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  FileText, Download, Mail, ChevronLeft, ChevronRight, ChevronDown, X, Loader2, Crown, Lock, BarChart2, Layers
} from 'lucide-react';
import jsPDF from 'jspdf';
import { useLanguage } from '../hooks/useLanguage';
import { usePlan } from '../contexts/PlanContext';
import { useGuest } from '../hooks/useGuest';
import ScreenHelpSheet from '../components/ScreenHelpSheet';
import { resolveFiscalNature, FISCAL_NATURE_LABELS, FISCAL_NATURE_ORDER, isPJNature, type FiscalNature, type Shift } from '../types';

function fmtCur(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

/** "Dra. Carla Mendes" → "Carla Mendes": o relatório já prefixa "Dr(a).". */
function nomeSemTitulo(name?: string) {
  return (name || '').trim().replace(/^(dra?|doutora?)\.?\s+/i, '');
}

/** Separa "R$ 14.300" de ",00" para o centavo ir em corpo menor (`.hero-value-cents`). */
function splitCur(v: number): [string, string] {
  const full = fmtCur(v);
  const i = full.lastIndexOf(',');
  return i === -1 ? [full, ''] : [full.slice(0, i), full.slice(i)];
}

/** Sombra padrão dos modais centrados do sistema. */
const MODAL_SHADOW = { boxShadow: '0 40px 80px -30px rgba(7,56,45,.5)' };
/** Filete da treliça sobre a pedra. */
const STONE_RULE = '1px solid rgba(255,255,255,.26)';
/** Pedra do extrato fiscal: enquadramento próprio do design (190% · 60% 40%). */
const STONE_TEXTURE: React.CSSProperties = {
  backgroundColor: '#2f6f60',
  backgroundImage: "url('/marble.webp')",
  backgroundSize: '190% auto',
  backgroundPosition: '60% 40%',
  filter: 'var(--marble-filter)',
};
/** Véu do extrato fiscal. */
const STONE_VEIL: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(6,48,39,.5), rgba(6,48,39,.68))',
};
/** Filete padrão do sistema (remapeado no modo escuro via variável). */
const RULE = '1px solid var(--color-border)';

/** Regime por extenso → forma curta da treliça ("Simples · 6%"). */
const REGIME_CURTO: Record<string, string> = {
  'MEI': 'MEI',
  'Simples Nacional': 'Simples',
  'Lucro Presumido': 'Presumido',
  'PF': 'PF',
};

/** "PJ" / "cooperativa" → "PJ" / "Cooperativa" (mesmo rótulo da tela de Locais). */
function capMetodo(m: string) { return m.charAt(0).toUpperCase() + m.slice(1); }

/**
 * Opção de escolha única em modal: `.list-row` com marcador de seleção jade.
 * O `<input type="radio">` continua no DOM (acessível), só fica visualmente oculto.
 */
function ChoiceRow({ name, value, checked, onSelect, title, desc }: {
  name: string; value: string; checked: boolean; onSelect: () => void; title: string; desc: string;
}) {
  return (
    <label className="list-row cursor-pointer has-[:focus-visible]:bg-slate-50">
      <input type="radio" name={name} value={value} checked={checked} onChange={onSelect} className="sr-only" />
      <span
        aria-hidden="true"
        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors"
        style={{ border: `1.5px solid ${checked ? 'var(--color-primary)' : 'var(--color-border-strong, #CBD6D2)'}` }}
      >
        {checked && <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-primary)' }} />}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-[14.5px] text-slate-900 ${checked ? 'font-semibold' : 'font-medium'}`}>{title}</span>
        <span className="block mt-0.5 text-[12.5px] text-slate-500 leading-snug">{desc}</span>
      </span>
    </label>
  );
}

/** Como o relatório separa os ganhos. */
type GroupBy = 'none' | 'forma' | 'local';
const GROUP_LABELS: Record<GroupBy, string> = {
  none: 'Consolidado',
  forma: 'Forma de recebimento',
  local: 'Por local',
};
const FORMA_ORDER: FiscalNature[] = FISCAL_NATURE_ORDER;

/** Deduções/retenções de um plantão conforme a forma de recebimento.
 *  Regimes PJ (MEI/Simples/Lucro Presumido/PJ) → ISS + PIS + COFINS ·
 *  PF/Autônomo (RPA) → INSS + IRRF. Campos vazios contam 0. */
function deducoesOfShift(s: Shift, forma: FiscalNature): number {
  if (isPJNature(forma)) return (s.iss_retido || 0) + (s.pis || 0) + (s.cofins || 0);
  return (s.inss_retido || 0) + (s.irrf_retido || 0); // PF / Autônomo
}

function WhatsAppIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.83 9.83 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.82 11.82 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.88 11.88 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 0 0-3.48-8.413"/>
    </svg>
  );
}

type PreviewFormat = 'completo' | 'resumido' | 'pendentes';

export default function RelatoriosScreen() {
  const { user, workplaces, shifts, updateProfile } = useApp();
  const { t } = useLanguage();
  const { gate, can } = usePlan();
  const { requireSignup, isGuest } = useGuest();

  // O relatório fiscal unificado é exclusivo do plano Max — liberado no modo
  // visitante (demonstração). Bloqueado para contas Free e Pro.
  const canFiscalReport = can('mixed_fiscal_report') || isGuest;
  function openReport() {
    if (isGuest) { setShowPreview(true); return; }
    gate('mixed_fiscal_report', () => setShowPreview(true));
  }
  const [activeTab, setActiveTab] = useState<'mes' | 'ano'>('mes');
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  // Modal & Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [previewFormat, setPreviewFormat] = useState<PreviewFormat>('completo');
  const [groupBy, setGroupBy] = useState<GroupBy>('forma');

  const [settingsData, setSettingsData] = useState({
    tax_regime: user?.tax_regime || 'Simples Nacional',
    tax_rate: user?.tax_rate || 6,
    company_name: user?.company_name || `${user?.name || ''} Serviços Médicos LTDA`,
    cnpj: user?.cnpj || '',
  });

  React.useEffect(() => {
    if (user) {
      setSettingsData({
        tax_regime: user.tax_regime || 'Simples Nacional',
        tax_rate: user.tax_rate || 6,
        company_name: user.company_name || `${user.name || ''} Serviços Médicos LTDA`,
        cnpj: user.cnpj || '',
      });
    }
  }, [user]);

  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth() + 1;

  const allShifts = shifts;

  const monthShifts = useMemo(() => {
    const prefix = `${year}-${String(month).padStart(2,'0')}`;
    return allShifts.filter(s => s.date.startsWith(prefix) && s.status !== 'cancelado');
  }, [allShifts, year, month]);

  const stats = useMemo(() => user ? getMonthlyStats(user.id, year, month) : null, [user, year, month]);

  const wpBreakdown = useMemo(() => {
    const map: Record<string, { shifts: number; total: number; received: number }> = {};
    monthShifts.forEach(s => {
      if (!map[s.workplace_id]) map[s.workplace_id] = { shifts: 0, total: 0, received: 0 };
      map[s.workplace_id].shifts++;
      map[s.workplace_id].total += s.expected_value;
      if (s.status === 'recebido') map[s.workplace_id].received += (s.received_value || s.expected_value);
    });
    return map;
  }, [monthShifts]);

  // Tax constants
  const isMei = user?.tax_regime === 'MEI';
  const userRate = user?.tax_rate ?? 6;
  // Para MEI com alíquota 0 (default), usa o valor fixo padrão (R$ 75,60).
  // Caso o usuário tenha definido uma alíquota > 0 para MEI, usa o cálculo baseado em alíquota.
  const useFixedMei = isMei && userRate === 0;
  const taxRate = useFixedMei ? 0 : userRate / 100;
  const taxBase = stats?.expected || 0;
  const taxAmount = useFixedMei ? 75.60 : taxBase * taxRate;

  // Rótulo do imposto principal conforme o regime tributário
  const taxLabel = (() => {
    const r = user?.tax_regime || 'Simples Nacional';
    if (r === 'MEI') return 'Contribuição DAS MEI';
    if (r === 'Simples Nacional') return 'Provisão DAS (Simples Nacional)';
    if (r === 'Lucro Presumido') return 'Provisão de Impostos (Lucro Presumido)';
    if (r === 'PF') return 'Carnê-Leão Estimado (PF)';
    return 'Provisão de Imposto';
  })();

  function handleWhatsApp() {
    const msg = encodeURIComponent(
      `📊 *Relatório Plantão Pro*\n` +
      `📅 *${format(selectedMonth, 'MMMM yyyy', { locale: ptBR }).toUpperCase()}*\n\n` +
      `💰 Faturamento Bruto: ${fmtCur(stats?.expected || 0)}\n` +
      `✅ Recebido: ${fmtCur(stats?.received || 0)}\n` +
      `⏳ Pendente: ${fmtCur(stats?.pending || 0)}\n` +
      `🏥 Plantões: ${stats?.totalShifts || 0} (${stats?.totalHours || 0}h)\n\n` +
      `_Gerado via Plantão Pro_`
    );
    const phone = user?.whatsapp?.replace(/\D/g, '') || '';
    void openExternal(`https://wa.me/${phone ? '55' + phone : ''}?text=${msg}`);
  }

  function handleEmail() {
    const subject = encodeURIComponent(`Relatório Plantão Pro — ${format(selectedMonth, 'MMMM/yyyy', { locale: ptBR })}`);
    const body = encodeURIComponent(
      `Relatório Mensal — ${format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}\n\n` +
      `Faturamento: ${fmtCur(stats?.expected || 0)}\n` +
      `Recebido: ${fmtCur(stats?.received || 0)}\n` +
      `Pendente: ${fmtCur(stats?.pending || 0)}\n` +
      `Plantões: ${stats?.totalShifts || 0}`
    );
    const to = user?.email || '';
    void openExternal(`mailto:${to}?subject=${subject}&body=${body}`);
  }

  // Derived logic for the Preview Document
  const isResumido = previewFormat === 'resumido';
  const isPendentes = previewFormat === 'pendentes';

  const docTitle = isPendentes 
    ? 'Extrato de Cobrança - Valores Pendentes' 
    : 'Relatório Mensal de Prestação de Serviços';

  const shiftsToShow = isPendentes 
    ? monthShifts.filter(s => s.status !== 'recebido' && s.status !== 'cancelado') 
    : monthShifts;
    
  const totalTableValue = isPendentes 
    ? shiftsToShow.reduce((a, b) => a + b.expected_value, 0) 
    : (stats?.expected || 0);

  const formatLabels: Record<PreviewFormat, string> = {
    completo: 'Completo',
    resumido: 'Resumido',
    pendentes: 'Cobrança',
  };

  // ---- Separação dos ganhos (Consolidado / Forma de recebimento / Local) ----
  const wpById = useMemo(() => new Map(workplaces.map(w => [w.id, w])), [workplaces]);
  const formaOf = useCallback((s: Shift) => resolveFiscalNature(s, wpById.get(s.workplace_id)), [wpById]);
  const deducoesOf = useCallback((s: Shift) => deducoesOfShift(s, formaOf(s)), [formaOf]);

  // Totais de deduções/retenções e líquido do mês (sobre o faturamento bruto)
  const totalDeducoes = useMemo(() => monthShifts.reduce((a, s) => a + deducoesOf(s), 0), [monthShifts, deducoesOf]);
  const totalLiquido = (stats?.expected || 0) - totalDeducoes;

  // Resumo conforme a separação escolhida (sempre sobre o mês inteiro)
  const groupSummary = useMemo(() => {
    type Row = { key: string; label: string; count: number; bruto: number; received: number; deducoes: number; liquido: number };
    const rows: Row[] = [];
    const push = (key: string, label: string, sh: Shift[]) => {
      if (!sh.length) return;
      const bruto = sh.reduce((a, b) => a + b.expected_value, 0);
      const deducoes = sh.reduce((a, b) => a + deducoesOf(b), 0);
      const received = sh.filter(s => s.status === 'recebido').reduce((a, b) => a + (b.received_value || b.expected_value), 0);
      rows.push({ key, label, count: sh.length, bruto, received, deducoes, liquido: bruto - deducoes });
    };
    if (groupBy === 'forma') {
      FORMA_ORDER.forEach(n => push(n, FISCAL_NATURE_LABELS[n], monthShifts.filter(s => formaOf(s) === n)));
    } else {
      const byId = new Map<string, Shift[]>();
      monthShifts.forEach(s => { const arr = byId.get(s.workplace_id) || []; arr.push(s); byId.set(s.workplace_id, arr); });
      byId.forEach((sh, id) => { const wp = wpById.get(id); if (wp) push(id, wp.name, sh); });
    }
    return rows;
  }, [groupBy, monthShifts, wpById, formaOf, deducoesOf]);

  const groupSummaryTitle = groupBy === 'forma' ? 'Resumo por Forma de Recebimento' : 'Faturamento por Fonte Pagadora';

  // Detalhe (extrato) agrupado conforme a separação
  const detailGroups = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: '', shifts: shiftsToShow }];
    if (groupBy === 'forma') {
      return FORMA_ORDER
        .map(n => ({ key: n as string, label: FISCAL_NATURE_LABELS[n], shifts: shiftsToShow.filter(s => formaOf(s) === n) }))
        .filter(g => g.shifts.length > 0);
    }
    const map = new Map<string, Shift[]>();
    shiftsToShow.forEach(s => { const arr = map.get(s.workplace_id) || []; arr.push(s); map.set(s.workplace_id, arr); });
    return [...map.entries()].map(([id, sh]) => ({ key: id, label: wpById.get(id)?.name || 'Local', shifts: sh }));
  }, [groupBy, shiftsToShow, formaOf, wpById]);

  const [pdfLoading, setPdfLoading] = useState(false);

  const statusLabel: Record<string, string> = {
    previsto: 'Agendado',
    realizado: 'Realizado',
    recebido: 'Recebido',
    atrasado: 'Atrasado',
    cancelado: 'Cancelado',
  };

  const fmtCNPJ = (cnpj?: string) => cnpj
    ? cnpj.replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : 'Não informado';

  // Formata CPF ou CNPJ dependendo do regime do usuário (apenas para o usuário, não para workplaces)
  const fmtUserDoc = (doc?: string) => {
    if (!doc) return 'Não informado';
    const digits = doc.replace(/\D/g, '');
    if (user?.tax_regime === 'PF') {
      return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    }
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  };
  const userDocLabel = user?.tax_regime === 'PF' ? 'CPF:' : 'CNPJ:';
  const profileSectionTitle = user?.tax_regime === 'PF'
    ? '1. DADOS DO PROFISSIONAL (PF)'
    : '1. DADOS DO PROFISSIONAL (PJ)';
  const userNameOrRazao = user?.tax_regime === 'PF' ? 'Nome:' : 'Razão Social:';

  /** Monta o documento PDF do relatório — usado pelo download e pelo compartilhamento. */
  const buildPdfDoc = useCallback(() => {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW = 210;
      const pageH = 297;
      const ml = 15;
      const mr = 15;
      const contentW = pageW - ml - mr;
      let y = 18;

      const ensureSpace = (need: number) => {
        if (y + need > pageH - 15) {
          pdf.addPage();
          y = 18;
        }
      };

      // Title
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(15, 23, 42);
      pdf.text(docTitle.toUpperCase(), pageW / 2, y, { align: 'center' });
      y += 5;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`Mês de Competência: ${format(selectedMonth, 'MMMM / yyyy', { locale: ptBR })}`, pageW / 2, y, { align: 'center' });
      y += 4;
      pdf.setFontSize(8);
      pdf.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy')} às ${format(new Date(), 'HH:mm')} via Plantão Pro`, pageW / 2, y, { align: 'center' });
      y += 6;
      pdf.setDrawColor(226, 232, 240);
      pdf.line(ml, y, pageW - mr, y);
      y += 6;

      // 1. Dados da PJ
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(15, 23, 42);
      pdf.text(profileSectionTitle, ml, y);
      y += 5;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(51, 65, 85);
      const pjLines: [string, string][] = [
        [userNameOrRazao, user?.company_name || `${user?.name || ''}${user?.tax_regime === 'PF' ? '' : ' Serviços Médicos LTDA'}`],
        [userDocLabel, fmtUserDoc(user?.cnpj)],
        ['Responsável Técnico:', `Dr(a). ${nomeSemTitulo(user?.name)}`],
        ...(user?.crm ? [['CRM:', user.crm] as [string, string]] : []),
        ['Regime Tributário:', `${user?.tax_regime || 'Simples Nacional'}${!useFixedMei ? ` (${(taxRate * 100).toFixed(2)}%)` : ''}`],
      ];
      pjLines.forEach(([k, v]) => {
        ensureSpace(5);
        pdf.setFont('helvetica', 'bold');
        pdf.text(k, ml + 2, y);
        pdf.setFont('helvetica', 'normal');
        pdf.text(String(v), ml + 40, y);
        y += 4.5;
      });
      y += 4;

      // 2. Resumo Financeiro
      if (!isPendentes) {
        ensureSpace(40);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(15, 23, 42);
        pdf.text('2. RESUMO FINANCEIRO', ml, y);
        y += 5;
        const sumLines: [string, string, boolean][] = [
          ['Faturamento Bruto (Competência):', fmtCur(stats?.expected || 0), true],
          ['Total Efetivamente Recebido (Caixa):', fmtCur(stats?.received || 0), false],
          ['Total Pendente / A Receber:', fmtCur(stats?.pending || 0), false],
        ];
        if (totalDeducoes > 0) {
          sumLines.push(['Deduções / Retenções (ISS, INSS, IRRF...):', '- ' + fmtCur(totalDeducoes), false]);
          sumLines.push(['Líquido após retenções:', fmtCur(totalLiquido), true]);
        }
        sumLines.push([`${taxLabel}${!useFixedMei ? ` (${(taxRate * 100).toFixed(1)}%)` : ''}:`, fmtCur(taxAmount), true]);
        const boxH = sumLines.length * 5.5 + 3;
        ensureSpace(boxH + 4);
        pdf.setFillColor(248, 250, 252);
        pdf.setDrawColor(226, 232, 240);
        pdf.roundedRect(ml, y, contentW, boxH, 1.5, 1.5, 'FD');
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(51, 65, 85);
        let sy = y + 5;
        sumLines.forEach(([k, v, bold]) => {
          pdf.setFont('helvetica', bold ? 'bold' : 'normal');
          pdf.text(k, ml + 3, sy);
          pdf.text(v, pageW - mr - 3, sy, { align: 'right' });
          sy += 5.5;
        });
        y += boxH + 4;
      }

      // 3. Resumo por separação (Forma de recebimento OU Fonte pagadora)
      if (!isPendentes && groupSummary.length > 0) {
        ensureSpace(15);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(15, 23, 42);
        pdf.text(`3. ${groupSummaryTitle.toUpperCase()}`, ml, y);
        y += 5;
        groupSummary.forEach(g => {
          ensureSpace(10);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(9);
          pdf.setTextColor(30, 41, 59);
          pdf.text(g.label, ml + 2, y);
          if (groupBy !== 'forma') {
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(100, 116, 139);
            pdf.text(`(CNPJ: ${fmtCNPJ(wpById.get(g.key)?.cnpj)})`, ml + 2 + pdf.getTextWidth(g.label) + 2, y);
          }
          y += 4.5;
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(71, 85, 105);
          pdf.text(`Composição: ${g.count} ${g.count !== 1 ? 'plantões' : 'plantão'}`, ml + 2, y);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(15, 23, 42);
          pdf.text(`Bruto ${fmtCur(g.bruto)}`, pageW - mr - 2, y, { align: 'right' });
          y += 4.5;
          if (g.deducoes > 0) {
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(71, 85, 105);
            pdf.text(`Deduções - ${fmtCur(g.deducoes)} · Líquido ${fmtCur(g.liquido)}`, pageW - mr - 2, y, { align: 'right' });
            y += 4.5;
          }
          y += 1.5;
        });
        y += 2;
      }

      // 4. Tabela de Plantões (agrupada conforme a separação)
      if (!isResumido) {
        ensureSpace(20);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(15, 23, 42);
        pdf.text(isPendentes ? '2. PLANTÕES PENDENTES DE PAGAMENTO' : '4. EXTRATO DETALHADO DE PLANTÕES', ml, y);
        y += 6;

        const cols = [
          { label: 'Data', x: ml + 2, w: 22, align: 'left' as const },
          { label: 'Local', x: ml + 24, w: 70, align: 'left' as const },
          { label: 'Valor', x: pageW - mr - 45, w: 25, align: 'right' as const },
          { label: 'Status', x: pageW - mr - 2, w: 20, align: 'right' as const },
        ];

        pdf.setFontSize(8);
        pdf.setTextColor(100, 116, 139);
        pdf.setFont('helvetica', 'bold');
        cols.forEach(c => pdf.text(c.label, c.x, y, { align: c.align }));
        y += 1;
        pdf.setDrawColor(203, 213, 225);
        pdf.line(ml, y, pageW - mr, y);
        y += 4;

        detailGroups.forEach(group => {
          if (groupBy !== 'none') {
            ensureSpace(7);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8.5);
            pdf.setTextColor(37, 99, 235);
            pdf.text(group.label, cols[0].x, y);
            y += 4.5;
          }
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          group.shifts.forEach(s => {
            ensureSpace(6);
            const wp = workplaces.find(w => w.id === s.workplace_id);
            const isPending = s.status !== 'recebido';
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(51, 65, 85);
            pdf.text(format(new Date(s.date), 'dd/MM'), cols[0].x, y);
            const wpName = (wp?.name || '').slice(0, 38);
            pdf.text(wpName, cols[1].x, y);
            if (isPending) pdf.setTextColor(220, 38, 38); else pdf.setTextColor(30, 41, 59);
            pdf.setFont('helvetica', 'bold');
            pdf.text(fmtCur(s.expected_value), cols[2].x, y, { align: 'right' });
            pdf.setFont('helvetica', 'normal');
            if (isPending) pdf.setTextColor(239, 68, 68); else pdf.setTextColor(5, 150, 105);
            pdf.text(isPending ? 'Pendente' : 'Pago', cols[3].x, y, { align: 'right' });
            y += 4.5;
            pdf.setDrawColor(241, 245, 249);
            pdf.line(ml, y - 1, pageW - mr, y - 1);
          });
          if (groupBy !== 'none') {
            const sub = group.shifts.reduce((a, b) => a + b.expected_value, 0);
            ensureSpace(6);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.setTextColor(71, 85, 105);
            pdf.text(`Subtotal ${group.label}: ${fmtCur(sub)}`, pageW - mr - 2, y, { align: 'right' });
            y += 6;
          }
        });

        if (shiftsToShow.length === 0) {
          ensureSpace(8);
          pdf.setTextColor(148, 163, 184);
          pdf.text('Nenhum plantão encontrado.', pageW / 2, y, { align: 'center' });
          y += 6;
        }

        // Total row
        ensureSpace(8);
        pdf.setFillColor(248, 250, 252);
        pdf.rect(ml, y - 1, contentW, 7, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(15, 23, 42);
        pdf.text('TOTAL:', cols[1].x + 40, y + 3, { align: 'right' });
        pdf.text(fmtCur(totalTableValue), cols[2].x, y + 3, { align: 'right' });
        y += 10;
      }

      // Footer
      ensureSpace(8);
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(7);
      pdf.setTextColor(148, 163, 184);
      pdf.text('Este documento é um relatório gerencial e não substitui notas fiscais ou recibos oficiais.', pageW / 2, y + 4, { align: 'center' });

      return pdf;
  }, [selectedMonth, user, isMei, useFixedMei, taxRate, taxLabel, profileSectionTitle, userNameOrRazao, userDocLabel, isPendentes, isResumido, stats, taxAmount, wpBreakdown, workplaces, shiftsToShow, totalTableValue, docTitle, groupBy, groupSummary, groupSummaryTitle, detailGroups, wpById, totalDeducoes, totalLiquido]);

  const pdfFileName = `relatorio_${format(selectedMonth, 'yyyy-MM', { locale: ptBR })}.pdf`;

  async function handleDownloadPDF() {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      // No aplicativo Android isto abre a folha de compartilhamento (a janela
      // do app não tem pasta de downloads); na web, baixa o arquivo.
      await baixarArquivo(buildPdfDoc().output('blob'), pdfFileName, {
        title: 'Relatório Plantão Pro',
        text: `Relatório ${format(selectedMonth, 'MMMM yyyy', { locale: ptBR })} — Plantão Pro`,
      });
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setPdfLoading(false);
    }
  }

  /**
   * Compartilha o PDF como ARQUIVO via Web Share API — no celular abre a folha
   * nativa (WhatsApp, e-mail, etc.) com o PDF anexado. Quando o navegador não
   * suporta compartilhar arquivos (desktop), faz fallback: baixa o PDF e abre
   * o WhatsApp com o resumo em texto, para o usuário anexar o arquivo baixado.
   */
  async function handleSharePDF() {
    let pdfBlob: Blob | null = null;
    try {
      pdfBlob = buildPdfDoc().output('blob');
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar PDF. Tente novamente.');
      return;
    }
    const entregue = await entregarArquivo(pdfBlob, pdfFileName, {
      title: 'Relatório Plantão Pro',
      text: `Relatório ${format(selectedMonth, 'MMMM yyyy', { locale: ptBR })} — Plantão Pro`,
    });
    if (entregue) return;
    // Fallback (desktop sem compartilhar arquivo): baixa o PDF e abre o
    // WhatsApp com o resumo em texto, para o usuário anexar o arquivo.
    await baixarArquivo(pdfBlob, pdfFileName);
    handleWhatsApp();
  }

  const handleExportCSV = useCallback(() => {
    const lines: string[][] = [];
    const sep: string[] = [];

    lines.push([docTitle]);
    lines.push([`Mês de Competência: ${format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}`]);
    lines.push([`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`]);
    lines.push(sep);

    lines.push([profileSectionTitle]);
    lines.push([user?.tax_regime === 'PF' ? 'Nome' : 'Razão Social', user?.company_name || `${user?.name || ''}${user?.tax_regime === 'PF' ? '' : ' Serviços Médicos LTDA'}`]);
    lines.push([user?.tax_regime === 'PF' ? 'CPF' : 'CNPJ', fmtUserDoc(user?.cnpj)]);
    lines.push(['Responsável Técnico', `Dr(a). ${nomeSemTitulo(user?.name)}`]);
    if (user?.crm) lines.push(['CRM', user.crm]);
    lines.push(['Regime Tributário', `${user?.tax_regime || 'Simples Nacional'}${!useFixedMei ? ` (${(taxRate * 100).toFixed(2)}%)` : ''}`]);
    lines.push(sep);

    if (!isPendentes) {
      const brl = (v: number) => v.toFixed(2).replace('.', ',');
      lines.push(['2. RESUMO FINANCEIRO']);
      lines.push(['Faturamento Bruto', brl(stats?.expected || 0)]);
      lines.push(['Total Recebido', brl(stats?.received || 0)]);
      lines.push(['Total Pendente', brl(stats?.pending || 0)]);
      if (totalDeducoes > 0) {
        lines.push(['Deduções / Retenções', brl(totalDeducoes)]);
        lines.push(['Líquido após retenções', brl(totalLiquido)]);
      }
      lines.push([`${taxLabel}${!useFixedMei ? ` (${(taxRate * 100).toFixed(1)}%)` : ''}`, brl(taxAmount)]);
      lines.push(sep);

      if (groupSummary.length > 0) {
        lines.push([`3. ${groupSummaryTitle.toUpperCase()}`]);
        if (groupBy === 'forma') {
          lines.push(['Forma de Recebimento', 'Plantões', 'Bruto (R$)', 'Deduções (R$)', 'Líquido (R$)', 'Recebido (R$)']);
          groupSummary.forEach(g => lines.push([g.label, String(g.count), brl(g.bruto), brl(g.deducoes), brl(g.liquido), brl(g.received)]));
        } else {
          lines.push(['Local', 'CNPJ', 'Plantões', 'Bruto (R$)', 'Deduções (R$)', 'Líquido (R$)']);
          groupSummary.forEach(g => lines.push([g.label, fmtCNPJ(wpById.get(g.key)?.cnpj), String(g.count), brl(g.bruto), brl(g.deducoes), brl(g.liquido)]));
        }
        lines.push(sep);
      }
    }

    const brl2 = (v: number) => v.toFixed(2).replace('.', ',');
    lines.push([isPendentes ? '2. PLANTÕES PENDENTES DE PAGAMENTO' : '4. EXTRATO DETALHADO DE PLANTÕES']);
    lines.push(['Data', 'Local', 'CNPJ', 'Forma Recebimento', 'Horas', 'Bruto (R$)', 'Deduções (R$)', 'Líquido (R$)', 'Recebido (R$)', 'Status']);
    detailGroups.forEach(group => {
      if (groupBy !== 'none') lines.push([`— ${group.label} —`]);
      group.shifts.forEach(s => {
        const wp = workplaces.find(w => w.id === s.workplace_id);
        const ded = deducoesOf(s);
        lines.push([
          format(new Date(s.date), 'dd/MM/yyyy'),
          wp?.name || '',
          fmtCNPJ(wp?.cnpj),
          FISCAL_NATURE_LABELS[formaOf(s)],
          String(s.duration_hours ?? ''),
          brl2(s.expected_value),
          brl2(ded),
          brl2(s.expected_value - ded),
          s.received_value != null ? brl2(Number(s.received_value)) : '',
          statusLabel[s.status] || s.status,
        ]);
      });
      if (groupBy !== 'none') {
        const subBruto = group.shifts.reduce((a, b) => a + b.expected_value, 0);
        const subDed = group.shifts.reduce((a, b) => a + deducoesOf(b), 0);
        lines.push(['', '', '', `Subtotal ${group.label}`, '', brl2(subBruto), brl2(subDed), brl2(subBruto - subDed), '', '']);
      }
    });
    const totalExpected = shiftsToShow.reduce((a, b) => a + b.expected_value, 0);
    const totalReceived = shiftsToShow.reduce((a, b) => a + (b.received_value || 0), 0);
    const totalDed = shiftsToShow.reduce((a, b) => a + deducoesOf(b), 0);
    lines.push(['', '', '', 'TOTAL', '', brl2(totalExpected), brl2(totalDed), brl2(totalExpected - totalDed), brl2(totalReceived), '']);

    const bom = '﻿';
    const csv = bom + lines.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    void baixarArquivo(blob, `relatorio_${format(selectedMonth, 'yyyy-MM', { locale: ptBR })}.csv`, {
      title: 'Planilha Plantão Pro',
    });
  }, [selectedMonth, user, isMei, useFixedMei, taxRate, taxLabel, profileSectionTitle, userNameOrRazao, userDocLabel, isPendentes, stats, taxAmount, wpBreakdown, workplaces, shiftsToShow, docTitle, statusLabel, groupBy, groupSummary, groupSummaryTitle, detailGroups, wpById, formaOf, deducoesOf, totalDeducoes, totalLiquido]);

  // ---- Apresentação ----
  const [brutoInt, brutoCents] = splitCur(stats?.expected || 0);
  const canTaxForecast = can('tax_forecast') || isGuest;
  const totalShiftsCount = stats?.totalShifts || 0;

  // "Extrato fiscal · Setembro 2026"
  const mesNome = format(selectedMonth, 'MMMM', { locale: ptBR });
  const mesLabel = `${mesNome.charAt(0).toUpperCase()}${mesNome.slice(1)} ${year}`;

  // Treliça do extrato: rótulo curto do imposto conforme o regime
  const taxShortLabel = (() => {
    const r = user?.tax_regime || 'Simples Nacional';
    if (r === 'MEI') return t('DAS MEI');
    if (r === 'Lucro Presumido') return t('Provisão de impostos');
    if (r === 'PF') return t('Carnê-Leão estimado');
    return t('Provisão DAS');
  })();
  // "Simples · 6%" · "MEI · valor fixo"
  const regimeAtual = user?.tax_regime || 'Simples Nacional';
  const regimeLabel = `${REGIME_CURTO[regimeAtual] ?? regimeAtual} · ${
    useFixedMei ? t('valor fixo') : `${userRate.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
  }`;
  // "10 · 144 h"
  const plantoesLabel = `${totalShiftsCount} · ${(stats?.totalHours || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;

  // Por fonte pagadora — na ordem de cadastro dos locais
  const fontes = workplaces.filter(w => wpBreakdown[w.id]);

  const formatOptions: { key: PreviewFormat; title: string; desc: string }[] = [
    { key: 'completo', title: 'Relatório completo', desc: 'Resumo do CNPJ + tabela dia a dia' },
    { key: 'resumido', title: 'Apenas resumo fiscal', desc: 'Ideal para o contador (sem tabela)' },
    { key: 'pendentes', title: 'Extrato de cobrança', desc: 'Mostra apenas plantões não pagos' },
  ];

  const groupOptions: { key: GroupBy; title: string; desc: string }[] = [
    { key: 'forma', title: 'Por forma de recebimento', desc: 'Separa por PJ e Autônomo (RPA) — ideal quando o regime varia por local.' },
    { key: 'local', title: 'Por local', desc: 'Agrupa os plantões por hospital / fonte pagadora.' },
    { key: 'none', title: 'Consolidado', desc: 'Lista única, sem separação.' },
  ];

  return (
    <div className="page-content pb-0 bg-white relative overflow-hidden h-full min-h-screen">

      {/* Cabeçalho em papel — pretítulo, título e abas Mês/Ano */}
      <header className="bg-slate-50 px-6 pt-[56px] pb-[22px] shrink-0">
        <p className="text-[13px] font-normal text-slate-500">{t('Contabilidade')}</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <h1 className="text-[28px] font-light leading-none tracking-[-0.035em] text-slate-900">{t('Relatórios')}</h1>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setShowHelp(true)}
              className="w-[34px] h-[34px] shrink-0 rounded-xl border border-slate-200 bg-white text-slate-600 flex items-center justify-center p-0 transition-colors hover:border-blue-600 hover:text-blue-600"
              title="Sobre esta tela"
              aria-label={t('Sobre esta tela')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3v1.1" />
                <circle cx="12" cy="16.6" r=".7" fill="currentColor" />
              </svg>
            </button>
            <button onClick={() => setShowSettingsModal(true)}
              className="w-[34px] h-[34px] shrink-0 rounded-xl border border-slate-200 bg-white text-slate-600 flex items-center justify-center p-0 transition-colors hover:border-blue-600 hover:text-blue-600"
              title="Configurações"
              aria-label={t('Configurações')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mês / Ano — abas com filete de 1.5px (o filete de 1px fica abaixo do papel) */}
        <div className="tab-rule border-b-0 mt-6" role="tablist">
          <button role="tab" aria-selected={activeTab === 'mes'} onClick={() => setActiveTab('mes')}>
            {t('Mês')}
          </button>
          <button role="tab" aria-selected={activeTab === 'ano'}
            onClick={() => gate('annual_reports', () => setActiveTab('ano'))}
            className="flex items-center gap-1.5">
            {t('Ano')}
            {!can('annual_reports') && <Crown size={11} strokeWidth={1.8} className="text-slate-400" />}
          </button>
        </div>
      </header>
      <div className="h-px" style={{ background: 'var(--color-border)' }} aria-hidden="true" />

      <main className="flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar bg-white px-6 pt-[22px] pb-[118px]">

        {activeTab === 'mes' && (
          <>
            {/* Extrato fiscal — cartão de pedra, raio 24 (única superfície marmoreada da tela) */}
            <section className="relative overflow-hidden rounded-[24px]">
              <div className="absolute inset-0" style={STONE_TEXTURE} aria-hidden="true" />
              <div className="absolute inset-0" style={STONE_VEIL} aria-hidden="true" />

              <div className="relative p-6 text-white">
                {/* Linha de topo: "Extrato fiscal · mês" + seletor de mês (botão redondo de chevron) */}
                <div className="group relative flex items-start justify-between gap-4 cursor-pointer">
                  <h2 className="min-w-0 text-[13.5px] font-medium text-white/[.82]">
                    {t('Extrato fiscal')} · {mesLabel}
                  </h2>
                  <span
                    className="w-[30px] h-[30px] shrink-0 rounded-full border border-white/[.28] bg-white/[.12] text-white flex items-center justify-center transition-colors group-hover:bg-white/[.24]"
                    aria-hidden="true"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                  {/* input type="month" → ativa o picker nativo do smartphone (iOS/Android) */}
                  <input
                    type="month"
                    value={`${year}-${String(month).padStart(2, '0')}`}
                    max={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`}
                    onChange={e => {
                      if (!e.target.value) return;
                      const [y, m] = e.target.value.split('-').map(Number);
                      if (!isNaN(y) && !isNaN(m)) setSelectedMonth(new Date(y, m - 1, 1));
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    aria-label="Selecionar mês de competência"
                  />
                </div>

                {/* Faturamento bruto — 38/200 com centavos 22/300 */}
                <p className="mt-[22px] text-[13.5px] font-medium text-white/80">{t('Faturamento bruto')}</p>
                <p className="mt-2 text-[38px] font-extralight leading-none tracking-[-0.04em] text-white tabular-nums">
                  {brutoInt}
                  <span className="text-[22px] font-light text-white/80">{brutoCents}</span>
                </p>

                {/* Treliça 2×2 de filetes brancos translúcidos */}
                <div className="grid grid-cols-2 mt-6" style={{ borderTop: STONE_RULE }}>
                  {canTaxForecast ? (
                    <div
                      className="py-3.5 pr-4 min-w-0"
                      style={{ borderRight: STONE_RULE, borderBottom: STONE_RULE }}
                      title="*Valores para planejamento. Consulte seu contador para emissão da guia oficial."
                    >
                      <p className="text-[12.5px] font-medium text-white/[.76]">{taxShortLabel}</p>
                      <p className="mt-[5px] text-[16px] text-white tabular-nums">{fmtCur(taxAmount)}</p>
                    </div>
                  ) : (
                    /* Previsão tributária é recurso Max: bloqueio discreto dentro da célula */
                    <button
                      type="button"
                      onClick={() => gate('tax_forecast')}
                      className="py-3.5 pr-4 min-w-0 text-left"
                      style={{ borderRight: STONE_RULE, borderBottom: STONE_RULE }}
                      title={t('Toque para desbloquear')}
                    >
                      <span className="block text-[12.5px] font-medium text-white/[.76]">{taxShortLabel}</span>
                      <span className="mt-[5px] flex items-center gap-1.5 text-[16px] text-white">
                        <Lock size={14} strokeWidth={1.6} className="shrink-0" aria-hidden="true" />
                        {t('Recurso')} Max
                      </span>
                      <span className="sr-only">{t('Toque para desbloquear')}</span>
                    </button>
                  )}
                  <div className="py-3.5 pl-4 min-w-0" style={{ borderBottom: STONE_RULE }}>
                    <p className="text-[12.5px] font-medium text-white/[.76]">{t('Regime')}</p>
                    <p className="mt-[5px] text-[16px] text-white tabular-nums">{regimeLabel}</p>
                  </div>
                  <div className="pt-3.5 pr-4 min-w-0" style={{ borderRight: STONE_RULE }}>
                    <p className="text-[12.5px] font-medium text-white/[.76]">{t('Plantões')}</p>
                    <p className="mt-[5px] text-[16px] text-white tabular-nums">{plantoesLabel}</p>
                  </div>
                  <div className="pt-3.5 pl-4 min-w-0">
                    <p className="text-[12.5px] font-medium text-white/[.76]">{t('Pendente')}</p>
                    <p className="mt-[5px] text-[16px] text-white tabular-nums">{fmtCur(stats?.pending || 0)}</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Relatório para o contador (unificado · Max) — cartão em papel, raio 20 */}
            <button
              onClick={openReport}
              className="mt-[22px] w-full flex items-center gap-[14px] p-[18px] rounded-[20px] border border-slate-200 bg-slate-50 text-left transition-colors hover:border-blue-600"
            >
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-[14.5px] font-medium text-slate-900">{t('Relatório para o contador')}</span>
                  {!canFiscalReport && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 shrink-0">
                      <Crown size={11} strokeWidth={1.8} className="text-slate-400" /> Max
                    </span>
                  )}
                </span>
                <span className="block mt-1 text-[12.5px] text-slate-500 leading-[1.55]">
                  {t('PDF e planilha do mês, separados por forma de recebimento ou por local.')}
                </span>
              </span>
              <ChevronRight size={18} strokeWidth={1.5} className="text-slate-500 shrink-0" />
            </button>

            {/* Compartilhar — par de botões de 48px, sem título */}
            <div className="flex gap-2.5 mt-2.5">
              <button
                onClick={() => gate('whatsapp_accountant', () => requireSignup('Compartilhar via WhatsApp', handleSharePDF))}
                className="btn-secondary flex-1 min-w-0 px-3 flex items-center justify-center gap-[9px]">
                <WhatsAppIcon size={17} className="shrink-0" />
                WhatsApp
                {!can('whatsapp_accountant') && <Crown size={12} strokeWidth={1.8} className="text-slate-400 shrink-0" />}
              </button>
              <button
                onClick={() => requireSignup('Enviar por e-mail', handleEmail)}
                className="btn-secondary flex-1 min-w-0 px-3 flex items-center justify-center gap-[9px]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0" aria-hidden="true">
                  <rect x="3" y="5.5" width="18" height="13" rx="2" />
                  <path d="M3.5 7l8.5 6 8.5-6" />
                </svg>
                E-mail
              </button>
            </div>

            {/* Por fonte pagadora — régua na cor do local */}
            <div className="section-rule mt-[34px] mb-2"><span>{t('Por fonte pagadora')}</span></div>
            <div>
              {fontes.map(wp => {
                const data = wpBreakdown[wp.id];
                return (
                  <div key={wp.id} className="flex items-start justify-between gap-4 py-4" style={{ borderBottom: RULE }}>
                    <div className="place-rule min-w-0" style={{ borderLeftColor: wp.color }}>
                      <p className="text-[14.5px] font-medium tracking-[-0.01em] text-slate-900 truncate">{wp.name}</p>
                      <p className="mt-1 text-[12.5px] text-slate-500 tabular-nums truncate">
                        {data.shifts} {data.shifts !== 1 ? t('plantões') : t('plantão')} · {t(capMetodo(wp.payment_method))}
                      </p>
                    </div>
                    <p className="shrink-0 text-[15px] text-slate-900 tabular-nums">{fmtCur(data.total)}</p>
                  </div>
                );
              })}
              {fontes.length === 0 && (
                <p className="py-6 text-center text-[13px] text-slate-500">{t('Nenhum plantão neste mês')}</p>
              )}
            </div>
          </>
        )}

        {activeTab === 'ano' && (
          <div className="notice">
            <p className="text-[13.5px] text-slate-600 leading-[1.55]">
              Visualização anual será disponibilizada em breve.
            </p>
          </div>
        )}
      </main>

      {/* ========================================================= */}
      {/* TELA DE PRÉ-VISUALIZAÇÃO (INTEGRADA E DESLIZANTE)         */}
      {/* ========================================================= */}
      <div
        className="fixed inset-0 z-50 flex justify-center transform transition-transform duration-300 ease-in-out"
        style={{ transform: showPreview ? 'translateX(0)' : 'translateX(100%)', background: 'var(--color-bg)' }}
      >
       {/* Sombra só com a prévia aberta: fechada (translateX 100%) ela vazava pela borda direita da tela. */}
       <div className={`w-full max-w-[430px] h-full bg-slate-50 flex flex-col relative overflow-hidden ${showPreview ? 'shadow-xl' : ''}`}>
        {/* Cabeçalho + filtros */}
        <div className="bg-white shrink-0 z-20" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <header className="px-4 pt-7 pb-3 flex items-center gap-2">
            <button
              onClick={() => setShowPreview(false)}
              className="icon-btn w-10 h-10 flex items-center justify-center shrink-0"
              aria-label={t('Voltar')}
            >
              <ChevronLeft size={22} strokeWidth={1.5} />
            </button>
            <div className="min-w-0">
              <h1 className="text-[22px] font-light leading-tight tracking-[-0.03em] text-slate-900">Pré-visualização</h1>
              <p className="mt-0.5 text-[12.5px] text-slate-500 tabular-nums">Relatório fiscal · {format(selectedMonth, 'MMM/yyyy', { locale: ptBR })}</p>
            </div>
          </header>

          {/* Barra de filtros — botões contornados */}
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto hide-scrollbar">
            <button
              onClick={() => setShowFormatModal(true)}
              className="flex items-center gap-2.5 h-12 pl-3 pr-2.5 rounded-xl border border-slate-200 bg-white shrink-0 hover:border-blue-600 transition-colors"
            >
              <FileText size={17} strokeWidth={1.5} className="text-blue-600 shrink-0" />
              <span className="text-left">
                <span className="block text-[11px] text-slate-500 leading-none">Formato</span>
                <span className="block mt-1 text-[13px] font-medium text-slate-900 leading-none">{formatLabels[previewFormat]}</span>
              </span>
              <ChevronDown size={15} strokeWidth={1.5} className="text-slate-400 ml-1 shrink-0" />
            </button>
            <button
              onClick={() => setShowGroupModal(true)}
              className="flex items-center gap-2.5 h-12 pl-3 pr-2.5 rounded-xl border border-slate-200 bg-white shrink-0 hover:border-blue-600 transition-colors"
            >
              <Layers size={17} strokeWidth={1.5} className="text-blue-600 shrink-0" />
              <span className="text-left">
                <span className="block text-[11px] text-slate-500 leading-none">Separar por</span>
                <span className="block mt-1 text-[13px] font-medium text-slate-900 leading-none">{GROUP_LABELS[groupBy]}</span>
              </span>
              <ChevronDown size={15} strokeWidth={1.5} className="text-slate-400 ml-1 shrink-0" />
            </button>
          </div>
        </div>

        {/* Área de Rolagem do Documento */}
        <main className="flex-1 overflow-y-auto hide-scrollbar">
          {/* Documento (folha de papel) — sem flex-1 para acompanhar o tamanho real do conteúdo */}
          <div
            className="bg-white m-4 p-5 rounded-sm text-[12px] leading-[1.5] text-slate-700"
            style={{ border: '1px solid var(--color-border)', boxShadow: '0 18px 44px -26px rgba(7,56,45,.22)' }}
          >

            <div className="text-center mb-5">
              <h2 className="text-[16px] font-semibold leading-snug tracking-[-0.015em] text-slate-900">{docTitle}</h2>
              <p className="mt-1.5 text-[12px] text-slate-500">Mês de Competência: {format(selectedMonth, 'MMMM / yyyy', { locale: ptBR })}</p>
              <p className="mt-0.5 text-[10.5px] text-slate-500">Gerado em: {format(new Date(), 'dd/MM/yyyy')} às {format(new Date(), 'HH:mm')} via Plantão Pro</p>
            </div>

            <hr className="border-slate-200 mb-5" />

            {/* 1. Dados do Profissional */}
            <div className="mb-6">
              <h3 className="mb-2 text-[13px] font-semibold tracking-[-0.01em] text-slate-900">
                1. {user?.tax_regime === 'PF' ? 'Dados do Profissional (PF)' : 'Dados do Profissional (PJ)'}
              </h3>
              <div className="grid grid-cols-1 gap-1">
                <p><span className="text-slate-500">{user?.tax_regime === 'PF' ? 'Nome:' : 'Razão Social:'}</span> <span className="text-slate-900">{user?.company_name || `${user?.name || ''}${user?.tax_regime === 'PF' ? '' : ' Serviços Médicos LTDA'}`}</span></p>
                <p className="tabular-nums">
                  <span className="text-slate-500">{user?.tax_regime === 'PF' ? 'CPF:' : 'CNPJ:'}</span>{' '}
                  <span className="text-slate-900">
                    {user?.cnpj
                      ? (user.tax_regime === 'PF'
                          ? user.cnpj.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
                          : user.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'))
                      : 'Não informado'}
                  </span>
                </p>
                <p><span className="text-slate-500">Responsável Técnico:</span> <span className="text-slate-900">Dr(a). {nomeSemTitulo(user?.name)}</span></p>
                {user?.crm && <p><span className="text-slate-500">CRM:</span> <span className="text-slate-900">{user.crm}</span></p>}
                <p><span className="text-slate-500">Regime Tributário:</span> <span className="text-slate-900">{user?.tax_regime || 'Simples Nacional'}{!useFixedMei && ` (${(taxRate * 100).toFixed(2)}%)`}</span></p>
              </div>
            </div>

            {/* 2. Resumo Financeiro (oculto se Extrato de Cobrança) — treliça de dados */}
            {!isPendentes && (
              <div className="mb-6 transition-all">
                <h3 className="mb-1 text-[13px] font-semibold tracking-[-0.01em] text-slate-900">2. Resumo Financeiro</h3>
                <div className="data-lattice">
                  <div>
                    <p className="text-[11px] leading-snug text-slate-500">Faturamento Bruto (Competência)</p>
                    <p className="mt-1 text-[14px] font-semibold text-slate-900 tabular-nums">{fmtCur(stats?.expected || 0)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] leading-snug text-slate-500">Total Efetivamente Recebido (Caixa)</p>
                    <p className="mt-1 text-[14px] text-slate-900 tabular-nums">{fmtCur(stats?.received || 0)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] leading-snug text-slate-500">Total Pendente / A Receber</p>
                    <p className="mt-1 text-[14px] text-slate-900 tabular-nums">{fmtCur(stats?.pending || 0)}</p>
                  </div>
                  {totalDeducoes > 0 && (
                    <>
                      <div>
                        <p className="text-[11px] leading-snug text-slate-500">Deduções / Retenções (ISS, INSS, IRRF…)</p>
                        <p className="mt-1 text-[14px] text-red-600 tabular-nums">− {fmtCur(totalDeducoes)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] leading-snug text-slate-500">Líquido após retenções</p>
                        <p className="mt-1 text-[14px] font-semibold text-blue-700 tabular-nums">{fmtCur(totalLiquido)}</p>
                      </div>
                    </>
                  )}
                  <div>
                    <p className="text-[11px] leading-snug text-slate-500">{taxLabel}{!useFixedMei ? ` (${(taxRate * 100).toFixed(1)}%)` : ''}</p>
                    <p className="mt-1 text-[14px] font-semibold text-slate-900 tabular-nums">{fmtCur(taxAmount)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Resumo conforme a separação (oculto se Extrato de Cobrança) */}
            {!isPendentes && groupSummary.length > 0 && (
              <div className="mb-6 transition-all">
                <h3 className="mb-1 text-[13px] font-semibold tracking-[-0.01em] text-slate-900">3. {groupSummaryTitle}</h3>
                {groupSummary.map(g => (
                  <div key={g.key} className="py-2.5 border-b border-slate-200">
                    <p className="font-medium text-slate-900">
                      {g.label}
                      {groupBy !== 'forma' && (
                        <span className="font-normal text-slate-500 tabular-nums"> (CNPJ: {wpById.get(g.key)?.cnpj || 'Não informado'})</span>
                      )}
                    </p>
                    <div className="mt-0.5 flex justify-between gap-3">
                      <span className="text-slate-500">Composição: {g.count} {g.count !== 1 ? 'plantões' : 'plantão'}</span>
                      <span className="font-semibold text-slate-900 tabular-nums whitespace-nowrap">{fmtCur(g.bruto)}</span>
                    </div>
                    {g.deducoes > 0 && (
                      <div className="mt-0.5 flex justify-between gap-3 text-[11px] tabular-nums">
                        <span className="text-red-600">Deduções − {fmtCur(g.deducoes)}</span>
                        <span className="font-semibold text-blue-700">Líquido {fmtCur(g.liquido)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 4. Tabela de Plantões (agrupada conforme a separação; oculta se Resumido) */}
            {!isResumido && (
              <div className="mb-2 transition-all duration-300">
                <h3 className="mb-2 text-[13px] font-semibold tracking-[-0.01em] text-slate-900">
                  {isPendentes ? '2. Plantões Pendentes de Pagamento' : '4. Extrato Detalhado de Plantões'}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse tabular-nums">
                    <thead>
                      <tr>
                        <th className="py-2 border-b border-slate-300 text-[11px] font-medium text-slate-500">Data</th>
                        <th className="py-2 border-b border-slate-300 text-[11px] font-medium text-slate-500">Local</th>
                        <th className="py-2 border-b border-slate-300 text-[11px] font-medium text-slate-500 text-right">Valor</th>
                        <th className="py-2 border-b border-slate-300 text-[11px] font-medium text-slate-500 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailGroups.map(group => (
                        <React.Fragment key={group.key}>
                          {groupBy !== 'none' && (
                            <tr>
                              <td colSpan={4} className="pt-3.5 pb-1 text-[12px] font-semibold text-blue-600">{group.label}</td>
                            </tr>
                          )}
                          {group.shifts.map(s => {
                            const wp = workplaces.find(w => w.id === s.workplace_id);
                            const isPending = s.status !== 'recebido';
                            return (
                              <tr key={s.id} className="border-b border-slate-100">
                                <td className="py-2 pl-0.5">{format(new Date(s.date), 'dd/MM')}</td>
                                <td className="py-2 truncate max-w-[100px] text-slate-700">{wp?.name}</td>
                                <td className="py-2 text-right">
                                  <span className={isPending ? 'text-red-600' : 'text-slate-900'}>{fmtCur(s.expected_value)}</span>
                                  {deducoesOf(s) > 0 && (
                                    <span className="block text-[10px] text-slate-500 leading-none mt-0.5">líq {fmtCur(s.expected_value - deducoesOf(s))}</span>
                                  )}
                                </td>
                                <td className={`py-2 text-right pr-0.5 ${isPending ? 'text-red-600' : 'text-blue-600'}`}>
                                  {isPending ? 'Pendente' : 'Pago'}
                                </td>
                              </tr>
                            );
                          })}
                          {groupBy !== 'none' && (
                            <tr>
                              <td colSpan={2} className="py-1.5 text-right text-slate-500 text-[11px]">Subtotal {group.label}</td>
                              <td className="py-1.5 text-right font-semibold text-[11px] text-slate-700">{fmtCur(group.shifts.reduce((a, b) => a + b.expected_value, 0))}</td>
                              <td></td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                      {shiftsToShow.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-5 text-center text-slate-500">Nenhum plantão encontrado.</td>
                        </tr>
                      )}

                      {/* Linha final / Total */}
                      <tr className="bg-slate-50">
                        <td colSpan={2} className="py-2.5 font-semibold text-right border-t border-slate-300 text-slate-900">Total</td>
                        <td className="py-2.5 font-semibold text-right border-t border-slate-300 pr-0.5 text-slate-900">
                          {fmtCur(totalTableValue)}
                        </td>
                        <td className="border-t border-slate-300"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-8 text-center text-[10.5px] leading-snug text-slate-500">
              <p>Este documento é um relatório gerencial e não substitui notas fiscais ou recibos oficiais.</p>
            </div>

          </div>

          {/* Ações no Rodapé — sticky bottom:0 garante que fique visível durante o scroll,
              mas naturalmente próximo do documento quando o conteúdo é curto */}
          <div
            className="sticky bottom-0 left-0 w-full bg-white px-4 pt-4 z-20"
            style={{ borderTop: '1px solid var(--color-border)', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <button
              onClick={() => requireSignup('Baixar PDF', handleDownloadPDF)}
              disabled={pdfLoading}
              className="btn-primary disabled:opacity-60"
            >
              {pdfLoading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} strokeWidth={1.6} />}
              {pdfLoading ? t('Gerando...') : t('Baixar PDF')}
            </button>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <button
                onClick={() => requireSignup('Exportar CSV', handleExportCSV)}
                className="btn-secondary px-3 flex items-center justify-center gap-2"
              >
                <FileText size={17} strokeWidth={1.5} className="text-blue-600 shrink-0" />
                {t('Exportar CSV')}
              </button>
              <button
                onClick={() => setShowShareModal(true)}
                className="btn-secondary px-3 flex items-center justify-center gap-2"
              >
                <WhatsAppIcon size={16} className="text-blue-600 shrink-0" />
                {t('Compartilhar')}
              </button>
            </div>
          </div>
        </main>
       </div>
      </div>

      {/* ========================================================= */}
      {/* MODAL DE SELEÇÃO DE FORMATO                                 */}
      {/* ========================================================= */}
      {showFormatModal && (
        <div className="modal-overlay z-[60] animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden animate-scale-in" style={MODAL_SHADOW}>
            <div className="p-6 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-[22px] font-light leading-tight tracking-[-0.03em] text-slate-900">Formato do documento</h3>
                <p className="mt-1.5 text-[13px] text-slate-500">Defina o nível de detalhamento do PDF</p>
              </div>
              <button
                onClick={() => setShowFormatModal(false)}
                className="icon-btn w-9 h-9 -mr-2 -mt-1 flex items-center justify-center shrink-0"
                aria-label={t('Fechar')}
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            <div className="px-6 pb-6">
              <div role="radiogroup" className="border-t border-slate-200">
                {formatOptions.map(opt => (
                  <ChoiceRow
                    key={opt.key}
                    name="formato"
                    value={opt.key}
                    checked={previewFormat === opt.key}
                    onSelect={() => { setPreviewFormat(opt.key); setShowFormatModal(false); }}
                    title={opt.title}
                    desc={opt.desc}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: SEPARAR OS GANHOS POR                                */}
      {/* ========================================================= */}
      {showGroupModal && (
        <div className="modal-overlay z-[60] animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden animate-scale-in" style={MODAL_SHADOW}>
            <div className="p-6 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-[22px] font-light leading-tight tracking-[-0.03em] text-slate-900">Separar os ganhos</h3>
                <p className="mt-1.5 text-[13px] text-slate-500">Como o relatório agrupa os plantões</p>
              </div>
              <button
                onClick={() => setShowGroupModal(false)}
                className="icon-btn w-9 h-9 -mr-2 -mt-1 flex items-center justify-center shrink-0"
                aria-label={t('Fechar')}
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            <div className="px-6 pb-6">
              <div role="radiogroup" className="border-t border-slate-200">
                {groupOptions.map(opt => (
                  <ChoiceRow
                    key={opt.key}
                    name="groupby"
                    value={opt.key}
                    checked={groupBy === opt.key}
                    onSelect={() => { setGroupBy(opt.key); setShowGroupModal(false); }}
                    title={opt.title}
                    desc={opt.desc}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL DE CONFIGURAÇÕES CONTÁBEIS                            */}
      {/* ========================================================= */}
      {showSettingsModal && (
        <div className="modal-overlay z-[70] animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden animate-scale-in max-h-[86vh] flex flex-col" style={MODAL_SHADOW}>
            <div className="p-6 pb-4 flex items-start justify-between gap-4 shrink-0">
              <div className="min-w-0">
                <h3 className="text-[22px] font-light leading-tight tracking-[-0.03em] text-slate-900">Configurações contábeis</h3>
                <p className="mt-1.5 text-[13px] text-slate-500">Ajuste seus parâmetros fiscais</p>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="icon-btn w-9 h-9 -mr-2 -mt-1 flex items-center justify-center shrink-0"
                aria-label={t('Fechar')}
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            <div className="px-6 pb-2 overflow-y-auto flex-1 hide-scrollbar">
              <p className="input-label" id="rel-regime-label">{t('Regime Tributário')}</p>
              <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="rel-regime-label">
                {(['MEI', 'Simples Nacional', 'Lucro Presumido', 'PF'] as const).map(regime => {
                  const isSel = settingsData.tax_regime === regime;
                  // Valor de alíquota recomendado para cada regime (ponto inicial sugerido)
                  const recommendedRate: Record<typeof regime, number> = {
                    'MEI': 0,
                    'Simples Nacional': 6,
                    'Lucro Presumido': 13.33,
                    'PF': 27.5,
                  };
                  return (
                    <button
                      key={regime}
                      type="button"
                      aria-pressed={isSel}
                      onClick={() => setSettingsData(p => ({
                        ...p,
                        tax_regime: regime,
                        tax_rate: recommendedRate[regime],
                      }))}
                      className="chip w-full"
                    >
                      {regime}
                    </button>
                  );
                })}
              </div>

              {/* Ajuda do regime escolhido */}
              <div className="notice mt-3">
                <p className="text-[12.5px] leading-[1.55] text-slate-600">
                  {settingsData.tax_regime === 'MEI'
                    ? 'Geralmente R$ 75,60/mês fixo. Defina uma alíquota personalizada se necessário.'
                    : settingsData.tax_regime === 'Simples Nacional'
                      ? 'A partir de 6% (Anexo III) ou 15,5% (Anexo V).'
                      : settingsData.tax_regime === 'Lucro Presumido'
                        ? 'Entre 13,33% e 16,33% (IRPJ + CSLL + PIS + COFINS + ISS).'
                        : 'Até 27,5% (IRPF) + 20% (INSS) + 2% a 5% (ISS).'}
                </p>
              </div>

              <div className="mt-5">
                <label htmlFor="rel-tax-rate" className="input-label">{t('Alíquota (%)')}</label>
                <input
                  id="rel-tax-rate"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={String(settingsData.tax_rate).replace('.', ',')}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9.,]/g, '');
                    const normalized = raw.replace(',', '.');
                    const parsed = parseFloat(normalized);
                    setSettingsData(p => ({ ...p, tax_rate: isNaN(parsed) ? 0 : parsed }));
                  }}
                  className="input-field tabular-nums"
                  placeholder="6,0"
                />
              </div>

              <div className="section-rule mt-6 mb-3"><span>Dados do documento (PDF)</span></div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="rel-company-name" className="input-label">Razão Social</label>
                  <input
                    id="rel-company-name"
                    type="text"
                    value={settingsData.company_name}
                    onChange={(e) => setSettingsData(p => ({ ...p, company_name: e.target.value }))}
                    className="input-field"
                    placeholder="Ex: Dr. João Serviços Médicos"
                  />
                </div>

                {/* CNPJ ou CPF — depende do regime tributário selecionado */}
                {(() => {
                  const isPF = settingsData.tax_regime === 'PF';
                  const label = isPF ? 'CPF' : 'CNPJ';
                  const placeholder = isPF ? '000.000.000-00' : '00.000.000/0001-00';
                  const maxLen = isPF ? 11 : 14;
                  return (
                    <div>
                      <label htmlFor="rel-doc-number" className="input-label">{label}</label>
                      <input
                        id="rel-doc-number"
                        type="text"
                        inputMode="numeric"
                        value={settingsData.cnpj}
                        onChange={(e) => {
                          let val = e.target.value.replace(/\D/g, '');
                          if (val.length > maxLen) val = val.slice(0, maxLen);
                          let formatted = val;
                          if (isPF) {
                            // CPF: 000.000.000-00
                            if (val.length > 9) formatted = val.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2}).*/, '$1.$2.$3-$4');
                            else if (val.length > 6) formatted = val.replace(/^(\d{3})(\d{3})(\d{0,3}).*/, '$1.$2.$3');
                            else if (val.length > 3) formatted = val.replace(/^(\d{3})(\d{0,3}).*/, '$1.$2');
                          } else {
                            // CNPJ: 00.000.000/0001-00
                            if (val.length > 12) formatted = val.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, '$1.$2.$3/$4-$5');
                            else if (val.length > 8) formatted = val.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4}).*/, '$1.$2.$3/$4');
                            else if (val.length > 5) formatted = val.replace(/^(\d{2})(\d{3})(\d{0,3}).*/, '$1.$2.$3');
                            else if (val.length > 2) formatted = val.replace(/^(\d{2})(\d{0,3}).*/, '$1.$2');
                          }
                          setSettingsData(p => ({ ...p, cnpj: formatted }));
                        }}
                        className="input-field tabular-nums"
                        placeholder={placeholder}
                      />
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="px-6 pt-4 pb-6 shrink-0">
              <button
                onClick={() => {
                  updateProfile({
                    tax_regime: settingsData.tax_regime as any,
                    tax_rate: settingsData.tax_rate,
                    company_name: settingsData.company_name,
                    cnpj: settingsData.cnpj.replace(/\D/g, '')
                  });
                  setShowSettingsModal(false);
                }}
                className="btn-primary"
              >
                Salvar configurações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL DE COMPARTILHAMENTO (WhatsApp / Email)               */}
      {/* ========================================================= */}
      {showShareModal && (
        <div className="modal-overlay z-[80] animate-fade-in" onClick={() => setShowShareModal(false)}>
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden animate-scale-in" style={MODAL_SHADOW} onClick={e => e.stopPropagation()}>
            <div className="p-6 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[13px] text-slate-500">{t('Compartilhar')}</p>
                <h3 className="mt-1 text-[22px] font-light leading-tight tracking-[-0.03em] text-slate-900">{t('Enviar relatório')}</h3>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="icon-btn w-9 h-9 -mr-2 -mt-1 flex items-center justify-center shrink-0"
                aria-label={t('Fechar')}
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            <div className="px-6 pb-6">
              <div className="border-t border-slate-200">
                {/* WhatsApp — envio ao contador é recurso Max (compartilha o PDF como arquivo) */}
                <button
                  onClick={() => {
                    if (!gate('whatsapp_accountant')) { setShowShareModal(false); return; }
                    if (!requireSignup('Compartilhar via WhatsApp', () => { handleSharePDF(); setShowShareModal(false); })) {
                      setShowShareModal(false);
                    }
                  }}
                  className="list-row w-full text-left"
                >
                  <WhatsAppIcon size={20} className="text-blue-600 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14.5px] font-medium text-slate-900">WhatsApp</span>
                    <span className="block mt-0.5 text-[12.5px] text-slate-500 truncate">
                      {t('Envia o PDF do relatório como anexo')}
                    </span>
                  </span>
                  <ChevronRight size={16} strokeWidth={1.5} className="text-slate-400 shrink-0" />
                </button>

                {/* E-mail */}
                <button
                  onClick={() => {
                    if (!requireSignup('Enviar por e-mail', () => { handleEmail(); setShowShareModal(false); })) {
                      setShowShareModal(false);
                    }
                  }}
                  disabled={!user?.email}
                  className="list-row w-full text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <Mail size={20} strokeWidth={1.5} className="text-blue-600 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14.5px] font-medium text-slate-900">E-mail</span>
                    <span className="block mt-0.5 text-[12.5px] text-slate-500 truncate">
                      {user?.email || t('Cadastre seu e-mail no perfil')}
                    </span>
                  </span>
                  <ChevronRight size={16} strokeWidth={1.5} className="text-slate-400 shrink-0" />
                </button>
              </div>

              <p className="mt-4 text-[12px] leading-relaxed text-slate-500 text-center">
                {t('O relatório será enviado para o contato cadastrado no seu perfil.')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* DRILLDOWN: SOBRE A TELA RELATÓRIOS */}
      <ScreenHelpSheet
        open={showHelp}
        onClose={() => setShowHelp(false)}
        icon={<BarChart2 size={20} className="text-blue-600" />}
        pretitle="Relatórios"
        title="O que tem aqui"
        items={[
          { title: 'Extrato fiscal', desc: 'Resumo do faturamento bruto, pagos e pendentes do mês.' },
          { title: 'Previsão tributária', desc: 'Estimativa do imposto conforme seu regime (MEI, Simples, PF...).' },
          { title: 'Gerar PDF e CSV', desc: 'Documento pronto para enviar ao seu contador em segundos.' },
          { title: 'Compartilhar', desc: 'Envie o relatório por WhatsApp ou e-mail direto do app.' },
        ]}
        proPitch="No Max você gera o relatório completo para o contador, com PDF e planilha e separação por forma de recebimento."
        proFeature="mixed_fiscal_report"
      />

    </div>
  );
}
