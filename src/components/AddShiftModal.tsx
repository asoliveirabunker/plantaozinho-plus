import { useState, useMemo, useEffect, type MouseEvent, type ReactNode } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { createShift, createRecurrenceShifts } from '../lib/db';
import type { ShiftStatus, RecurrenceFrequency, FiscalNature } from '../types';
import { STATUS_LABELS, FISCAL_NATURE_LABELS, FISCAL_NATURE_ORDER, resolveFiscalNature } from '../types';
import { format, parseISO, isValid, isAfter, addDays, addHours, addWeeks, addMonths } from 'date-fns';
import { useLanguage } from '../hooks/useLanguage';
import { usePlan } from '../contexts/PlanContext';
import { useGuest } from '../hooks/useGuest';

/**
 * Apresentação do formulário — o conteúdo é o mesmo nas duas:
 *  - 'sheet'  → folha que sobe de baixo, igual ao design (alça 38×4, raio 28 só no topo,
 *               encostada no rodapé, véu rgba(7,40,33,.44));
 *  - 'center' → cartão centrado (preferência antiga do usuário para modais).
 */
const PRESENTATION = 'sheet' as 'sheet' | 'center';

interface AddShiftModalProps {
  onClose: () => void;
  initialDate?: string;
  /** Local já selecionado ao abrir (ex.: "Lançar plantão aqui" no detalhe do local). */
  initialWorkplaceId?: string;
  /** Chamado quando o usuário pede para ir cadastrar um local (sem nenhum ainda). */
  onGoToLocais?: () => void;
}

type Mode = 'quick' | 'manual' | 'recurrence';
type RecOption = 'weekly' | 'weekdays' | 'biweekly' | 'monthly' | '12x36' | '24x72' | 'custom';

/** Ordem dos chips de frequência (a do design). */
const REC_ORDER: RecOption[] = ['weekly', 'weekdays', 'biweekly', 'monthly', '12x36', '24x72', 'custom'];

/** Rótulo gravado em `pattern_label` da regra (dado — não mudar). */
const RECURRENCE_LABELS: Record<RecOption, string> = {
  weekly: 'Toda semana',
  weekdays: 'Dias úteis',
  biweekly: 'A cada 15 dias',
  monthly: 'Todo mês',
  '12x36': '12x36',
  '24x72': '24x72',
  custom: 'Personalizado',
};

const FREQ_MAP: Record<RecOption, RecurrenceFrequency> = {
  weekly: 'weekly', weekdays: 'weekly', biweekly: 'biweekly',
  monthly: 'monthly', '12x36': '12x36', '24x72': '24x72', custom: 'daily',
};

const WEEKDAY_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const MODAL_SHADOW = '0 40px 80px -30px rgba(7,56,45,.5)';

/** Campo de data/hora sem ícone nativo — o toque abre o seletor (ver `openPicker`). */
const NO_PICKER_ICON = '[&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-date-and-time-value]:text-left';

/** Campo dentro da treliça: sem caixa, 15/400, como o dado ao lado. */
const LATTICE_INPUT = `block w-full mt-1 h-[22px] p-0 border-0 bg-transparent text-[15px] leading-[22px] font-normal text-slate-900 outline-none tabular-nums appearance-none ${NO_PICKER_ICON}`;
const LATTICE_LABEL = 'block text-[12.5px] leading-[1.3] font-normal text-slate-500';

/** Primeira palavra institucional abreviada: "Hospital São Marcos" → "H. São Marcos". */
const PLACE_ABBR: Record<string, string> = {
  hospital: 'H.', 'clínica': 'Cl.', clinica: 'Cl.', maternidade: 'Mat.',
  instituto: 'Inst.', 'policlínica': 'Pol.', policlinica: 'Pol.',
};

function shortPlace(name: string) {
  const parts = name.trim().split(/\s+/);
  const abbr = parts.length > 1 ? PLACE_ABBR[parts[0].toLowerCase()] : undefined;
  return abbr ? [abbr, ...parts.slice(1)].join(' ') : name.trim();
}

/** Rótulos de forma de recebimento como no design ("PF / Autônomo"). */
function formaLabel(n: FiscalNature) {
  return n === 'AUTONOMO' ? 'PF / Autônomo' : FISCAL_NATURE_LABELS[n];
}

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function calcDuration(start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) diff += 1440;
  return Math.round(diff * 10 / 60) / 10;
}

/** "2026-09-14" → "Segunda, 14 de setembro" (no idioma ativo). */
function sheetDate(dateStr: string, locale: string) {
  const d = dateStr ? parseISO(dateStr) : null;
  if (!d || !isValid(d)) return '';
  const s = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' })
    .format(d)
    .replace('-feira', '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Datas da série — espelha `createRecurrenceShifts` (db.ts) para que a prévia e o
 * rótulo "Criar N plantões" mostrem exatamente o que será criado.
 */
function seriesDates(opt: RecOption, startStr: string, endStr: string, occurrences: number, weekdays: number[], interval: number) {
  const out: Date[] = [];
  const end = parseISO(endStr);
  const max = occurrences || 50;
  let cur = parseISO(startStr);
  if (!isValid(cur) || !isValid(end)) return out;
  while (!isAfter(cur, end) && out.length < max) {
    if (opt === 'weekdays' && weekdays.length) {
      if (weekdays.includes(cur.getDay())) out.push(cur);
      cur = addDays(cur, 1);
      continue;
    }
    out.push(cur);
    if (opt === '12x36') cur = addHours(cur, 36);
    else if (opt === '24x72') cur = addHours(cur, 72);
    else if (opt === 'biweekly') cur = addWeeks(cur, 2);
    else if (opt === 'monthly') cur = addMonths(cur, 1);
    else if (opt === 'custom') cur = addDays(cur, interval || 1);
    else cur = addWeeks(cur, 1);
  }
  return out;
}

/** Abre o seletor nativo ao tocar em qualquer ponto do campo. */
function openPicker(e: MouseEvent<HTMLInputElement>) {
  try { e.currentTarget.showPicker?.(); } catch { /* navegador sem suporte */ }
}

/** O modo escuro pinta todo `input` com !important; na treliça o campo não tem caixa. */
function clearDarkFill(el: HTMLInputElement | null) {
  el?.style.setProperty('background-color', 'transparent', 'important');
}

function CheckGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" className="shrink-0">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true" className="shrink-0">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </svg>
  );
}

function Label({ children, htmlFor, className = '' }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return htmlFor
    ? <label htmlFor={htmlFor} className={`input-label ${className}`}>{children}</label>
    : <p className={`input-label ${className}`}>{children}</p>;
}

export default function AddShiftModal({ onClose, initialDate, initialWorkplaceId, onGoToLocais }: AddShiftModalProps) {
  const { user, workplaces, templates, refreshShifts, shifts } = useApp();
  const { t, meta } = useLanguage();
  const { limits, gate, requireUpgrade, can } = usePlan();
  const { isGuest } = useGuest();
  const canRecurrence = can('recurrence');
  // Forma de recebimento é recurso Pro (visitante experimenta tudo).
  const canFiscalFields = can('fiscal_fields') || isGuest;

  const today = format(new Date(), 'yyyy-MM-dd');
  const [mode, setMode] = useState<Mode>('quick');

  const [date, setDate] = useState(initialDate || today);
  const [workplaceId, setWorkplaceId] = useState(
    initialWorkplaceId && workplaces.some(w => w.id === initialWorkplaceId)
      ? initialWorkplaceId
      : workplaces[0]?.id || ''
  );
  const [templateId, setTemplateId] = useState('');
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('19:00');
  const [expectedValue, setExpectedValue] = useState('');
  const [status, setStatus] = useState<ShiftStatus>('previsto');
  const [notes, setNotes] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [title, setTitle] = useState('');

  const [fiscalNature, setFiscalNature] = useState<FiscalNature>('PJ');

  // Na aba Recorrente sempre há uma frequência escolhida (como no design).
  const [recOption, setRecOption] = useState<RecOption>('weekly');
  const [recWeekdays, setRecWeekdays] = useState<number[]>([]);
  const [recEndDate, setRecEndDate] = useState('');
  const [recOccurrences, setRecOccurrences] = useState('');
  const [recInterval, setRecInterval] = useState('1');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

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

  // --- Série (aba Recorrente) ---
  const validDate = !!date && isValid(parseISO(date));
  const recEnd = recEndDate || (validDate ? format(addMonths(parseISO(date), 3), 'yyyy-MM-dd') : '');
  const recIntervalNum = parseInt(recInterval) || 1;
  const recOccNum = parseInt(recOccurrences) || 0;
  const series = useMemo(
    () => (mode === 'recurrence' && validDate && recEnd
      ? seriesDates(recOption, date, recEnd, recOccNum, recWeekdays, recIntervalNum)
      : []),
    [mode, validDate, recEnd, recOption, date, recOccNum, recWeekdays, recIntervalNum]
  );

  function validate() {
    const errs: Record<string, string> = {};
    if (!workplaceId) errs.workplace = t('Selecione um local');
    if (!date) errs.date = t('Informe a data');
    if (!startTime) errs.startTime = t('Informe o início');
    if (!endTime) errs.endTime = t('Informe o fim');
    if (!expectedValue || isNaN(parseFloat(expectedValue))) errs.value = t('Informe o valor do plantão.');
    if (mode === 'recurrence' && date && series.length === 0) errs.recurrence = t('Nenhum plantão no período escolhido.');
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
      ...(canFiscalFields ? { fiscal_nature: fiscalNature } : {}),
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

    // Série só a partir da aba Recorrente (antes, uma frequência escolhida lá
    // também valia ao salvar pelas abas Rápido/Manual).
    if (mode === 'recurrence') {
      createRecurrenceShifts(
        { ...shiftData, _start_time: startTime, _end_time: endTime } as Parameters<typeof createRecurrenceShifts>[0],
        {
          user_id: user.id,
          workplace_id: workplaceId,
          frequency: FREQ_MAP[recOption],
          interval: recOption === 'custom' ? recIntervalNum : 1,
          weekdays: recOption === 'weekdays' ? recWeekdays : undefined,
          start_date: date,
          end_date: recEnd,
          occurrences: recOccNum || undefined,
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

  // --- Valores derivados para a interface ---
  const hasTimes = !!startTime && !!endTime;
  const duration = hasTimes ? calcDuration(startTime, endTime) : 0;
  const durationLabel = hasTimes
    ? `${String(duration).replace('.', ',')} ${duration === 1 ? t('hora') : t('horas')}`
    : '—';
  const valueNum = parseFloat(expectedValue);
  const hourly = valueNum > 0 && duration > 0 ? Math.round((valueNum / duration) * 100) / 100 : 0;
  const timeError = errors.date || errors.startTime || errors.endTime;

  const titleWords = t('Novo plantão').split(' ');
  const titleLight = titleWords.slice(0, -1).join(' ');
  const titleBold = titleWords[titleWords.length - 1];

  const plural = (n: number) => (n === 1 ? t('plantão') : t('plantões'));
  const seriesFirst = series[0];
  const seriesLast = series[series.length - 1];
  const seriesPeriod = seriesFirst
    ? (series.length === 1
      ? format(seriesFirst, 'dd/MM')
      : `${format(seriesFirst, 'dd/MM')} ${t('até')} ${format(seriesLast, 'dd/MM')}`)
    : '';
  const seriesTotal = valueNum > 0 ? valueNum * series.length : 0;

  const saveLabel = mode === 'recurrence'
    ? `${t('Criar')} ${series.length} ${plural(series.length)}`
    : t('Salvar plantão');

  const recLabel = (k: RecOption) => (k === '12x36' || k === '24x72' ? k.replace('x', '×') : t(RECURRENCE_LABELS[k]));

  const isSheet = PRESENTATION === 'sheet';

  const panel = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('Novo plantão')}
      className={isSheet
        ? 'form-sheet'
        : 'bg-white w-full max-w-[400px] rounded-3xl overflow-hidden animate-scale-in flex flex-col'}
      style={isSheet ? undefined : { maxHeight: '86vh', boxShadow: MODAL_SHADOW }}
      onClick={e => e.stopPropagation()}
    >
      {/* Cabeçalho: alça (folha) · data · "Novo plantão" · fechar · abas */}
      <div className={`px-6 shrink-0 ${isSheet ? '' : 'pt-6'}`}>
        {isSheet && <span className="form-sheet-grip" aria-hidden="true" />}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[13px] font-normal text-slate-500">{sheetDate(date, meta.locale) || ' '}</p>
            <h2 className="mt-2 text-[22px] font-light leading-[1.1] tracking-[-0.03em] text-slate-900">
              {titleLight && <>{titleLight} </>}
              <span className="font-semibold">{titleBold}</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 shrink-0 p-0 rounded-full border border-slate-200 bg-white text-slate-600 flex items-center justify-center transition-colors hover:border-blue-600 hover:text-blue-600"
            aria-label={t('Fechar')}
          >
            <X size={15} strokeWidth={1.6} />
          </button>
        </div>

        {/* Abas com filete — a aba muda o conteúdo e nada mais */}
        <div className="tab-rule mt-[22px]" role="tablist">
          {(['quick', 'manual', 'recurrence'] as Mode[]).map(m => {
            const label = { quick: t('Rápido'), manual: t('Manual'), recurrence: t('Recorrente') }[m];
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  // Recorrência é recurso Pro — gate antes de trocar de aba
                  if (m === 'recurrence') { gate('recurrence', () => setMode(m)); return; }
                  setMode(m);
                }}
                title={m === 'recurrence' && !canRecurrence ? t('Recurso Pro') : undefined}
                className="flex items-center gap-[7px] tracking-normal"
              >
                {label}
                {/* Cadeado de 13px: marca o recurso Pro — só para quem ainda não tem */}
                {m === 'recurrence' && !canRecurrence && <LockGlyph />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conteúdo rolável */}
      <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-6 pt-6 pb-5">

        {/* Local */}
        <Label className="mb-[10px]">{t('Local')}</Label>
        {workplaces.length === 0 ? (
          <button
            type="button"
            onClick={() => { onGoToLocais?.(); onClose(); }}
            className="notice notice-warn w-full items-center text-left"
          >
            <span className="flex-1 min-w-0 text-[14px] font-semibold text-slate-900">
              {t('⚠️ Cadastre um local antes de adicionar plantões').replace(/^⚠️\s*/, '')}
            </span>
            <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-slate-500" />
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            {workplaces.map(wp => {
              const active = workplaceId === wp.id;
              return (
                <button
                  key={wp.id}
                  type="button"
                  onClick={() => setWorkplaceId(wp.id)}
                  aria-pressed={active}
                  title={wp.name}
                  className="chip flex items-center gap-[9px] max-w-full min-w-0"
                >
                  {/* Ponto de 6px na cor do local; no selecionado, na cor do texto (branco) */}
                  <span
                    className="w-1.5 h-1.5 rounded-[2px] shrink-0"
                    style={{ background: active ? 'currentColor' : wp.color }}
                  />
                  <span className="truncate">{shortPlace(wp.name)}</span>
                </button>
              );
            })}
          </div>
        )}
        {errors.workplace && <p className="input-error">{errors.workplace}</p>}

        {/* RÁPIDO: modelo salvo */}
        {mode === 'quick' && (
          <div>
            <Label className="mt-[26px] mb-2">{t('Modelo salvo')}</Label>
            {wpTemplates.length === 0 ? (
              <p className="text-[12.5px] leading-[1.55] text-slate-500">
                {t('Nenhum modelo salvo para este local.')}{' '}
                {t('Crie modelos em "Locais de Plantão"')}
              </p>
            ) : (
              <>
                <p className="mb-3 text-[12.5px] leading-[1.55] text-slate-500">
                  {t('Horário e valor já preenchidos — um toque e salva.')}
                </p>
                <div>
                  {wpTemplates.map(tpl => {
                    const active = templateId === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setTemplateId(active ? '' : tpl.id)}
                        aria-pressed={active}
                        className="list-row w-full text-left"
                      >
                        <span
                          className={`min-w-0 border-l-2 pl-[14px] ${active ? '' : 'border-slate-300'}`}
                          style={active ? { borderColor: 'var(--color-primary)' } : undefined}
                        >
                          <span className={`block truncate text-[14.5px] tracking-[-0.01em] text-slate-900 ${active ? 'font-semibold' : 'font-medium'}`}>
                            {tpl.name}
                          </span>
                          <span className="block mt-1 text-[12.5px] font-normal text-slate-500 tabular-nums">
                            {tpl.start_time} — {tpl.end_time}
                          </span>
                        </span>
                        <span className="flex items-center gap-3 shrink-0">
                          <span className="text-[14.5px] font-normal text-slate-900 tabular-nums">{brl(tpl.default_value)}</span>
                          {active
                            ? <span className="text-blue-600"><CheckGlyph /></span>
                            : <span className="w-[18px] h-[18px] rounded-full border border-slate-300" aria-hidden="true" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Data e horário — treliça 2×2 editável */}
        <div className="data-lattice mt-[26px]">
          <div>
            <label htmlFor="add-shift-date" className={LATTICE_LABEL}>{t('Data')}</label>
            <input
              id="add-shift-date"
              ref={clearDarkFill}
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              onClick={openPicker}
              aria-invalid={!!errors.date}
              className={LATTICE_INPUT}
            />
          </div>
          <div>
            <p className={LATTICE_LABEL}>{t('Duração')}</p>
            <p className="mt-1.5 text-[15px] leading-[1.3] font-normal text-slate-900 tabular-nums">{durationLabel}</p>
          </div>
          <div>
            <label htmlFor="add-shift-start" className={LATTICE_LABEL}>{t('Início')}</label>
            <input
              id="add-shift-start"
              ref={clearDarkFill}
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              onClick={openPicker}
              aria-invalid={!!errors.startTime}
              className={LATTICE_INPUT}
            />
          </div>
          <div>
            <label htmlFor="add-shift-end" className={LATTICE_LABEL}>{t('Fim')}</label>
            <input
              id="add-shift-end"
              ref={clearDarkFill}
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              onClick={openPicker}
              aria-invalid={!!errors.endTime}
              className={LATTICE_INPUT}
            />
          </div>
        </div>
        {timeError && <p className="input-error">{timeError}</p>}

        {/* Valor previsto + valor-hora */}
        <div className="mt-[26px]">
          <Label htmlFor="add-shift-value">{t('Valor previsto')}</Label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-normal text-slate-500 pointer-events-none">R$</span>
            <input
              id="add-shift-value"
              type="number"
              inputMode="decimal"
              step="50"
              value={expectedValue}
              onChange={e => { setExpectedValue(e.target.value); if (errors.value) setErrors(prev => ({ ...prev, value: '' })); }}
              placeholder="0,00"
              aria-invalid={!!errors.value}
              className="input-field pl-[46px] tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
          {errors.value && <p className="input-error">{errors.value}</p>}
          {hourly > 0 && (
            <p className="mt-[10px] text-[12.5px] font-normal text-slate-500 tabular-nums">
              {brl(hourly)} {t('por hora neste plantão.')}
            </p>
          )}
        </div>

        {/* Forma de recebimento — recurso Pro (Free vê bloqueado; toque abre o paywall) */}
        <div className="mt-[26px]">
          <Label className="mb-[10px] flex items-center gap-[7px]">
            {t('Forma de recebimento')}
            {!canFiscalFields && <LockGlyph />}
          </Label>
          <div className="flex flex-wrap gap-2" style={{ opacity: canFiscalFields ? 1 : 0.55 }}>
            {FISCAL_NATURE_ORDER.map(nat => {
              const active = canFiscalFields && fiscalNature === nat;
              return (
                <button
                  key={nat}
                  type="button"
                  onClick={() => {
                    if (!canFiscalFields) { gate('fiscal_fields'); return; }
                    setFiscalNature(nat);
                  }}
                  aria-pressed={active}
                  className="chip"
                >
                  {formaLabel(nat)}
                </button>
              );
            })}
          </div>
          <p className="input-hint mt-3">
            {canFiscalFields
              ? t('Herdado do local. Detalhe as retenções depois, ao editar o plantão.')
              : t('Disponível no plano Pro — classifique cada plantão por regime fiscal.')}
          </p>
        </div>

        {/* MANUAL: detalhes */}
        {mode === 'manual' && (
          <div>
            <div className="section-rule"><span>{t('Detalhes')}</span></div>
            <div>
              <Label htmlFor="add-shift-title">{t('Título')}</Label>
              <input
                id="add-shift-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t('Plantão UTI')}
                className="input-field"
              />
            </div>
            <div className="grid grid-cols-2 gap-[10px] mt-[18px]">
              <div className="min-w-0">
                <Label htmlFor="add-shift-status">{t('Situação')}</Label>
                <select
                  id="add-shift-status"
                  value={status}
                  onChange={e => setStatus(e.target.value as ShiftStatus)}
                  className="input-field appearance-none"
                >
                  {(['previsto', 'realizado', 'recebido'] as ShiftStatus[]).map(s => (
                    <option key={s} value={s}>{t(STATUS_LABELS[s])}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <Label htmlFor="add-shift-due">{t('Vencimento')}</Label>
                <input
                  id="add-shift-due"
                  type="date"
                  value={paymentDueDate}
                  onChange={e => setPaymentDueDate(e.target.value)}
                  onClick={openPicker}
                  className={`input-field tabular-nums ${NO_PICKER_ICON}`}
                />
              </div>
            </div>
            <div className="mt-[18px]">
              <Label htmlFor="add-shift-notes">{t('Observações')}</Label>
              <textarea
                id="add-shift-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder={t('Troca com o Dr. Almeida, confirmar na escala')}
                className="input-field resize-none"
              />
            </div>
          </div>
        )}

        {/* RECORRENTE: frequência + prévia */}
        {mode === 'recurrence' && (
          <div>
            <div className="section-rule mb-2"><span>{t('Frequência')}</span></div>
            <p className="mb-[14px] text-[12.5px] font-normal text-slate-500 tabular-nums">
              {t('A série é gerada a partir de')} {validDate ? format(parseISO(date), 'dd/MM') : '—'}.
            </p>
            <div className="flex flex-wrap gap-2">
              {REC_ORDER.map(key => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRecOption(key)}
                  aria-pressed={recOption === key}
                  className="chip"
                >
                  {recLabel(key)}
                </button>
              ))}
            </div>

            {recOption === 'weekdays' && (
              <div className="mt-[18px]">
                <Label>{t('Dias')}</Label>
                <div className="flex gap-2">
                  {WEEKDAY_SHORT.map((l, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setRecWeekdays(d => d.includes(i) ? d.filter(x => x !== i) : [...d, i])}
                      aria-pressed={recWeekdays.includes(i)}
                      className="chip flex-1 min-w-0 px-0 text-center"
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {recOption === 'custom' && (
              <div className="mt-[18px]">
                <Label htmlFor="add-shift-interval">{t('Repetir a cada')}</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="add-shift-interval"
                    type="number"
                    inputMode="numeric"
                    value={recInterval}
                    onChange={e => setRecInterval(e.target.value)}
                    placeholder="7"
                    className="input-field w-24 tabular-nums"
                  />
                  <span className="text-[14px] text-slate-600">{t('dias')}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-[10px] mt-[18px]">
              <div className="min-w-0">
                <Label htmlFor="add-shift-rec-end">{t('Até')}</Label>
                <input
                  id="add-shift-rec-end"
                  type="date"
                  value={recEndDate}
                  onChange={e => setRecEndDate(e.target.value)}
                  onClick={openPicker}
                  className={`input-field tabular-nums ${NO_PICKER_ICON}`}
                />
              </div>
              <div className="min-w-0">
                <Label htmlFor="add-shift-rec-count">{t('Ou nº de vezes')}</Label>
                <input
                  id="add-shift-rec-count"
                  type="number"
                  inputMode="numeric"
                  value={recOccurrences}
                  onChange={e => setRecOccurrences(e.target.value)}
                  placeholder="12"
                  className="input-field tabular-nums"
                />
              </div>
            </div>

            {series.length > 0 && (
              <div className="notice flex-col gap-0 mt-[22px] py-[18px] pr-[18px] pl-5">
                <p className="text-[24px] font-extralight leading-none tracking-[-0.035em] text-slate-900 tabular-nums">
                  {series.length} {plural(series.length)}
                </p>
                <p className="mt-2 text-[12.5px] font-normal text-slate-500 tabular-nums">
                  {seriesPeriod} · {brl(seriesTotal)} {t('previstos')}
                </p>
              </div>
            )}
            {errors.recurrence && <p className="input-error">{errors.recurrence}</p>}
          </div>
        )}
      </div>

      {/* Rodapé fixo */}
      <div
        className={`shrink-0 px-6 pt-4 border-t bg-white ${isSheet ? 'pb-[calc(24px+env(safe-area-inset-bottom,0px))]' : 'pb-6'}`}
        style={{ borderTopColor: 'var(--color-border)' }}
      >
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || workplaces.length === 0}
          className="btn-primary disabled:bg-slate-300 disabled:cursor-not-allowed"
          style={{ opacity: saving ? 0.7 : 1 }}
        >
          {saving ? t('Salvando...') : saveLabel}
        </button>
      </div>
    </div>
  );

  if (isSheet) {
    return (
      <>
        <div
          className="fixed inset-0 z-[200] bg-[rgba(7,40,33,.44)] animate-[fadeInFast_.2s_ease-out]"
          onClick={onClose}
          aria-hidden="true"
        />
        {panel}
      </>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-[rgba(7,40,33,.44)] flex items-center justify-center p-4 animate-[fadeInFast_.2s_ease-out]"
      onClick={onClose}
    >
      {panel}
    </div>
  );
}
