import { useState, useEffect, type MouseEvent, type ReactNode } from 'react';
import { X, Trash2 } from 'lucide-react';
import { getWorkplace, updateShift } from '../lib/db';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Shift, ShiftStatus, FiscalNature } from '../types';
import { STATUS_LABELS, FISCAL_NATURE_LABELS, FISCAL_NATURE_ORDER, isPJNature, resolveFiscalNature } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { usePlan } from '../contexts/PlanContext';
import { useGuest } from '../hooks/useGuest';
import MarbleBackground from './MarbleBackground';

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUS_ORDER: ShiftStatus[] = ['previsto', 'realizado', 'recebido', 'atrasado', 'cancelado'];

const MODAL_SHADOW = '0 40px 80px -30px rgba(7,56,45,.5)';

/** Campo de data/hora sem ícone nativo — o toque abre o seletor (ver `openPicker`). */
const NO_PICKER_ICON = '[&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-date-and-time-value]:text-left';

/** Campo dentro da treliça: sem caixa, 15/400 (mesma peça do Adicionar plantão). */
const LATTICE_INPUT = `block w-full mt-1 h-[22px] p-0 border-0 bg-transparent text-[15px] leading-[22px] font-normal text-slate-900 outline-none tabular-nums appearance-none ${NO_PICKER_ICON}`;
const LATTICE_LABEL = 'block text-[12.5px] leading-[1.3] font-normal text-slate-500';

/** Campo numérico sem as setas do navegador. */
const NO_SPIN = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

function isoToInputDate(iso?: string) {
  if (!iso) return '';
  return iso.length >= 10 ? iso.slice(0, 10) : '';
}
function isoToInputTime(iso?: string) {
  if (!iso) return '';
  try { return format(parseISO(iso), 'HH:mm'); } catch { return ''; }
}

/** "segunda-feira, 14 de setembro de 2026" → "Segunda, 14 de setembro de 2026" */
function longDate(dateStr: string) {
  try {
    const s = format(parseISO(dateStr), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR }).replace('-feira', '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    return dateStr;
  }
}

function calcDuration(start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) diff += 1440;
  return Math.round(diff * 10 / 60) / 10;
}

/** Rótulos de forma de recebimento como no design ("PF / Autônomo"). */
function formaLabel(n: FiscalNature) {
  return n === 'AUTONOMO' ? 'PF / Autônomo' : FISCAL_NATURE_LABELS[n];
}

/** Abre o seletor nativo ao tocar em qualquer ponto do campo. */
function openPicker(e: MouseEvent<HTMLInputElement>) {
  try { e.currentTarget.showPicker?.(); } catch { /* navegador sem suporte */ }
}

/** O modo escuro pinta todo `input` com !important; na treliça o campo não tem caixa. */
function clearDarkFill(el: HTMLInputElement | null) {
  el?.style.setProperty('background-color', 'transparent', 'important');
}

/** Rótulo de campo 13/500 fora do campo. */
function Label({ children, htmlFor, className = '' }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return htmlFor
    ? <label htmlFor={htmlFor} className={`input-label ${className}`}>{children}</label>
    : <p className={`input-label ${className}`}>{children}</p>;
}

/** Campo de valor com "R$" à esquerda (mesma peça do "Valor previsto"). */
function MoneyInput({ id, value, onChange, placeholder, invalid }: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-normal text-slate-500 pointer-events-none">R$</span>
      <input
        id={id}
        type="number" inputMode="decimal" step="50"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        className={`input-field pl-[46px] tabular-nums ${NO_SPIN}`}
      />
    </div>
  );
}

interface EditShiftSheetProps {
  shift: Shift;
  onClose: () => void;
  onSaved: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
}

/**
 * Editar plantão — modal centrado "de destaque": cabeçalho de pedra
 * (enquadramento `deep`, o mesmo do detalhe do plantão) e corpo no mesmo
 * vocabulário do "Adicionar plantão · Manual": chips, treliça 2×2 de
 * data/horário, campos 52px, seção "Detalhes" em filete e rodapé fixo.
 */
export default function EditShiftSheet({ shift, onClose, onSaved, onDelete, onDuplicate }: EditShiftSheetProps) {
  const wp = getWorkplace(shift.workplace_id);
  const { t } = useLanguage();
  const { can, gate } = usePlan();
  const { isGuest } = useGuest();

  // Edição de plantões é recurso Pro — Free só pode excluir (visitante experimenta tudo).
  const canEdit = can('shift_editing') || isGuest;

  const [status, setStatus] = useState<ShiftStatus>(shift.status);
  const [date, setDate] = useState(shift.date);
  const [startTime, setStartTime] = useState(isoToInputTime(shift.start_datetime));
  const [endTime, setEndTime] = useState(isoToInputTime(shift.end_datetime));
  const [expectedValue, setExpectedValue] = useState(String(shift.expected_value ?? ''));
  const [receivedValue, setReceivedValue] = useState(shift.received_value != null ? String(shift.received_value) : '');
  const [paymentDue, setPaymentDue] = useState(shift.payment_due_date || '');
  const [paymentReceived, setPaymentReceived] = useState(isoToInputDate(shift.payment_received_date));
  const [notes, setNotes] = useState(shift.notes || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  // --- Campos fiscais ---
  // Forma de recebimento + detalhamento de impostos: recurso Pro (visitante experimenta tudo).
  const showFiscal = can('fiscal_fields') || isGuest;
  const [fiscalNature, setFiscalNature] = useState<FiscalNature>(resolveFiscalNature(shift, wp));
  const [nfNumber, setNfNumber] = useState(shift.nf_number || '');
  const numToStr = (v?: number) => (v != null ? String(v) : '');
  const [issRetido, setIssRetido] = useState(numToStr(shift.iss_retido));
  const [pis, setPis] = useState(numToStr(shift.pis));
  const [cofins, setCofins] = useState(numToStr(shift.cofins));
  const [inssRetido, setInssRetido] = useState(numToStr(shift.inss_retido));
  const [irrfRetido, setIrrfRetido] = useState(numToStr(shift.irrf_retido));

  const isReceivedFlow = status === 'recebido';

  useEffect(() => {
    if (status === 'recebido' && receivedValue === '') {
      setReceivedValue(String(shift.expected_value ?? ''));
    }
    if (status === 'recebido' && !paymentReceived) {
      setPaymentReceived(format(new Date(), 'yyyy-MM-dd'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function buildIsoDatetime(dateStr: string, timeStr: string) {
    const [h, m] = timeStr.split(':').map(Number);
    const [y, mo, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, (mo || 1) - 1, d || 1, h || 0, m || 0);
    return dt.toISOString();
  }

  function handleSave() {
    setError('');
    const expected = parseFloat(expectedValue.replace(',', '.'));
    if (!date) { setError('Informe a data do plantão.'); return; }
    if (!startTime || !endTime) { setError('Informe os horários de início e fim.'); return; }
    if (isNaN(expected) || expected < 0) { setError('Valor previsto inválido.'); return; }

    const startIso = buildIsoDatetime(date, startTime);
    let endIso = buildIsoDatetime(date, endTime);
    if (new Date(endIso) <= new Date(startIso)) {
      const endDt = new Date(endIso);
      endDt.setDate(endDt.getDate() + 1);
      endIso = endDt.toISOString();
    }
    const durationHours = (new Date(endIso).getTime() - new Date(startIso).getTime()) / (1000 * 60 * 60);

    const receivedNum = receivedValue.trim() ? parseFloat(receivedValue.replace(',', '.')) : undefined;
    const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return isNaN(n) ? undefined : n; };

    updateShift(shift.id, {
      date,
      start_datetime: startIso,
      end_datetime: endIso,
      duration_hours: durationHours,
      expected_value: expected,
      received_value: receivedNum,
      payment_due_date: paymentDue || undefined,
      payment_received_date: paymentReceived ? new Date(paymentReceived + 'T12:00:00').toISOString() : undefined,
      status,
      notes: notes.trim() || undefined,
      // Fiscal (só persiste se o recurso estiver disponível)
      ...(showFiscal ? {
        fiscal_nature: fiscalNature,
        nf_number: nfNumber.trim() || undefined,
        iss_retido: num(issRetido),
        pis: num(pis),
        cofins: num(cofins),
        inss_retido: num(inssRetido),
        irrf_retido: num(irrfRetido),
      } : {}),
    });
    onSaved();
  }

  const valueDiff = receivedValue && expectedValue
    ? Math.abs(parseFloat(receivedValue) - parseFloat(expectedValue))
    : 0;

  // Treliça: duração calculada e valor-hora, como no Adicionar plantão.
  const hasTimes = !!startTime && !!endTime;
  const duration = hasTimes ? calcDuration(startTime, endTime) : 0;
  const durationLabel = hasTimes
    ? `${String(duration).replace('.', ',')} ${duration === 1 ? t('hora') : t('horas')}`
    : '—';
  const expectedNum = parseFloat(expectedValue);
  const hourly = expectedNum > 0 && duration > 0 ? Math.round((expectedNum / duration) * 100) / 100 : 0;

  const taxCell = (key: string, label: string, val: string, set: (v: string) => void) => (
    <div key={key} className="min-w-0">
      <Label htmlFor={`edit-shift-${key}`}>{label} (R$)</Label>
      <input
        id={`edit-shift-${key}`}
        type="text" inputMode="decimal" value={val}
        onChange={e => set(e.target.value.replace(/[^0-9.,]/g, ''))}
        className="input-field px-3 tabular-nums"
      />
    </div>
  );

  return (
    <>
      <div className="bottom-sheet-overlay animate-fade-in" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('Editar plantão')}
          className="bg-white w-full max-w-sm rounded-3xl overflow-hidden animate-scale-in flex flex-col"
          style={{ maxHeight: '88vh', boxShadow: MODAL_SHADOW }}
          onClick={e => e.stopPropagation()}
        >
          {/* Cabeçalho de pedra — enquadramento `deep`, o mesmo do detalhe do plantão */}
          <div className="relative overflow-hidden px-6 pt-5 pb-6 shrink-0">
            <MarbleBackground frame="deep" />
            <div className="relative">
              <div className="flex items-center justify-between gap-4">
                <p className="text-[13.5px] font-medium text-white/80">{t('Editar plantão')}</p>
                <button
                  onClick={onClose}
                  className="glass-icon-btn !w-[34px] !h-[34px] shrink-0"
                  aria-label={t('Fechar')}
                >
                  <X size={15} strokeWidth={1.6} />
                </button>
              </div>
              <h3 className="mt-4 text-[26px] font-light leading-[1.1] tracking-[-0.035em] text-white break-words">
                {wp?.name || 'Plantão'}
              </h3>
              <p className="mt-2 text-[13.5px] text-white/[0.86]">{longDate(shift.date)}</p>
            </div>
          </div>

          {!canEdit ? (
            /* Plano Free: edição bloqueada (Recurso Pro) — apenas excluir é permitido */
            <>
              <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-6 pt-6">
                <button
                  type="button"
                  onClick={() => gate('shift_editing')}
                  className="notice w-full flex-col gap-0 text-left"
                >
                  <span className="flex items-center gap-[7px] text-[14px] font-semibold text-slate-900">
                    {t('Recurso Pro')}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true" className="shrink-0">
                      <rect x="5" y="11" width="14" height="9" rx="2" />
                      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
                    </svg>
                  </span>
                  <span className="block mt-[3px] text-[12.5px] font-normal leading-[1.5] text-slate-500">
                    {t('Editar status, valores, horários e observações está disponível no plano Pro.')}
                  </span>
                </button>
              </div>
              <div className="px-6 pt-6 pb-6 shrink-0">
                <button type="button" onClick={() => gate('shift_editing')} className="btn-primary">
                  {t('Desbloquear edição')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="btn-danger mt-[10px]"
                >
                  {t('Excluir')}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-6 pt-6 pb-5">
                {/* Situação */}
                <Label className="mb-[10px]">{t('Situação')}</Label>
                <div role="group" aria-label={t('Situação')} className="flex flex-wrap gap-2">
                  {STATUS_ORDER.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      aria-pressed={status === s}
                      className="chip"
                    >
                      {t(STATUS_LABELS[s])}
                    </button>
                  ))}
                </div>

                {/* Data e horário — treliça 2×2 editável */}
                <div className="data-lattice mt-[26px]">
                  <div>
                    <label htmlFor="edit-shift-date" className={LATTICE_LABEL}>{t('Data')}</label>
                    <input
                      id="edit-shift-date"
                      ref={clearDarkFill}
                      type="date" value={date} onChange={e => setDate(e.target.value)}
                      onClick={openPicker}
                      className={LATTICE_INPUT}
                    />
                  </div>
                  <div>
                    <p className={LATTICE_LABEL}>{t('Duração')}</p>
                    <p className="mt-1.5 text-[15px] leading-[1.3] font-normal text-slate-900 tabular-nums">{durationLabel}</p>
                  </div>
                  <div>
                    <label htmlFor="edit-shift-start" className={LATTICE_LABEL}>{t('Início')}</label>
                    <input
                      id="edit-shift-start"
                      ref={clearDarkFill}
                      type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                      onClick={openPicker}
                      className={LATTICE_INPUT}
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-shift-end" className={LATTICE_LABEL}>{t('Fim')}</label>
                    <input
                      id="edit-shift-end"
                      ref={clearDarkFill}
                      type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                      onClick={openPicker}
                      className={LATTICE_INPUT}
                    />
                  </div>
                </div>

                {/* Valor previsto + valor-hora */}
                <div className="mt-[26px]">
                  <Label htmlFor="edit-shift-expected">{t('Valor previsto')}</Label>
                  <MoneyInput
                    id="edit-shift-expected"
                    value={expectedValue}
                    onChange={setExpectedValue}
                    placeholder="0,00"
                    invalid={error === 'Valor previsto inválido.'}
                  />
                  {hourly > 0 && (
                    <p className="mt-[10px] text-[12.5px] font-normal text-slate-500 tabular-nums">
                      {formatCurrency(hourly)} {t('por hora neste plantão.')}
                    </p>
                  )}
                </div>

                {/* Valor recebido */}
                <div className="mt-[18px]">
                  <Label htmlFor="edit-shift-received">{t('Valor recebido')}</Label>
                  <MoneyInput
                    id="edit-shift-received"
                    value={receivedValue}
                    onChange={setReceivedValue}
                    placeholder={isReceivedFlow ? '0,00' : t('Opcional')}
                  />
                  {valueDiff > 0.01 && (
                    <div className="notice notice-warn mt-3 flex-col gap-0">
                      <span className="block text-[14px] font-semibold text-slate-900 tabular-nums">
                        {t('Diferença de')} {formatCurrency(valueDiff)}
                      </span>
                      <span className="block mt-[3px] text-[12.5px] font-normal leading-[1.5] text-slate-500">
                        {t('entre o valor previsto e o recebido.')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Forma de recebimento — detalhamento das retenções */}
                {showFiscal && (
                  <div className="mt-[26px]">
                    <Label className="mb-[10px]">{t('Forma de recebimento')}</Label>
                    <div className="flex flex-wrap gap-2">
                      {FISCAL_NATURE_ORDER.map(nat => (
                        <button
                          key={nat}
                          type="button"
                          onClick={() => setFiscalNature(nat)}
                          aria-pressed={fiscalNature === nat}
                          className="chip"
                        >
                          {formaLabel(nat)}
                        </button>
                      ))}
                    </div>

                    {/* campos por natureza */}
                    {isPJNature(fiscalNature) && (
                      <>
                        <div className="mt-[18px]">
                          <Label htmlFor="edit-shift-nf">{t('Nº da Nota Fiscal')}</Label>
                          <input
                            id="edit-shift-nf"
                            value={nfNumber}
                            onChange={e => setNfNumber(e.target.value)}
                            className="input-field tabular-nums"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-[10px] mt-[18px]">
                          {taxCell('ISS', 'ISS', issRetido, setIssRetido)}
                          {taxCell('PIS', 'PIS', pis, setPis)}
                          {taxCell('COFINS', 'COFINS', cofins, setCofins)}
                        </div>
                      </>
                    )}
                    {fiscalNature === 'AUTONOMO' && (
                      <div className="grid grid-cols-2 gap-[10px] mt-[18px]">
                        {taxCell('INSS-retido', 'INSS retido', inssRetido, setInssRetido)}
                        {taxCell('IRRF', 'IRRF', irrfRetido, setIrrfRetido)}
                      </div>
                    )}
                    <p className="input-hint mt-3">
                      {t('Usado no Relatório por Forma de Recebimento. Deixe em branco para considerar zero.')}
                    </p>
                  </div>
                )}

                {/* Detalhes */}
                <div className="section-rule"><span>{t('Detalhes')}</span></div>
                <div className="grid grid-cols-2 gap-[10px]">
                  <div className="min-w-0">
                    <Label htmlFor="edit-shift-due">{t('Vencimento')}</Label>
                    <input
                      id="edit-shift-due"
                      type="date" value={paymentDue} onChange={e => setPaymentDue(e.target.value)}
                      onClick={openPicker}
                      className={`input-field tabular-nums ${NO_PICKER_ICON}`}
                    />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor="edit-shift-paid">{t('Pago em')}</Label>
                    <input
                      id="edit-shift-paid"
                      type="date" value={paymentReceived} onChange={e => setPaymentReceived(e.target.value)}
                      onClick={openPicker}
                      className={`input-field tabular-nums ${NO_PICKER_ICON}`}
                    />
                  </div>
                </div>
                <div className="mt-[18px]">
                  <Label htmlFor="edit-shift-notes">{t('Observações')}</Label>
                  <textarea
                    id="edit-shift-notes"
                    value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder={t('Anotações sobre o plantão (escala, contatos, divergências...)')}
                    rows={3}
                    className="input-field resize-none"
                  />
                </div>

                {error && (
                  <div className="notice notice-warn mt-[22px] items-start" role="alert">
                    <span className="text-[14px] font-semibold text-slate-900">{t(error)}</span>
                  </div>
                )}
              </div>

              {/* Rodapé fixo: primária 52px + secundária/terracota 48px */}
              <div className="px-6 pt-4 pb-6 shrink-0 border-t" style={{ borderTopColor: 'var(--color-border)' }}>
                <button type="button" onClick={handleSave} className="btn-primary">
                  {t('Salvar alterações')}
                </button>
                <div className="mt-[10px] flex gap-[10px]">
                  {onDuplicate && (
                    <button
                      type="button"
                      onClick={onDuplicate}
                      className="btn-secondary flex-1 px-3"
                    >
                      {t('Duplicar')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="btn-danger flex-1 px-3"
                  >
                    {t('Excluir')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Confirmação: excluir plantão */}
      {confirmDelete && (
        <div className="modal-overlay z-[400] animate-fade-in" onClick={() => setConfirmDelete(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={t('Excluir plantão?')}
            className="bg-white w-full max-w-xs rounded-3xl p-6 animate-scale-in"
            style={{ boxShadow: MODAL_SHADOW }}
            onClick={e => e.stopPropagation()}
          >
            <Trash2 size={20} strokeWidth={1.5} className="text-red-600" />
            <h4 className="mt-4 text-[22px] font-light leading-[1.15] tracking-[-0.03em] text-slate-900">
              {t('Excluir plantão?')}
            </h4>
            <p className="mt-1.5 text-[13px] text-slate-500">{t('Essa ação não pode ser desfeita.')}</p>
            <div className="mt-6 flex gap-[10px]">
              <button type="button" onClick={() => setConfirmDelete(false)} className="btn-secondary flex-1 px-3">
                {t('Cancelar')}
              </button>
              <button
                type="button"
                onClick={() => { setConfirmDelete(false); onDelete(); }}
                className="btn-danger flex-1 px-3"
              >
                {t('Excluir')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
