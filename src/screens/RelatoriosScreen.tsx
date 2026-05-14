import React, { useState, useMemo, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import { getMonthlyStats } from '../lib/db';
import { format, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  FileText, Download, Mail, Settings, ChevronLeft, ChevronDown, X, Loader2
} from 'lucide-react';
import jsPDF from 'jspdf';

function fmtCur(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

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
  const [activeTab, setActiveTab] = useState<'mes' | 'ano'>('mes');
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  
  // Modal & Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [previewFormat, setPreviewFormat] = useState<PreviewFormat>('completo');

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
  const taxRate = isMei ? 0 : (user?.tax_rate ?? 6) / 100;
  const taxBase = stats?.expected || 0;
  const taxAmount = isMei ? 75.60 : taxBase * taxRate;

  function handleWhatsApp() {
    const msg = encodeURIComponent(
      `📊 *Relatório Plantãozinho Plus*\n` +
      `📅 *${format(selectedMonth, 'MMMM yyyy', { locale: ptBR }).toUpperCase()}*\n\n` +
      `💰 Faturamento Bruto: ${fmtCur(stats?.expected || 0)}\n` +
      `✅ Recebido: ${fmtCur(stats?.received || 0)}\n` +
      `⏳ Pendente: ${fmtCur(stats?.pending || 0)}\n` +
      `🏥 Plantões: ${stats?.totalShifts || 0} (${stats?.totalHours || 0}h)\n\n` +
      `_Gerado via Plantãozinho Plus_`
    );
    const phone = user?.whatsapp?.replace(/\D/g, '') || '';
    window.open(`https://wa.me/${phone ? '55' + phone : ''}?text=${msg}`, '_blank');
  }

  function handleEmail() {
    const subject = encodeURIComponent(`Relatório Plantãozinho Plus — ${format(selectedMonth, 'MMMM/yyyy', { locale: ptBR })}`);
    const body = encodeURIComponent(
      `Relatório Mensal — ${format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}\n\n` +
      `Faturamento: ${fmtCur(stats?.expected || 0)}\n` +
      `Recebido: ${fmtCur(stats?.received || 0)}\n` +
      `Pendente: ${fmtCur(stats?.pending || 0)}\n` +
      `Plantões: ${stats?.totalShifts || 0}`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
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
      pdf.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy')} às ${format(new Date(), 'HH:mm')} via Plantãozinho Plus`, pageW / 2, y, { align: 'center' });
      y += 6;
      pdf.setDrawColor(226, 232, 240);
      pdf.line(ml, y, pageW - mr, y);
      y += 6;

      // 1. Dados da PJ
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(15, 23, 42);
      pdf.text('1. DADOS DO PROFISSIONAL (PJ)', ml, y);
      y += 5;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(51, 65, 85);
      const pjLines = [
        ['Razão Social:', user?.company_name || `${user?.name || ''} Serviços Médicos LTDA`],
        ['CNPJ:', fmtCNPJ(user?.cnpj)],
        ['Responsável Técnico:', `Dr(a). ${user?.name || ''}`],
        ['Regime Tributário:', `${user?.tax_regime || 'Simples Nacional'}${!isMei ? ` (${(taxRate * 100).toFixed(2)}%)` : ''}`],
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
        pdf.setFillColor(248, 250, 252);
        pdf.setDrawColor(226, 232, 240);
        pdf.roundedRect(ml, y, contentW, 28, 1.5, 1.5, 'FD');
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(51, 65, 85);
        const sumLines: [string, string, boolean][] = [
          ['Faturamento Bruto (Competência):', fmtCur(stats?.expected || 0), true],
          ['Total Efetivamente Recebido (Caixa):', fmtCur(stats?.received || 0), false],
          ['Total Pendente / A Receber:', fmtCur(stats?.pending || 0), false],
          [`Provisão Estimada de Imposto (DAS${isMei ? ' MEI' : ` - ${(taxRate * 100).toFixed(1)}%`}):`, fmtCur(taxAmount), true],
        ];
        let sy = y + 5;
        sumLines.forEach(([k, v, bold]) => {
          pdf.setFont('helvetica', bold ? 'bold' : 'normal');
          pdf.text(k, ml + 3, sy);
          pdf.text(v, pageW - mr - 3, sy, { align: 'right' });
          sy += 5.5;
        });
        y += 32;
      }

      // 3. Faturamento por Fonte Pagadora
      if (!isPendentes && Object.keys(wpBreakdown).length > 0) {
        ensureSpace(15);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(15, 23, 42);
        pdf.text('3. FATURAMENTO POR FONTE PAGADORA', ml, y);
        y += 5;
        Object.entries(wpBreakdown).forEach(([wpId, data]) => {
          const wp = workplaces.find(w => w.id === wpId);
          if (!wp) return;
          ensureSpace(10);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(9);
          pdf.setTextColor(30, 41, 59);
          pdf.text(wp.name, ml + 2, y);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(100, 116, 139);
          pdf.text(`(CNPJ: ${fmtCNPJ(wp.cnpj)})`, ml + 2 + pdf.getTextWidth(wp.name) + 2, y);
          y += 4.5;
          pdf.setTextColor(71, 85, 105);
          pdf.text(`Composição: ${data.shifts} ${data.shifts !== 1 ? 'plantões' : 'plantão'}`, ml + 2, y);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(15, 23, 42);
          pdf.text(fmtCur(data.total), pageW - mr - 2, y, { align: 'right' });
          y += 6;
        });
        y += 2;
      }

      // 4. Tabela de Plantões
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

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        shiftsToShow.forEach(s => {
          ensureSpace(6);
          const wp = workplaces.find(w => w.id === s.workplace_id);
          const isPending = s.status !== 'recebido';
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
  }, [pdfLoading, selectedMonth, user, isMei, taxRate, isPendentes, isResumido, stats, taxAmount, wpBreakdown, workplaces, shiftsToShow, totalTableValue, docTitle]);

  const handleExportCSV = useCallback(() => {
    const lines: string[][] = [];
    const sep: string[] = [];

    lines.push([docTitle]);
    lines.push([`Mês de Competência: ${format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}`]);
    lines.push([`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`]);
    lines.push(sep);

    lines.push(['1. DADOS DO PROFISSIONAL (PJ)']);
    lines.push(['Razão Social', user?.company_name || `${user?.name || ''} Serviços Médicos LTDA`]);
    lines.push(['CNPJ', fmtCNPJ(user?.cnpj)]);
    lines.push(['Responsável Técnico', `Dr(a). ${user?.name || ''}`]);
    lines.push(['Regime Tributário', `${user?.tax_regime || 'Simples Nacional'}${!isMei ? ` (${(taxRate * 100).toFixed(2)}%)` : ''}`]);
    lines.push(sep);

    if (!isPendentes) {
      lines.push(['2. RESUMO FINANCEIRO']);
      lines.push(['Faturamento Bruto', (stats?.expected || 0).toFixed(2).replace('.', ',')]);
      lines.push(['Total Recebido', (stats?.received || 0).toFixed(2).replace('.', ',')]);
      lines.push(['Total Pendente', (stats?.pending || 0).toFixed(2).replace('.', ',')]);
      lines.push([`Provisão de Imposto (DAS${isMei ? ' MEI' : ` ${(taxRate * 100).toFixed(1)}%`})`, taxAmount.toFixed(2).replace('.', ',')]);
      lines.push(sep);

      if (Object.keys(wpBreakdown).length > 0) {
        lines.push(['3. FATURAMENTO POR FONTE PAGADORA']);
        lines.push(['Local', 'CNPJ', 'Plantões', 'Valor Total (R$)']);
        Object.entries(wpBreakdown).forEach(([wpId, data]) => {
          const wp = workplaces.find(w => w.id === wpId);
          if (!wp) return;
          lines.push([wp.name, fmtCNPJ(wp.cnpj), String(data.shifts), data.total.toFixed(2).replace('.', ',')]);
        });
        lines.push(sep);
      }
    }

    lines.push([isPendentes ? '2. PLANTÕES PENDENTES DE PAGAMENTO' : '4. EXTRATO DETALHADO DE PLANTÕES']);
    lines.push(['Data', 'Local', 'CNPJ', 'Tipo', 'Início', 'Fim', 'Horas', 'Valor Esperado (R$)', 'Valor Recebido (R$)', 'Status']);
    shiftsToShow.forEach(s => {
      const wp = workplaces.find(w => w.id === s.workplace_id);
      lines.push([
        format(new Date(s.date), 'dd/MM/yyyy'),
        wp?.name || '',
        fmtCNPJ(wp?.cnpj),
        s.type || '',
        s.start_time || '',
        s.end_time || '',
        String(s.hours || ''),
        s.expected_value.toFixed(2).replace('.', ','),
        s.received_value != null ? Number(s.received_value).toFixed(2).replace('.', ',') : '',
        statusLabel[s.status] || s.status,
      ]);
    });
    const totalExpected = shiftsToShow.reduce((a, b) => a + b.expected_value, 0);
    const totalReceived = shiftsToShow.reduce((a, b) => a + (b.received_value || 0), 0);
    lines.push(['', '', '', '', '', '', 'TOTAL', totalExpected.toFixed(2).replace('.', ','), totalReceived.toFixed(2).replace('.', ','), '']);

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
  }, [selectedMonth, user, isMei, taxRate, isPendentes, stats, taxAmount, wpBreakdown, workplaces, shiftsToShow, docTitle, statusLabel]);

  return (
    <div className="page-content bg-white relative overflow-hidden h-full min-h-screen">

      {/* HEADER */}
      <header className="bg-white px-5 pt-7 pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Contabilidade</p>
            <h1 className="text-[20px] font-black text-slate-900 tracking-tight leading-tight">Relatórios</h1>
            <p className="text-[12px] text-slate-500 mt-0.5">Exporte para o contador em segundos.</p>
          </div>
          <button onClick={() => setShowSettingsModal(true)}
            className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all active:scale-95 shrink-0 ml-3"
            title="Configurações">
            <Settings size={16} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-24 hide-scrollbar px-5">
        
        {/* Toggle Mês/Ano */}
        <div className="bg-slate-100 p-1 rounded-xl flex my-5">
          <button 
            onClick={() => setActiveTab('mes')}
            className={`flex-1 font-semibold text-sm py-2 rounded-lg transition-all ${activeTab === 'mes' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            Mês
          </button>
          <button 
            onClick={() => setActiveTab('ano')}
            className={`flex-1 font-semibold text-sm py-2 rounded-lg transition-all ${activeTab === 'ano' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            Ano
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
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold capitalize">
                      {format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}
                    </h2>
                    <select 
                      value={`${year}-${month}`} 
                      onChange={e => {
                        const [y, m] = e.target.value.split('-').map(Number);
                        setSelectedMonth(new Date(y, m - 1, 1));
                      }} 
                      className="opacity-0 absolute w-32 h-8 cursor-pointer"
                    >
                      {Array.from({ length: 12 }, (_, i) => {
                        const d = subMonths(new Date(), i);
                        const val = `${d.getFullYear()}-${d.getMonth()+1}`;
                        return <option key={val} value={val}>{format(d, 'MMM/yyyy', { locale: ptBR })}</option>;
                      })}
                    </select>
                    <ChevronDown size={18} className="text-blue-300 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-end border-b border-blue-500 pb-3">
                  <span className="text-blue-100 text-sm">Faturamento Bruto Total</span>
                  <span className="text-2xl font-bold text-white">{fmtCur(stats?.expected || 0)}</span>
                </div>
                
                <div className="flex justify-between text-sm pt-1">
                  <span className="text-blue-200">Plantões realizados</span>
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
                {!isMei ? (
                  <>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-slate-600">Alíquota Estimada</span>
                      <span className="text-sm font-bold text-slate-800">{(taxRate * 100).toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs text-slate-400">Base de cálculo: {fmtCur(taxBase)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm text-slate-600">Contribuição Mensal (DAS MEI)</span>
                    <span className="text-sm font-bold text-slate-800">Valor Fixo</span>
                  </div>
                )}
                
                <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                  <span className="text-sm font-semibold text-slate-800">Provisão para Imposto (DAS)</span>
                  <span className="text-lg font-bold text-red-500">{fmtCur(taxAmount)}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 text-center">*Valores para planejamento. Consulte seu contador para emissão da guia oficial.</p>
              </div>
            </div>

            {/* Central de Exportação */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                onClick={() => setShowPreview(true)}
                className="col-span-2 bg-white border border-slate-200 text-slate-700 font-medium py-3 rounded-xl hover:bg-slate-50 transition flex justify-center items-center gap-2 text-sm shadow-sm">
                <FileText size={16} className="text-blue-500" />
                Gerar PDF para Contador
              </button>
              <button
                onClick={handleWhatsApp}
                className="bg-white border border-slate-200 text-slate-700 font-medium py-3 rounded-xl hover:bg-slate-50 transition flex justify-center items-center gap-2 text-sm shadow-sm">
                <WhatsAppIcon size={16} className="text-emerald-500" />
                WhatsApp
              </button>
              <button 
                onClick={handleEmail}
                className="bg-white border border-slate-200 text-slate-700 font-medium py-3 rounded-xl hover:bg-slate-50 transition flex justify-center items-center gap-2 text-sm shadow-sm">
                <Mail size={16} className="text-slate-500" />
                E-mail
              </button>
            </div>

            {/* Fontes Pagadoras (Hospitais) */}
            <div className="mb-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Detalhamento por CNPJ/Local</h3>
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
        className="absolute inset-0 z-50 bg-[#0f172a] flex flex-col transform transition-transform duration-300 ease-in-out"
        style={{ transform: showPreview ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {/* Header do Preview */}
        <header className="bg-white px-4 pt-12 pb-4 shadow-sm z-20 shrink-0 flex items-center gap-3 md:pt-6">
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
        </div>

        {/* Área de Rolagem do Documento */}
        <main className="flex-1 overflow-y-auto bg-slate-100 hide-scrollbar pb-32">
          {/* Documento (Folha "A4") */}
          <div className="bg-white shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] m-4 p-5 rounded-md text-[0.75rem] leading-[1.4] text-slate-700 md:max-w-[800px] md:mx-auto md:my-8 md:p-12 md:text-sm">
            
            <div className="text-center mb-6">
              <h2 className="font-bold text-sm uppercase tracking-wider text-slate-900">{docTitle}</h2>
              <p className="text-xs text-slate-500 mt-1">Mês de Competência: {format(selectedMonth, 'MMMM / yyyy', { locale: ptBR })}</p>
              <p className="text-[10px] text-slate-400 mt-1">Gerado em: {format(new Date(), 'dd/MM/yyyy')} às {format(new Date(), 'HH:mm')} via Plantãozinho Plus</p>
            </div>

            <hr className="border-slate-200 mb-4" />

            {/* 1. Dados da PJ */}
            <div className="mb-5">
              <h3 className="font-bold text-xs uppercase text-slate-800 mb-2">1. Dados do Profissional (PJ)</h3>
              <div className="grid grid-cols-1 gap-1 pl-2">
                <p><span className="font-semibold">Razão Social:</span> {user?.company_name || `${user?.name || ''} Serviços Médicos LTDA`}</p>
                <p><span className="font-semibold">CNPJ:</span> {user?.cnpj ? user.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : 'Não informado'}</p>
                <p><span className="font-semibold">Responsável Técnico:</span> Dr(a). {user?.name}</p>
                <p><span className="font-semibold">Regime Tributário:</span> {user?.tax_regime || 'Simples Nacional'}{!isMei && ` (${(taxRate * 100).toFixed(2)}%)`}</p>
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
                  <div className="flex justify-between mb-3">
                    <span className="text-slate-600">Total Pendente / A Receber:</span>
                    <span className="font-medium text-slate-700">{fmtCur(stats?.pending || 0)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-[11px]">
                    <span className="italic text-slate-600">Provisão Estimada de Imposto (DAS{isMei ? ' MEI' : ` - ${(taxRate * 100).toFixed(1)}%`}):</span>
                    <span className="font-bold text-slate-900">{fmtCur(taxAmount)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Relação por Hospital (oculto se Extrato de Cobrança) */}
            {!isPendentes && (
              <div className="mb-5 transition-all">
                <h3 className="font-bold text-xs uppercase text-slate-800 mb-2">3. Faturamento por Fonte Pagadora</h3>
                {Object.entries(wpBreakdown).map(([wpId, data]) => {
                  const wp = workplaces.find(w => w.id === wpId);
                  if (!wp) return null;
                  return (
                    <div key={wpId} className="mb-3 pl-2">
                      <p className="font-bold text-slate-800">{wp.name} <span className="font-normal text-slate-500">(CNPJ: {wp.cnpj || 'Não informado'})</span></p>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Composição: {data.shifts} {data.shifts !== 1 ? 'plantões' : 'plantão'}</span>
                        <span className="font-semibold">{fmtCur(data.total)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 4. Tabela de Plantões (oculta se Resumido) */}
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
                      {shiftsToShow.map(s => {
                        const wp = workplaces.find(w => w.id === s.workplace_id);
                        const isPending = s.status !== 'recebido';
                        return (
                          <tr key={s.id} className={`border-b border-slate-100 ${isPendentes || isPending ? 'bg-red-50/20' : ''}`}>
                            <td className="py-1.5 pl-1">{format(new Date(s.date), 'dd/MM')}</td>
                            <td className="py-1.5 truncate max-w-[100px] text-slate-700">{wp?.name}</td>
                            <td className={`py-1.5 text-right font-medium ${isPending ? 'text-red-600' : 'text-slate-800'}`}>
                              {fmtCur(s.expected_value)}
                            </td>
                            <td className={`py-1.5 text-right pr-1 font-medium ${isPending ? 'text-red-500' : 'text-emerald-600'}`}>
                              {isPending ? 'Pendente' : 'Pago'}
                            </td>
                          </tr>
                        );
                      })}
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
        </main>

        {/* Ações Fixas no Rodapé da Preview */}
        <div className="absolute bottom-0 left-0 w-full bg-white border-t border-slate-200 p-4 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
          <div className="flex gap-3">
            <button
              onClick={handleDownloadPDF}
              disabled={pdfLoading}
              className="flex-1 bg-blue-600 text-white font-semibold py-3.5 rounded-xl shadow-sm hover:bg-blue-700 transition active:scale-95 flex justify-center items-center gap-2 text-sm disabled:opacity-60"
            >
              {pdfLoading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              {pdfLoading ? 'Gerando...' : 'Baixar PDF'}
            </button>
            <button
              onClick={handleExportCSV}
              className="flex-1 bg-white border border-slate-200 text-slate-700 font-semibold py-3.5 rounded-xl shadow-sm hover:bg-slate-50 transition active:scale-95 flex justify-center items-center gap-2 text-sm"
            >
              <FileText size={18} className="text-emerald-500" />
              Exportar CSV
            </button>
          </div>
          <button
            onClick={handleWhatsApp}
            className="w-full mt-3 flex justify-center items-center gap-2 text-slate-500 font-medium text-sm py-2 hover:text-slate-800 transition"
          >
            <WhatsAppIcon size={16} />
            Compartilhar via WhatsApp/Email
          </button>
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
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Regime Tributário</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSettingsData(p => ({ ...p, tax_regime: 'MEI' }))}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition border ${
                      settingsData.tax_regime === 'MEI' 
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    MEI
                  </button>
                  <button
                    onClick={() => setSettingsData(p => ({ ...p, tax_regime: 'Simples Nacional' }))}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition border ${
                      settingsData.tax_regime === 'Simples Nacional' 
                        ? 'bg-blue-50 border-blue-200 text-blue-700' 
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Simples Nacional
                  </button>
                </div>
              </div>

              {settingsData.tax_regime === 'Simples Nacional' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Alíquota (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={settingsData.tax_rate}
                    onChange={(e) => setSettingsData(p => ({ ...p, tax_rate: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                    placeholder="Ex: 6.0"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Geralmente 6% no Anexo III (sujeito ao Fator R).</p>
                </div>
              )}

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
                  <div>
                    <span className="block text-xs text-slate-500 mb-1">CNPJ</span>
                    <input
                      type="text"
                      value={settingsData.cnpj}
                      onChange={(e) => {
                        let val = e.target.value.replace(/\D/g, '');
                        if (val.length > 14) val = val.slice(0, 14);
                        let formatted = val;
                        if (val.length > 12) formatted = val.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/, '$1.$2.$3/$4-$5');
                        else if (val.length > 8) formatted = val.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4}).*/, '$1.$2.$3/$4');
                        else if (val.length > 5) formatted = val.replace(/^(\d{2})(\d{3})(\d{0,3}).*/, '$1.$2.$3');
                        else if (val.length > 2) formatted = val.replace(/^(\d{2})(\d{0,3}).*/, '$1.$2');
                        setSettingsData(p => ({ ...p, cnpj: formatted }));
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                      placeholder="00.000.000/0001-00"
                    />
                  </div>
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

    </div>
  );
}
