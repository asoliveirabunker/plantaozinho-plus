import React, { useState, useMemo, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import { getMonthlyStats } from '../lib/db';
import { format, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  FileText, Download, Mail, Settings, ChevronLeft, ChevronDown, X, Loader2, Crown, HelpCircle, BarChart2
} from 'lucide-react';
import jsPDF from 'jspdf';
import { useLanguage } from '../hooks/useLanguage';
import { usePlan } from '../contexts/PlanContext';
import { useGuest } from '../hooks/useGuest';
import ScreenHelpSheet from '../components/ScreenHelpSheet';
import { Layers } from 'lucide-react';
import { resolveFiscalNature, FISCAL_NATURE_LABELS, type FiscalNature, type Shift } from '../types';

function fmtCur(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

/** Como o relatório separa os ganhos. */
type GroupBy = 'none' | 'forma' | 'local';
const GROUP_LABELS: Record<GroupBy, string> = {
  none: 'Consolidado',
  forma: 'Forma de recebimento',
  local: 'Por local',
};
const FORMA_ORDER: FiscalNature[] = ['PJ', 'AUTONOMO'];

/** Deduções/retenções de um plantão conforme a forma de recebimento.
 *  PJ → ISS + PIS + COFINS · Autônomo (RPA) → INSS + IRRF. Campos vazios contam 0. */
function deducoesOfShift(s: Shift, forma: FiscalNature): number {
  if (forma === 'PJ') return (s.iss_retido || 0) + (s.pis || 0) + (s.cofins || 0);
  return (s.inss_retido || 0) + (s.irrf_retido || 0); // AUTONOMO
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
    window.open(`https://wa.me/${phone ? '55' + phone : ''}?text=${msg}`, '_blank');
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
    window.open(`mailto:${to}?subject=${subject}&body=${body}`);
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

  const handleDownloadPDF = useCallback(async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
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
        ['Responsável Técnico:', `Dr(a). ${user?.name || ''}`],
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

      pdf.save(`relatorio_${format(selectedMonth, 'yyyy-MM', { locale: ptBR })}.pdf`);
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setPdfLoading(false);
    }
  }, [pdfLoading, selectedMonth, user, isMei, useFixedMei, taxRate, taxLabel, profileSectionTitle, userNameOrRazao, userDocLabel, isPendentes, isResumido, stats, taxAmount, wpBreakdown, workplaces, shiftsToShow, totalTableValue, docTitle, groupBy, groupSummary, groupSummaryTitle, detailGroups, wpById, totalDeducoes, totalLiquido]);

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
    lines.push(['Responsável Técnico', `Dr(a). ${user?.name || ''}`]);
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_${format(selectedMonth, 'yyyy-MM', { locale: ptBR })}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [selectedMonth, user, isMei, useFixedMei, taxRate, taxLabel, profileSectionTitle, userNameOrRazao, userDocLabel, isPendentes, stats, taxAmount, wpBreakdown, workplaces, shiftsToShow, docTitle, statusLabel, groupBy, groupSummary, groupSummaryTitle, detailGroups, wpById, formaOf, deducoesOf, totalDeducoes, totalLiquido]);

  return (
    <div className="page-content bg-white relative overflow-hidden h-full min-h-screen">

      {/* HEADER */}
      <header className="bg-white px-5 pt-7 pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{t('Contabilidade')}</p>
            <h1 className="text-[20px] font-black text-slate-900 tracking-tight leading-tight">{t('Relatórios')}</h1>
            <p className="text-[12px] text-slate-500 mt-0.5">{t('Exporte para o contador em segundos.')}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-3">
            <button onClick={() => setShowHelp(true)}
              className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all active:scale-95"
              title="Sobre esta tela">
              <HelpCircle size={16} strokeWidth={2.5} />
            </button>
            <button onClick={() => setShowSettingsModal(true)}
              className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all active:scale-95"
              title="Configurações">
              <Settings size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-24 hide-scrollbar px-5">
        
        {/* Toggle Mês/Ano */}
        <div className="bg-slate-100 p-1 rounded-xl flex my-5">
          <button
            onClick={() => setActiveTab('mes')}
            className={`flex-1 font-semibold text-sm py-2 rounded-lg transition-all ${activeTab === 'mes' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            {t('Mês')}
          </button>
          <button
            onClick={() => gate('annual_reports', () => setActiveTab('ano'))}
            className={`flex-1 font-semibold text-sm py-2 rounded-lg transition-all flex items-center justify-center gap-1 ${activeTab === 'ano' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            {t('Ano')}
            {!can('annual_reports') && <Crown size={11} className="text-amber-400" strokeWidth={2.5} />}
          </button>
        </div>

        {activeTab === 'mes' && (
          <>
            {/* Extrato Card */}
            <div className="bg-blue-600 rounded-2xl p-6 text-white relative">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <p className="text-blue-200 text-xs font-bold tracking-wider uppercase mb-1 flex items-center gap-1">
                    <FileText size={12} />
                    Extrato Fiscal
                  </p>
                  <label className="flex items-center gap-2 relative cursor-pointer">
                    <h2 className="text-2xl font-bold capitalize">
                      {format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}
                    </h2>
                    <ChevronDown size={18} className="text-blue-300" />
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
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-end border-b border-blue-500 pb-3">
                  <span className="text-blue-100 text-sm">{t('Faturamento Bruto Total')}</span>
                  <span className="text-2xl font-bold text-white">{fmtCur(stats?.expected || 0)}</span>
                </div>
                
                <div className="flex justify-between text-sm pt-1">
                  <span className="text-blue-200">{t('Plantões realizados')}</span>
                  <span className="font-medium">{stats?.totalShifts || 0} plantões ({stats?.totalHours || 0}h)</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-blue-200">Status dos pagamentos</span>
                  <div className="text-right">
                    <span className="text-emerald-300 font-medium text-xs">Pago: {fmtCur(stats?.received || 0)}</span>
                    <span className="text-blue-200 mx-1">•</span>
                    <span className="text-yellow-300 font-medium text-xs">Pendente: {fmtCur(stats?.pending || 0)}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Previsão Tributária */}
            <div className="bg-white rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-slate-100 mt-4 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-slate-500">⚖️</span>
                  Previsão Tributária
                </h3>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded uppercase tracking-wider">
                  {user?.tax_regime || 'Simples Nacional'}
                </span>
              </div>
              
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                {!useFixedMei ? (
                  <>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-slate-600">{t('Alíquota Estimada')}</span>
                      <span className="text-sm font-bold text-slate-800">{(taxRate * 100).toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs text-slate-400">{t('Base de cálculo:')} {fmtCur(taxBase)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm text-slate-600">{t('Contribuição Mensal (DAS MEI)')}</span>
                    <span className="text-sm font-bold text-slate-800">{t('Valor Fixo')}</span>
                  </div>
                )}

                <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                  <span className="text-sm font-semibold text-slate-800">{t(taxLabel)}</span>
                  <span className="text-lg font-bold text-red-500">{fmtCur(taxAmount)}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 text-center">{t('*Valores para planejamento. Consulte seu contador para emissão da guia oficial.')}</p>
              </div>
            </div>

            {/* ====== RELATÓRIO PARA O CONTADOR (unificado · Max) ====== */}
            <div className="mb-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">{t('Relatórios')}</h3>
              <button
                onClick={openReport}
                className="w-full text-left bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:border-violet-200 hover:shadow-[0_2px_12px_rgba(139,92,246,0.08)] transition active:scale-[0.99] flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #a855f7, #8b5cf6)' }}>
                  <FileText size={20} className="text-white" strokeWidth={2.2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-slate-900 text-sm">{t('Relatório para o contador')}</h4>
                    {!canFiscalReport && (
                      <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-500">
                        <Crown size={10} strokeWidth={2.5} /> MAX
                      </span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-slate-500 leading-snug mt-0.5">
                    {t('PDF e planilha do mês, com separação por forma de recebimento (PJ/Autônomo) ou local.')}
                  </p>
                </div>
                <ChevronLeft size={16} className="text-slate-300 rotate-180 shrink-0" />
              </button>
            </div>

            {/* ====== COMPARTILHAR ====== */}
            <div className="mb-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">{t('Compartilhar')}</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => gate('whatsapp_accountant', () => requireSignup('Compartilhar via WhatsApp', handleWhatsApp))}
                  className="bg-white border border-slate-200 text-slate-700 font-medium py-3 rounded-xl hover:bg-slate-50 transition flex justify-center items-center gap-2 text-sm shadow-sm">
                  <WhatsAppIcon size={16} className="text-emerald-500" />
                  WhatsApp
                  {!can('whatsapp_accountant') && <Crown size={12} className="text-amber-400" strokeWidth={2.5} />}
                </button>
                <button
                  onClick={() => requireSignup('Enviar por e-mail', handleEmail)}
                  className="bg-white border border-slate-200 text-slate-700 font-medium py-3 rounded-xl hover:bg-slate-50 transition flex justify-center items-center gap-2 text-sm shadow-sm">
                  <Mail size={16} className="text-slate-500" />
                  E-mail
                </button>
              </div>
            </div>

            {/* Fontes Pagadoras (Hospitais) */}
            <div className="mb-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">{t('Detalhamento por CNPJ/Local')}</h3>
              <div className="space-y-3">
                {Object.entries(wpBreakdown).map(([wpId, data]) => {
                  const wp = workplaces.find(w => w.id === wpId);
                  if (!wp) return null;
                  return (
                    <div key={wpId} className="bg-white p-4 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-sm">
                          {wp.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-semibold text-slate-900 text-sm">{wp.name}</h4>
                          <p className="text-xs text-slate-500">{data.shifts} {data.shifts !== 1 ? 'plantões' : 'plantão'} realizados</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-900 block">{fmtCur(data.total)}</span>
                      </div>
                    </div>
                  );
                })}
                {Object.keys(wpBreakdown).length === 0 && (
                  <p className="text-center text-slate-400 text-sm py-6">Nenhum plantão neste mês</p>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'ano' && (
          <div className="py-10 text-center text-slate-500 text-sm">
            Visualização anual será disponibilizada em breve.
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
       <div className="w-full max-w-[430px] h-full bg-slate-100 flex flex-col relative shadow-xl overflow-hidden">
        {/* Header do Preview */}
        <header className="bg-white px-4 pt-7 pb-4 shadow-sm z-20 shrink-0 flex items-center gap-3">
          <button 
            onClick={() => setShowPreview(false)} 
            className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 transition active:scale-95"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-900 leading-tight">Pré-visualização</h1>
            <p className="text-xs text-slate-500">Relatório Fiscal - {format(selectedMonth, 'MMM/yyyy', { locale: ptBR })}</p>
          </div>
        </header>

        {/* Barra de Filtros */}
        <div className="bg-white border-b border-slate-200 px-4 py-3 z-10 shrink-0 flex gap-3 overflow-x-auto hide-scrollbar">
          <button
            onClick={() => setShowFormatModal(true)}
            className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shrink-0 hover:bg-slate-100 transition active:scale-95"
          >
            <FileText size={16} className="text-emerald-600" />
            <div className="text-left">
              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-0.5">Formato</span>
              <span className="block text-xs font-semibold text-slate-800 leading-none">{formatLabels[previewFormat]}</span>
            </div>
            <ChevronDown size={14} className="text-slate-400 ml-1" />
          </button>
          <button
            onClick={() => setShowGroupModal(true)}
            className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shrink-0 hover:bg-slate-100 transition active:scale-95"
          >
            <Layers size={16} className="text-violet-600" />
            <div className="text-left">
              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-0.5">Separar por</span>
              <span className="block text-xs font-semibold text-slate-800 leading-none">{GROUP_LABELS[groupBy]}</span>
            </div>
            <ChevronDown size={14} className="text-slate-400 ml-1" />
          </button>
        </div>

        {/* Área de Rolagem do Documento */}
        <main className="flex-1 overflow-y-auto bg-slate-100 hide-scrollbar">
          {/* Documento (Folha "A4") — sem flex-1 para acompanhar o tamanho real do conteúdo */}
          <div className="bg-white shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] m-4 p-5 rounded-md text-[0.75rem] leading-[1.4] text-slate-700">
            
            <div className="text-center mb-6">
              <h2 className="font-bold text-sm uppercase tracking-wider text-slate-900">{docTitle}</h2>
              <p className="text-xs text-slate-500 mt-1">Mês de Competência: {format(selectedMonth, 'MMMM / yyyy', { locale: ptBR })}</p>
              <p className="text-[10px] text-slate-400 mt-1">Gerado em: {format(new Date(), 'dd/MM/yyyy')} às {format(new Date(), 'HH:mm')} via Plantão Pro</p>
            </div>

            <hr className="border-slate-200 mb-4" />

            {/* 1. Dados do Profissional */}
            <div className="mb-5">
              <h3 className="font-bold text-xs uppercase text-slate-800 mb-2">
                1. {user?.tax_regime === 'PF' ? 'Dados do Profissional (PF)' : 'Dados do Profissional (PJ)'}
              </h3>
              <div className="grid grid-cols-1 gap-1 pl-2">
                <p><span className="font-semibold">{user?.tax_regime === 'PF' ? 'Nome:' : 'Razão Social:'}</span> {user?.company_name || `${user?.name || ''}${user?.tax_regime === 'PF' ? '' : ' Serviços Médicos LTDA'}`}</p>
                <p>
                  <span className="font-semibold">{user?.tax_regime === 'PF' ? 'CPF:' : 'CNPJ:'}</span>{' '}
                  {user?.cnpj
                    ? (user.tax_regime === 'PF'
                        ? user.cnpj.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
                        : user.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'))
                    : 'Não informado'}
                </p>
                <p><span className="font-semibold">Responsável Técnico:</span> Dr(a). {user?.name}</p>
                {user?.crm && <p><span className="font-semibold">CRM:</span> {user.crm}</p>}
                <p><span className="font-semibold">Regime Tributário:</span> {user?.tax_regime || 'Simples Nacional'}{!useFixedMei && ` (${(taxRate * 100).toFixed(2)}%)`}</p>
              </div>
            </div>

            {/* 2. Resumo Financeiro (oculto se Extrato de Cobrança) */}
            {!isPendentes && (
              <div className="mb-5 transition-all">
                <h3 className="font-bold text-xs uppercase text-slate-800 mb-2">2. Resumo Financeiro</h3>
                <div className="bg-slate-50 p-3 rounded border border-slate-200">
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold">Faturamento Bruto (Competência):</span>
                    <span className="font-bold text-slate-900">{fmtCur(stats?.expected || 0)}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-600">Total Efetivamente Recebido (Caixa):</span>
                    <span className="font-medium text-slate-700">{fmtCur(stats?.received || 0)}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-600">Total Pendente / A Receber:</span>
                    <span className="font-medium text-slate-700">{fmtCur(stats?.pending || 0)}</span>
                  </div>
                  {totalDeducoes > 0 && (
                    <>
                      <div className="flex justify-between mb-1">
                        <span className="text-slate-600">Deduções / Retenções (ISS, INSS, IRRF…):</span>
                        <span className="font-medium text-red-600">− {fmtCur(totalDeducoes)}</span>
                      </div>
                      <div className="flex justify-between mb-3">
                        <span className="font-semibold">Líquido após retenções:</span>
                        <span className="font-bold text-emerald-700">{fmtCur(totalLiquido)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-[11px]">
                    <span className="italic text-slate-600">{taxLabel}{!useFixedMei ? ` (${(taxRate * 100).toFixed(1)}%)` : ''}:</span>
                    <span className="font-bold text-slate-900">{fmtCur(taxAmount)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Resumo conforme a separação (oculto se Extrato de Cobrança) */}
            {!isPendentes && groupSummary.length > 0 && (
              <div className="mb-5 transition-all">
                <h3 className="font-bold text-xs uppercase text-slate-800 mb-2">3. {groupSummaryTitle}</h3>
                {groupSummary.map(g => (
                  <div key={g.key} className="mb-3 pl-2">
                    <p className="font-bold text-slate-800">
                      {g.label}
                      {groupBy !== 'forma' && (
                        <span className="font-normal text-slate-500"> (CNPJ: {wpById.get(g.key)?.cnpj || 'Não informado'})</span>
                      )}
                    </p>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Composição: {g.count} {g.count !== 1 ? 'plantões' : 'plantão'}</span>
                      <span className="font-semibold">{fmtCur(g.bruto)}</span>
                    </div>
                    {g.deducoes > 0 && (
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>Deduções − {fmtCur(g.deducoes)}</span>
                        <span className="font-semibold text-emerald-700">Líquido {fmtCur(g.liquido)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 4. Tabela de Plantões (agrupada conforme a separação; oculta se Resumido) */}
            {!isResumido && (
              <div className="mb-2 transition-all duration-300">
                <h3 className="font-bold text-xs uppercase text-slate-800 mb-2">
                  {isPendentes ? '2. Plantões Pendentes de Pagamento' : '4. Extrato Detalhado de Plantões'}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr>
                        <th className="py-1.5 border-b border-slate-300 text-slate-500">Data</th>
                        <th className="py-1.5 border-b border-slate-300 text-slate-500">Local</th>
                        <th className="py-1.5 border-b border-slate-300 text-slate-500 text-right">Valor</th>
                        <th className="py-1.5 border-b border-slate-300 text-slate-500 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailGroups.map(group => (
                        <React.Fragment key={group.key}>
                          {groupBy !== 'none' && (
                            <tr>
                              <td colSpan={4} className="pt-3 pb-1 font-bold text-[11px] uppercase tracking-wide text-violet-700">{group.label}</td>
                            </tr>
                          )}
                          {group.shifts.map(s => {
                            const wp = workplaces.find(w => w.id === s.workplace_id);
                            const isPending = s.status !== 'recebido';
                            return (
                              <tr key={s.id} className={`border-b border-slate-100 ${isPendentes || isPending ? 'bg-red-50/20' : ''}`}>
                                <td className="py-1.5 pl-1">{format(new Date(s.date), 'dd/MM')}</td>
                                <td className="py-1.5 truncate max-w-[100px] text-slate-700">{wp?.name}</td>
                                <td className="py-1.5 text-right">
                                  <span className={`font-medium ${isPending ? 'text-red-600' : 'text-slate-800'}`}>{fmtCur(s.expected_value)}</span>
                                  {deducoesOf(s) > 0 && (
                                    <span className="block text-[9px] text-slate-400 leading-none mt-0.5">líq {fmtCur(s.expected_value - deducoesOf(s))}</span>
                                  )}
                                </td>
                                <td className={`py-1.5 text-right pr-1 font-medium ${isPending ? 'text-red-500' : 'text-emerald-600'}`}>
                                  {isPending ? 'Pendente' : 'Pago'}
                                </td>
                              </tr>
                            );
                          })}
                          {groupBy !== 'none' && (
                            <tr>
                              <td colSpan={2} className="py-1 text-right text-slate-500 text-[11px]">Subtotal {group.label}</td>
                              <td className="py-1 text-right font-semibold text-[11px] text-slate-700">{fmtCur(group.shifts.reduce((a, b) => a + b.expected_value, 0))}</td>
                              <td></td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                      {shiftsToShow.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-400">Nenhum plantão encontrado.</td>
                        </tr>
                      )}

                      {/* Linha final / Total */}
                      <tr className="bg-slate-50">
                        <td colSpan={2} className="py-2 font-bold text-right border-t border-slate-200">TOTAL:</td>
                        <td className="py-2 font-bold text-right border-t border-slate-200 pr-1 text-slate-900">
                          {fmtCur(totalTableValue)}
                        </td>
                        <td className="border-t border-slate-200"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            <div className="mt-8 text-center text-[9px] text-slate-400">
              <p>Este documento é um relatório gerencial e não substitui notas fiscais ou recibos oficiais.</p>
            </div>

          </div>

          {/* Ações no Rodapé — sticky bottom:0 garante que fique visível durante o scroll,
              mas naturalmente próximo do documento quando o conteúdo é curto */}
          <div
            className="sticky bottom-0 left-0 w-full bg-white border-t border-slate-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <div className="flex gap-3">
              <button
                onClick={() => requireSignup('Baixar PDF', handleDownloadPDF)}
                disabled={pdfLoading}
                className="flex-1 bg-blue-600 text-white font-semibold py-3.5 rounded-xl shadow-sm hover:bg-blue-700 transition active:scale-95 flex justify-center items-center gap-2 text-sm disabled:opacity-60"
              >
                {pdfLoading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                {pdfLoading ? t('Gerando...') : t('Baixar PDF')}
              </button>
              <button
                onClick={() => requireSignup('Exportar CSV', handleExportCSV)}
                className="flex-1 bg-white border border-slate-200 text-slate-700 font-semibold py-3.5 rounded-xl shadow-sm hover:bg-slate-50 transition active:scale-95 flex justify-center items-center gap-2 text-sm"
              >
                <FileText size={18} className="text-emerald-500" />
                {t('Exportar CSV')}
              </button>
            </div>
            <button
              onClick={() => setShowShareModal(true)}
              className="w-full mt-3 bg-white border border-slate-200 text-slate-700 font-semibold py-3.5 rounded-xl shadow-sm hover:bg-slate-50 transition active:scale-95 flex justify-center items-center gap-2 text-sm"
            >
              <WhatsAppIcon size={16} className="text-emerald-500" />
              {t('Compartilhar')}
            </button>
          </div>
        </main>
       </div>
      </div>

      {/* ========================================================= */}
      {/* MODAL DE SELEÇÃO DE FORMATO                                 */}
      {/* ========================================================= */}
      {showFormatModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-start justify-center p-4 pt-[15vh] transition-opacity">
          <div className="bg-white w-full max-w-sm rounded-[24px] shadow-2xl animate-scale-in">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900">Formato do Documento</h3>
                <p className="text-xs text-slate-500 mt-0.5">Defina o nível de detalhamento do PDF</p>
              </div>
              <button 
                onClick={() => setShowFormatModal(false)} 
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-500 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-5 space-y-3">
              <label className="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition">
                <div className="flex items-center gap-3">
                  <input 
                    type="radio" 
                    name="formato" 
                    value="completo" 
                    checked={previewFormat === 'completo'}
                    onChange={() => { setPreviewFormat('completo'); setShowFormatModal(false); }}
                    className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-gray-300" 
                  />
                  <div>
                    <span className="block text-sm font-bold text-slate-700">Relatório Completo</span>
                    <span className="block text-xs text-slate-500">Resumo CNPJ + Tabela dia a dia</span>
                  </div>
                </div>
              </label>

              <label className="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition">
                <div className="flex items-center gap-3">
                  <input 
                    type="radio" 
                    name="formato" 
                    value="resumido" 
                    checked={previewFormat === 'resumido'}
                    onChange={() => { setPreviewFormat('resumido'); setShowFormatModal(false); }}
                    className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-gray-300" 
                  />
                  <div>
                    <span className="block text-sm font-bold text-slate-700">Apenas Resumo Fiscal</span>
                    <span className="block text-xs text-slate-500">Ideal para Contador (Sem tabela)</span>
                  </div>
                </div>
              </label>

               <label className="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition">
                <div className="flex items-center gap-3">
                  <input 
                    type="radio" 
                    name="formato" 
                    value="pendentes" 
                    checked={previewFormat === 'pendentes'}
                    onChange={() => { setPreviewFormat('pendentes'); setShowFormatModal(false); }}
                    className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-gray-300" 
                  />
                  <div>
                    <span className="block text-sm font-bold text-slate-700">Extrato de Cobrança</span>
                    <span className="block text-xs text-slate-500">Mostra apenas plantões não pagos</span>
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: SEPARAR OS GANHOS POR                                */}
      {/* ========================================================= */}
      {showGroupModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-start justify-center p-4 pt-[15vh] transition-opacity">
          <div className="bg-white w-full max-w-sm rounded-[24px] shadow-2xl animate-scale-in">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900">Separar os ganhos</h3>
                <p className="text-xs text-slate-500 mt-0.5">Como o relatório agrupa os plantões</p>
              </div>
              <button
                onClick={() => setShowGroupModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-500 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {([
                { key: 'forma' as GroupBy, title: 'Por forma de recebimento', desc: 'Separa por PJ e Autônomo (RPA) — ideal quando o regime varia por local.' },
                { key: 'local' as GroupBy, title: 'Por local', desc: 'Agrupa os plantões por hospital / fonte pagadora.' },
                { key: 'none' as GroupBy, title: 'Consolidado', desc: 'Lista única, sem separação.' },
              ]).map(opt => (
                <label key={opt.key} className="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition">
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="groupby"
                      value={opt.key}
                      checked={groupBy === opt.key}
                      onChange={() => { setGroupBy(opt.key); setShowGroupModal(false); }}
                      className="w-4 h-4 text-violet-600 focus:ring-violet-500 border-gray-300"
                    />
                    <div>
                      <span className="block text-sm font-bold text-slate-700">{opt.title}</span>
                      <span className="block text-xs text-slate-500">{opt.desc}</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL DE CONFIGURAÇÕES CONTÁBEIS                            */}
      {/* ========================================================= */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[70] bg-slate-900/40 backdrop-blur-sm flex items-start justify-center p-4 pt-[12vh] transition-opacity">
          <div className="bg-white w-full max-w-sm rounded-[24px] shadow-2xl animate-scale-in max-h-[80vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-slate-900">Configurações Contábeis</h3>
                <p className="text-xs text-slate-500 mt-0.5">Ajuste seus parâmetros fiscais</p>
              </div>
              <button 
                onClick={() => setShowSettingsModal(false)} 
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-500 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-5 space-y-4 overflow-y-auto flex-1 hide-scrollbar">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">{t('Regime Tributário')}</label>
                <div className="grid grid-cols-2 gap-1.5">
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
                        onClick={() => setSettingsData(p => ({
                          ...p,
                          tax_regime: regime,
                          tax_rate: recommendedRate[regime],
                        }))}
                        className={`py-2.5 rounded-xl text-sm font-semibold transition active:scale-[0.98] ${
                          isSel
                            ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        {regime}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">{t('Alíquota (%)')}</label>
                <input
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                  placeholder="6,0"
                />
                <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                  {settingsData.tax_regime === 'MEI'
                    ? 'Geralmente R$ 75,60/mês fixo. Defina uma alíquota personalizada se necessário.'
                    : settingsData.tax_regime === 'Simples Nacional'
                      ? 'A partir de 6% (Anexo III) ou 15,5% (Anexo V).'
                      : settingsData.tax_regime === 'Lucro Presumido'
                        ? 'Entre 13,33% e 16,33% (IRPJ + CSLL + PIS + COFINS + ISS).'
                        : 'Até 27,5% (IRPF) + 20% (INSS) + 2% a 5% (ISS).'}
                </p>
              </div>

              <hr className="border-slate-100 my-2" />

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Dados do Documento (PDF)</label>
                
                <div className="space-y-3 mt-2">
                  <div>
                    <span className="block text-xs text-slate-500 mb-1">Razão Social</span>
                    <input
                      type="text"
                      value={settingsData.company_name}
                      onChange={(e) => setSettingsData(p => ({ ...p, company_name: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
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
                        <span className="block text-xs text-slate-500 mb-1">{label}</span>
                        <input
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
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                          placeholder={placeholder}
                        />
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 shrink-0">
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
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-xl transition active:scale-95"
              >
                Salvar Configurações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL DE COMPARTILHAMENTO (WhatsApp / Email)               */}
      {/* ========================================================= */}
      {showShareModal && (
        <div className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowShareModal(false)}>
          <div className="bg-white w-full max-w-sm rounded-[24px] shadow-2xl animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{t('Compartilhar')}</p>
                <h3 className="text-lg font-bold text-slate-900 leading-tight">{t('Enviar relatório')}</h3>
              </div>
              <button onClick={() => setShowShareModal(false)}
                className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition active:scale-95">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-2">
              {/* WhatsApp — envio ao contador é recurso Max */}
              <button
                onClick={() => {
                  if (!gate('whatsapp_accountant')) { setShowShareModal(false); return; }
                  if (!requireSignup('Compartilhar via WhatsApp', () => { handleWhatsApp(); setShowShareModal(false); })) {
                    setShowShareModal(false);
                  }
                }}
                disabled={!user?.whatsapp}
                className="w-full flex items-center gap-3 p-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition active:scale-[0.98] text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <WhatsAppIcon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 text-sm">WhatsApp</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {user?.whatsapp || t('Cadastre seu WhatsApp no perfil')}
                  </p>
                </div>
                <ChevronDown size={16} className="text-slate-400 -rotate-90 shrink-0" />
              </button>

              {/* E-mail */}
              <button
                onClick={() => {
                  if (!requireSignup('Enviar por e-mail', () => { handleEmail(); setShowShareModal(false); })) {
                    setShowShareModal(false);
                  }
                }}
                disabled={!user?.email}
                className="w-full flex items-center gap-3 p-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition active:scale-[0.98] text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Mail size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 text-sm">E-mail</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {user?.email || t('Cadastre seu e-mail no perfil')}
                  </p>
                </div>
                <ChevronDown size={16} className="text-slate-400 -rotate-90 shrink-0" />
              </button>

              <p className="text-[10px] text-slate-400 text-center pt-2 leading-relaxed">
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
