import { useState, useMemo, useEffect } from 'react';
import { X, Check, RefreshCw, Zap, SlidersHorizontal, Repeat2, Clock, Calendar, Crown } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { createShift, createRecurrenceShifts } from '../lib/db';
import type { ShiftStatus, RecurrenceFrequency, FiscalNature } from '../types';
import { STATUS_LABELS, FISCAL_NATURE_LABELS, resolveFiscalNature } from '../types';
import { format, addDays, addMonths } from 'date-fns';
import { useLanguage } from '../hooks/useLanguage';
import { usePlan } from '../contexts/PlanContext';
import { useGuest } from '../hooks/useGuest';

interface AddShiftModalProps {
  onClose: () => void;
  initialDate?: string;
}

type Mode = 'quick' | 'manual' | 'recurrence';
type RecOption = 'none' | 'weekly' | 'weekdays' | '12x36' | '24x72' | 'biweekly' | 'monthly' | 'custom';

const RECURRENCE_LABELS: Record<RecOption, string> = {
  none: 'Não repetir',
  weekly: 'Toda semana',
  weekdays: 'Dias úteis',
  biweekly: 'A cada 15 dias',
  monthly: 'Todo mês',
  '12x36': '12x36',
  '24x72': '24x72',
  custom: 'Personalizado',
};

const RECURRENCE_ICONS: Record<RecOption, string> = {
  none: '✕', weekly: '7d', weekdays: 'Seg–Sex',
  biweekly: '15d', monthly: '30d',
  '12x36': '12h', '24x72': '24h', custom: '···',
};

const WEEKDAY_SHORT = ['D','S','T','Q','Q','S','S'];

const TAB_META = {
  quick:      { color: '#0EA5E9', bg: '#F0F9FF', label: 'Adicione com 1–2 toques usando um modelo salvo' },
  manual:     { color: '#6366F1', bg: '#EEF2FF', label: 'Configure cada detalhe do plantão manualmente' },
  recurrence: { color: '#8B5CF6', bg: '#F5F3FF', label: 'Gere uma série automática por escala ou período' },
};

const TAB_ICONS = { quick: Zap, manual: SlidersHorizontal, recurrence: Repeat2 };

function calcDuration(start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) diff += 1440;
  return Math.round(diff * 10 / 60) / 10;
}

export default function AddShiftModal({ onClose, initialDate }: AddShiftModalProps) {
  const { user, workplaces, templates, refreshShifts, shifts } = useApp();
  const { t } = useLanguage();
  const { limits, gate, requireUpgrade, can } = usePlan();
  const { isGuest } = useGuest();
  const canRecurrence = can('recurrence');
  const showFiscal = can('mixed_fiscal_report') || isGuest;

  const today = format(new Date(), 'yyyy-MM-dd');
  const [mode, setMode] = useState<Mode>('quick');

  const [date, setDate] = useState(initialDate || today);
  const [workplaceId, setWorkplaceId] = useState(workplaces[0]?.id || '');
  const [templateId, setTemplateId] = useState('');
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('19:00');
  const [expectedValue, setExpectedValue] = useState('');
  const [status, setStatus] = useState<ShiftStatus>('previsto');
  const [notes, setNotes] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [title, setTitle] = useState('');

  const [fiscalNature, setFiscalNature] = useState<FiscalNature>('PJ');

  const [recOption, setRecOption] = useState<RecOption>('none');
  const [recWeekdays, setRecWeekdays] = useState<number[]>([]);
  const [recEndDate, setRecEndDate] = useState('');
  const [recOccurrences, setRecOccurrences] = useState('');
  const [recInterval, setRecInterval] = useState('1');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const wpTemplates = useMemo(() =>
    templates.filter(t => t.workplace_id === workplaceId),
    [templates, workplaceId]
  );

  const selectedWp = workplaces.find(w => w.id === workplaceId);
  const selectedTemplate = templates.find(t => t.id === templateId);

  useEffect(() => {
    if (selectedTemplate) {
      setStartTime(selectedTemplate.start_time);
      setEndTime(selectedTemplate.end_time);
      setExpectedValue(selectedTemplate.default_value.toString());
      setTitle(selectedTemplate.name);
    }
  }, [selectedTemplate]);

  useEffect(() => {
    if (selectedWp && !expectedValue) {
      setExpectedValue(selectedWp.default_shift_value.toString());
      const [y, m] = date.split('-').map(Number);
      const due = new Date(y, m, selectedWp.payment_day);
      setPaymentDueDate(format(due, 'yyyy-MM-dd'));
    }
  }, [selectedWp, workplaceId]);

  // Natureza fiscal padrão = regime do local selecionado (pode ser ajustada manualmente)
  useEffect(() => {
    if (selectedWp) setFiscalNature(resolveFiscalNature({ fiscal_nature: undefined }, selectedWp));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workplaceId]);

  useEffect(() => {
    if (recOption === 'none' || !date) { setPreview(null); return; }
    const endD = recEndDate ? new Date(recEndDate) : addMonths(new Date(date), 2);
    const startD = new Date(date);
    let count = 0;
    const maxOcc = recOccurrences ? parseInt(recOccurrences) : 50;
    let cur = new Date(startD);
    while (cur <= endD && count < maxOcc) {
      if (recOption === '12x36') { count++; cur = new Date(cur.getTime() + 36*3600000); }
      else if (recOption === '24x72') { count++; cur = new Date(cur.getTime() + 72*3600000); }
      else if (recOption === 'biweekly') { count++; cur = addDays(cur, 14); }
      else if (recOption === 'monthly') { count++; cur = addMonths(cur, 1); }
      else if (recOption === 'weekly') { count++; cur = addDays(cur, 7); }
      else if (recOption === 'weekdays' && recWeekdays.length) {
        cur = addDays(cur, 1);
        if (recWeekdays.includes(cur.getDay())) count++;
        if (count > maxOcc) break;
        continue;
      } else { count++; cur = addDays(cur, parseInt(recInterval) || 7); }
    }
    const endLabel = recEndDate ? format(new Date(recEndDate), 'dd/MM') : format(endD, 'dd/MM');
    setPreview(`${count} plantões · ${format(startD,'dd/MM')} até ${endLabel}`);
  }, [recOption, date, recEndDate, recOccurrences, recWeekdays, recInterval]);

  function validate() {
    const errs: Record<string, string> = {};
    if (!workplaceId) errs.workplace = 'Selecione um local';
    if (!date) errs.date = 'Informe a data';
    if (!startTime) errs.startTime = 'Informe o início';
    if (!endTime) errs.endTime = 'Informe o fim';
    if (!expectedValue || isNaN(parseFloat(expectedValue))) errs.value = 'Informe o valor';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function buildShiftData() {
    const startDt = new Date(`${date}T${startTime}:00`);
    let endDt = new Date(`${date}T${endTime}:00`);
    if (endDt <= startDt) endDt = addDays(endDt, 1);
    const duration = (endDt.getTime() - startDt.getTime()) / (1000*60*60);
    const wp = workplaces.find(w => w.id === workplaceId);
    const payDue = paymentDueDate || (() => {
      if (!wp) return '';
      const [y, m] = date.split('-').map(Number);
      return format(new Date(y, m, wp.payment_day), 'yyyy-MM-dd');
    })();
    return {
      user_id: user!.id,
      workplace_id: workplaceId,
      template_id: templateId || undefined,
      title: title || `Plantão ${wp?.name || ''}`,
      date,
      start_datetime: startDt.toISOString(),
      end_datetime: endDt.toISOString(),
      duration_hours: duration,
      expected_value: parseFloat(expectedValue),
      status,
      payment_due_date: payDue,
      notes,
      ...(showFiscal ? { fiscal_nature: fiscalNature } : {}),
    };
  }

  async function handleSave() {
    if (!validate() || !user) return;

    // Gate de limite mensal (Free = 10 plantões/mês)
    if (limits.maxShiftsPerMonth !== null) {
      const monthPrefix = date.slice(0, 7); // 'YYYY-MM' do plantão sendo criado
      const countThisMonth = shifts.filter(
        s => s.date.startsWith(monthPrefix) && s.status !== 'cancelado'
      ).length;
      if (countThisMonth >= limits.maxShiftsPerMonth) {
        requireUpgrade('unlimited_shifts');
        return;
      }
    }

    setSaving(true);
    const shiftData = buildShiftData();
    const wp = workplaces.find(w => w.id === workplaceId);

    if (recOption !== 'none') {
      const freqMap: Record<RecOption, RecurrenceFrequency> = {
        none: 'weekly', weekly: 'weekly', weekdays: 'weekly', biweekly: 'biweekly',
        monthly: 'monthly', '12x36': '12x36', '24x72': '24x72', custom: 'daily',
      };
      const endDate = recEndDate || format(addMonths(new Date(date), 3), 'yyyy-MM-dd');
      createRecurrenceShifts(
        { ...shiftData, _start_time: startTime, _end_time: endTime } as Parameters<typeof createRecurrenceShifts>[0],
        {
          user_id: user.id,
          workplace_id: workplaceId,
          frequency: freqMap[recOption],
          interval: parseInt(recInterval) || 1,
          weekdays: recOption === 'weekdays' ? recWeekdays : undefined,
          start_date: date,
          end_date: endDate,
          occurrences: recOccurrences ? parseInt(recOccurrences) : undefined,
          pattern_label: RECURRENCE_LABELS[recOption],
          active: true,
        },
        wp?.payment_day || 10
      );
    } else {
      createShift(shiftData);
    }

    refreshShifts();
    setSaving(false);
    onClose();
  }

  const duration = calcDuration(startTime, endTime);
  const meta = TAB_META[mode];
  const tabColor = meta.color;

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-[400px] rounded-[24px] shadow-2xl animate-scale-in flex flex-col"
        style={{ maxHeight: '86vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h2 className="font-bold text-[17px] text-slate-900">{t('Adicionar Plantão')}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition"
          >
            <X size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pb-3 shrink-0">
          <div className="flex bg-slate-100 rounded-[14px] p-1 gap-1">
            {(['quick', 'manual', 'recurrence'] as Mode[]).map(m => {
              const active = mode === m;
              const c = TAB_META[m].color;
              const Icon = TAB_ICONS[m];
              const label = { quick: t('Rápido'), manual: t('Manual'), recurrence: t('Recorrente') }[m];
              return (
                <button
                  key={m}
                  onClick={() => {
                    // Recorrência é recurso Pro — gate antes de trocar de aba
                    if (m === 'recurrence') { gate('recurrence', () => setMode(m)); return; }
                    setMode(m);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[10px] text-xs font-semibold transition-all relative"
                  style={{
                    background: active ? 'white' : 'transparent',
                    color: active ? c : '#9ca3af',
                    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                  }}
                >
                  <Icon size={13} />
                  {label}
                  {m === 'recurrence' && !canRecurrence && (
                    <Crown size={9} className="text-amber-400 absolute top-1 right-1.5" strokeWidth={2.5} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab context chip */}
          <div className="mt-2 px-3 py-1.5 rounded-xl" style={{ background: meta.bg }}>
            <p className="text-[11px] font-medium" style={{ color: tabColor }}>{t(meta.label)}</p>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-2 hide-scrollbar">

          {/* Local */}
          <div className="mb-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{t('Local')}</p>
            {workplaces.length === 0 ? (
              <div className="p-3 rounded-xl bg-amber-50 text-amber-700 text-sm font-medium">
                {t('⚠️ Cadastre um local antes de adicionar plantões')}
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                {workplaces.map(wp => {
                  const active = workplaceId === wp.id;
                  return (
                    <button
                      key={wp.id}
                      onClick={() => setWorkplaceId(wp.id)}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold flex-shrink-0 transition-all"
                      style={{
                        background: active ? wp.color : `${wp.color}14`,
                        color: active ? 'white' : wp.color,
                        border: active ? `1.5px solid ${wp.color}` : `1.5px solid ${wp.color}30`,
                      }}
                    >
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                        style={{ background: active ? 'rgba(255,255,255,0.25)' : wp.color, color: 'white' }}
                      >
                        {wp.name.slice(0, 1).toUpperCase()}
                      </span>
                      {wp.name.split(' ').slice(0, 2).join(' ')}
                    </button>
                  );
                })}
              </div>
            )}
            {errors.workplace && <p className="text-red-500 text-[11px] mt-1">{errors.workplace}</p>}
          </div>

          {/* QUICK: Template cards */}
          {mode === 'quick' && (
            <div className="mb-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{t('Modelo de Escala')}</p>
              {wpTemplates.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-50 text-center">
                  <p className="text-xs text-slate-500">Nenhum modelo salvo para este local.</p>
                  <p className="text-[11px] font-semibold mt-0.5" style={{ color: tabColor }}>
                    Crie modelos em "Locais de Plantão"
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {wpTemplates.map(t => {
                    const active = templateId === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTemplateId(active ? '' : t.id)}
                        className="flex flex-col items-start p-3 rounded-xl transition-all text-left"
                        style={{
                          background: active ? `${tabColor}10` : '#f9fafb',
                          border: active ? `1.5px solid ${tabColor}` : '1.5px solid #f0f0f0',
                        }}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span className="text-xs font-bold text-slate-800 truncate flex-1">{t.name}</span>
                          {active && <Check size={11} color={tabColor} className="flex-shrink-0 ml-1" />}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5">
                          <Clock size={9} />
                          <span>{t.start_time}–{t.end_time}</span>
                        </div>
                        <span
                          className="text-[11px] font-bold"
                          style={{ color: active ? tabColor : '#64748b' }}
                        >
                          {t.duration_hours}h · R${t.default_value.toLocaleString('pt-BR')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Data & Horário */}
          <div className="mb-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{t('Data & Horário')}</p>
            <div className="bg-slate-50 rounded-[14px] overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white">
                <Calendar size={14} className="text-slate-400 flex-shrink-0" />
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-slate-800 font-medium outline-none"
                />
              </div>
              <div className="grid grid-cols-2">
                <div className="flex items-center gap-2 px-3 py-2.5 border-r border-white">
                  <Clock size={13} className="text-slate-400 flex-shrink-0" />
                  <div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Início</p>
                    <input
                      type="time"
                      value={startTime}
                      onChange={e => setStartTime(e.target.value)}
                      className="bg-transparent text-sm text-slate-800 font-semibold outline-none w-full"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <Clock size={13} className="text-slate-400 flex-shrink-0" />
                  <div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Fim</p>
                    <input
                      type="time"
                      value={endTime}
                      onChange={e => setEndTime(e.target.value)}
                      className="bg-transparent text-sm text-slate-800 font-semibold outline-none w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 px-1">
              Duração: <span className="font-semibold text-slate-600">{duration}h</span>
            </p>
            {(errors.date || errors.startTime || errors.endTime) && (
              <p className="text-red-500 text-[11px] mt-1">{errors.date || errors.startTime || errors.endTime}</p>
            )}
          </div>

          {/* Valor */}
          <div className="mb-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{t('Valor Previsto')}</p>
            <div className="bg-slate-50 rounded-[14px] flex items-center px-3 py-2.5">
              <span className="text-sm text-slate-400 mr-2 font-semibold">R$</span>
              <input
                type="number"
                step="50"
                value={expectedValue}
                onChange={e => setExpectedValue(e.target.value)}
                placeholder={selectedWp?.default_shift_value.toString() || '0,00'}
                className="flex-1 bg-transparent text-sm text-slate-800 font-semibold outline-none"
              />
            </div>
            {errors.value && <p className="text-red-500 text-[11px] mt-1">{errors.value}</p>}
          </div>

          {/* Regime fiscal — alimenta o Relatório por Regime Fiscal (Max) */}
          {showFiscal && (
            <div className="mb-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{t('Forma de recebimento')}</p>
              <div className="flex gap-1.5">
                {(['PJ', 'AUTONOMO'] as FiscalNature[]).map(nat => {
                  const active = fiscalNature === nat;
                  return (
                    <button
                      key={nat}
                      type="button"
                      onClick={() => setFiscalNature(nat)}
                      className="flex-1 py-2 rounded-xl text-[11px] font-semibold transition-all active:scale-95"
                      style={{
                        background: active ? tabColor : '#f9fafb',
                        color: active ? 'white' : '#64748b',
                        border: active ? `1.5px solid ${tabColor}` : '1.5px solid #f0f0f0',
                      }}
                    >
                      {FISCAL_NATURE_LABELS[nat]}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 px-1">{t('Padrão herdado do local. Detalhe impostos depois ao editar o plantão.')}</p>
            </div>
          )}

          {/* MANUAL: extra fields */}
          {mode === 'manual' && (
            <div className="mb-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Detalhes</p>
              <div className="bg-slate-50 rounded-[14px] overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white">
                  <span className="text-[11px] text-slate-400 w-24 flex-shrink-0 font-semibold">Título</span>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Ex: Plantão UTI"
                    className="flex-1 bg-transparent text-sm text-slate-800 font-medium outline-none"
                  />
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white">
                  <span className="text-[11px] text-slate-400 w-24 flex-shrink-0 font-semibold">{t('Status')}</span>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as ShiftStatus)}
                    className="flex-1 bg-transparent text-sm text-slate-800 font-medium outline-none"
                  >
                    {(['previsto', 'realizado', 'recebido'] as ShiftStatus[]).map(s => (
                      <option key={s} value={s}>{t(STATUS_LABELS[s])}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white">
                  <span className="text-[11px] text-slate-400 w-24 flex-shrink-0 font-semibold">{t('Vencimento')}</span>
                  <input
                    type="date"
                    value={paymentDueDate}
                    onChange={e => setPaymentDueDate(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-slate-800 font-medium outline-none"
                  />
                </div>
                <div className="flex items-start gap-3 px-3 py-2.5">
                  <span className="text-[11px] text-slate-400 w-24 flex-shrink-0 font-semibold pt-0.5">{t('Observações')}</span>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={2}
                    className="flex-1 bg-transparent text-sm text-slate-800 font-medium outline-none resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* RECURRENCE */}
          {mode === 'recurrence' && (
            <div className="mb-4 space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Frequência</p>
              <div className="grid grid-cols-4 gap-2">
                {(Object.entries(RECURRENCE_LABELS) as [RecOption, string][])
                  .filter(([k]) => k !== 'none')
                  .map(([key, label]) => {
                    const active = recOption === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setRecOption(key)}
                        className="flex flex-col items-center py-2.5 px-1 rounded-[12px] transition-all"
                        style={{
                          background: active ? `${tabColor}15` : '#f9fafb',
                          border: active ? `1.5px solid ${tabColor}` : '1.5px solid #f0f0f0',
                        }}
                      >
                        <span
                          className="text-[10px] font-bold mb-0.5"
                          style={{ color: active ? tabColor : '#94a3b8' }}
                        >
                          {RECURRENCE_ICONS[key]}
                        </span>
                        <span
                          className="text-[9px] font-semibold leading-tight text-center"
                          style={{ color: active ? tabColor : '#64748b' }}
                        >
                          {label}
                        </span>
                      </button>
                    );
                  })}
              </div>

              {recOption === 'weekdays' && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Dias</p>
                  <div className="flex gap-1.5">
                    {WEEKDAY_SHORT.map((l, i) => (
                      <button
                        key={i}
                        onClick={() => setRecWeekdays(d => d.includes(i) ? d.filter(x => x !== i) : [...d, i])}
                        className="flex-1 h-8 rounded-full text-xs font-bold transition-all"
                        style={{
                          background: recWeekdays.includes(i) ? tabColor : '#f1f5f9',
                          color: recWeekdays.includes(i) ? 'white' : '#94a3b8',
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {recOption === 'custom' && (
                <div className="bg-slate-50 rounded-[14px] flex items-center px-3 py-2.5 gap-2">
                  <span className="text-sm text-slate-400 font-medium">Repetir a cada</span>
                  <input
                    type="number"
                    value={recInterval}
                    onChange={e => setRecInterval(e.target.value)}
                    className="w-12 bg-white rounded-lg text-center text-sm text-slate-800 font-bold outline-none border border-slate-200 py-1"
                    placeholder="7"
                  />
                  <span className="text-sm text-slate-400 font-medium">dias</span>
                </div>
              )}

              {recOption !== 'none' && (
                <div className="bg-slate-50 rounded-[14px] overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white">
                    <span className="text-[11px] text-slate-400 font-semibold w-24 flex-shrink-0">Data final</span>
                    <input
                      type="date"
                      value={recEndDate}
                      onChange={e => setRecEndDate(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-slate-800 font-medium outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <span className="text-[11px] text-slate-400 font-semibold w-24 flex-shrink-0">Ou nº vezes</span>
                    <input
                      type="number"
                      value={recOccurrences}
                      onChange={e => setRecOccurrences(e.target.value)}
                      placeholder="Ex: 12"
                      className="flex-1 bg-transparent text-sm text-slate-800 font-medium outline-none"
                    />
                  </div>
                </div>
              )}

              {preview && (
                <div
                  className="flex items-center gap-2.5 p-3 rounded-xl"
                  style={{ background: `${tabColor}12` }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: `${tabColor}22` }}
                  >
                    <RefreshCw size={12} color={tabColor} />
                  </div>
                  <div>
                    <p className="text-[12px] font-bold" style={{ color: tabColor }}>{preview}</p>
                    <p className="text-[10px] text-slate-400">Confirme antes de salvar</p>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Save button */}
        <div className="px-5 pt-3 pb-6 border-t border-slate-100 shrink-0">
          <button
            onClick={handleSave}
            disabled={saving || workplaces.length === 0}
            className="w-full py-3.5 rounded-[16px] text-white text-[15px] font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{
              background: workplaces.length === 0 ? '#9ca3af' : tabColor,
              boxShadow: workplaces.length === 0 ? 'none' : `0 8px 20px ${tabColor}40`,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? t('Salvando...') : (
              <>
                {mode === 'recurrence'
                  ? <Repeat2 size={16} strokeWidth={2.5} />
                  : <Check size={16} strokeWidth={2.5} />
                }
                {mode === 'recurrence' && preview
                  ? `${t('Criar')} ${preview.match(/^\d+/)?.[0] || ''} ${t('plantões')}`
                  : t('Salvar plantão')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
