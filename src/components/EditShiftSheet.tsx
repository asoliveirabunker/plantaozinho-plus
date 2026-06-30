import { useState, useEffect } from 'react';
import { X, Check, Copy, Trash2, Clock, DollarSign, CalendarDays, FileText, AlertCircle, Layers } from 'lucide-react';
import { getWorkplace, updateShift } from '../lib/db';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Shift, ShiftStatus, FiscalNature } from '../types';
import { STATUS_LABELS, FISCAL_NATURE_LABELS, resolveFiscalNature } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { usePlan } from '../contexts/PlanContext';
import { useGuest } from '../hooks/useGuest';

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUS_ORDER: ShiftStatus[] = ['previsto', 'realizado', 'recebido', 'atrasado', 'cancelado'];

function statusChipStyle(status: ShiftStatus, active: boolean) {
  const map: Record<ShiftStatus, { bg: string; text: string; activeBg: string }> = {
    previsto:   { bg: 'bg-slate-100',  text: 'text-slate-600',  activeBg: 'bg-slate-700' },
    realizado:  { bg: 'bg-blue-50',    text: 'text-blue-600',   activeBg: 'bg-blue-600' },
    recebido:   { bg: 'bg-emerald-50', text: 'text-emerald-700',activeBg: 'bg-emerald-600' },
    atrasado:   { bg: 'bg-red-50',     text: 'text-red-600',    activeBg: 'bg-red-600' },
    cancelado:  { bg: 'bg-slate-100',  text: 'text-slate-500',  activeBg: 'bg-slate-500' },
  };
  const m = map[status];
  return active
    ? `${m.activeBg} text-white shadow-sm`
    : `${m.bg} ${m.text} hover:opacity-80`;
}

function isoToInputDate(iso?: string) {
  if (!iso) return '';
  return iso.length >= 10 ? iso.slice(0, 10) : '';
}
function isoToInputTime(iso?: string) {
  if (!iso) return '';
  try { return format(parseISO(iso), 'HH:mm'); } catch { return ''; }
}

interface EditShiftSheetProps {
  shift: Shift;
  onClose: () => void;
  onSaved: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
}

export default function EditShiftSheet({ shift, onClose, onSaved, onDelete, onDuplicate }: EditShiftSheetProps) {
  const wp = getWorkplace(shift.workplace_id);
  const { t } = useLanguage();
  const { can } = usePlan();
  const { isGuest } = useGuest();

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

  // --- Campos fiscais (recurso Max) ---
  const showFiscal = can('mixed_fiscal_report') || isGuest;
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

  return (
    <div className="bottom-sheet-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {wp && (
              <div className="hospital-avatar shrink-0" style={{ background: wp.color }}>
                {wp.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{t('Editar plantão')}</p>
              <h3 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight truncate">{wp?.name || 'Plantão'}</h3>
              <p className="text-[12px] text-slate-500 mt-0.5 capitalize">{format(parseISO(shift.date), "EEEE, dd 'de' MMM", { locale: ptBR })}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all active:scale-95 shrink-0 ml-3">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Status */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t('Status')}</label>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_ORDER.map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide transition-all active:scale-95 ${statusChipStyle(s, status === s)}`}
                >
                  {t(STATUS_LABELS[s])}
                </button>
              ))}
            </div>
          </div>

          {/* Data e horário */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <CalendarDays size={11} strokeWidth={2.5} /> {t('Data e horário')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="date" value={date} onChange={e => setDate(e.target.value)}
                className="col-span-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
              />
              <div className="col-span-1">
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5 flex items-center gap-1"><Clock size={10} strokeWidth={2.5} /> {t('Início')}</p>
                <input
                  type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
                />
              </div>
              <span className="self-end pb-3 text-center text-slate-400 text-[12px]">{t('até')}</span>
              <div className="col-span-1">
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5 flex items-center gap-1"><Clock size={10} strokeWidth={2.5} /> {t('Fim')}</p>
                <input
                  type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
                />
              </div>
            </div>
          </div>

          {/* Valores */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <DollarSign size={11} strokeWidth={2.5} /> {t('Valores')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">{t('Previsto (R$)')}</p>
                <input
                  type="number" inputMode="decimal" step="50" value={expectedValue}
                  onChange={e => setExpectedValue(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
                />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">{t('Recebido (R$)')}</p>
                <input
                  type="number" inputMode="decimal" step="50" value={receivedValue}
                  onChange={e => setReceivedValue(e.target.value)}
                  placeholder={isReceivedFlow ? '0,00' : t('Opcional')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
                />
              </div>
            </div>
            {receivedValue && expectedValue && Math.abs(parseFloat(receivedValue) - parseFloat(expectedValue)) > 0.01 && (
              <div className="flex items-start gap-1.5 mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                <span>{t('Diferença de')} <strong>{formatCurrency(Math.abs(parseFloat(receivedValue) - parseFloat(expectedValue)))}</strong> {t('entre o valor previsto e o recebido.')}</span>
              </div>
            )}
          </div>

          {/* Datas de pagamento */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <CalendarDays size={11} strokeWidth={2.5} /> {t('Pagamento')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">{t('Previsto para')}</p>
                <input
                  type="date" value={paymentDue} onChange={e => setPaymentDue(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
                />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">{t('Pago em')}</p>
                <input
                  type="date" value={paymentReceived} onChange={e => setPaymentReceived(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
                />
              </div>
            </div>
          </div>

          {/* Fiscal (recurso Max) — alimenta o Relatório por Regime Fiscal */}
          {showFiscal && (
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Layers size={11} strokeWidth={2.5} /> {t('Forma de recebimento')}
              </label>
              {/* forma de recebimento */}
              <div className="flex gap-1.5 mb-2">
                {(['PJ', 'AUTONOMO'] as FiscalNature[]).map(nat => (
                  <button key={nat} type="button" onClick={() => setFiscalNature(nat)}
                    className={`flex-1 py-2 rounded-xl text-[11px] font-semibold transition-all active:scale-95 ${
                      fiscalNature === nat ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}>
                    {FISCAL_NATURE_LABELS[nat]}
                  </button>
                ))}
              </div>
              {/* campos por natureza */}
              {fiscalNature === 'PJ' && (
                <div className="space-y-2">
                  <input value={nfNumber} onChange={e => setNfNumber(e.target.value)} placeholder="Nº da Nota Fiscal"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
                  <div className="grid grid-cols-3 gap-2">
                    {([['ISS', issRetido, setIssRetido], ['PIS', pis, setPis], ['COFINS', cofins, setCofins]] as const).map(([label, val, set]) => (
                      <div key={label}>
                        <p className="text-[10px] text-slate-500 mb-1 ml-0.5">{label} (R$)</p>
                        <input type="text" inputMode="decimal" value={val} onChange={e => set(e.target.value.replace(/[^0-9.,]/g, ''))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {fiscalNature === 'AUTONOMO' && (
                <div className="grid grid-cols-2 gap-2">
                  {([['INSS retido', inssRetido, setInssRetido], ['IRRF', irrfRetido, setIrrfRetido]] as const).map(([label, val, set]) => (
                    <div key={label}>
                      <p className="text-[10px] text-slate-500 mb-1 ml-0.5">{label} (R$)</p>
                      <input type="text" inputMode="decimal" value={val} onChange={e => set(e.target.value.replace(/[^0-9.,]/g, ''))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-slate-400 mt-1.5 ml-0.5">Usado no Relatório por Forma de Recebimento. Deixe em branco para considerar zero.</p>
            </div>
          )}

          {/* Observações */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <FileText size={11} strokeWidth={2.5} /> {t('Observações')}
            </label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder={t('Anotações sobre o plantão (escala, contatos, divergências...)')}
              rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition resize-none"
            />
          </div>

          {error && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            {onDuplicate && (
              <button onClick={onDuplicate}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[12.5px] font-semibold hover:bg-slate-200 transition active:scale-[0.98]">
                <Copy size={13} strokeWidth={2.5} /> {t('Duplicar')}
              </button>
            )}
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-red-50 text-red-600 text-[12.5px] font-semibold hover:bg-red-100 transition active:scale-[0.98]">
              <Trash2 size={13} strokeWidth={2.5} /> {t('Excluir')}
            </button>
            <button onClick={handleSave}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-[13px] font-bold hover:bg-blue-700 transition active:scale-[0.98] shadow-sm shadow-blue-600/20 flex items-center justify-center gap-1.5">
              <Check size={14} strokeWidth={3} /> {t('Salvar alterações')}
            </button>
          </div>
        </div>

        {/* Confirm delete overlay */}
        {confirmDelete && (
          <div className="fixed inset-0 z-[400] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setConfirmDelete(false)}>
            <div className="bg-white w-full max-w-xs rounded-2xl p-5 shadow-xl animate-fade-in" onClick={e => e.stopPropagation()}>
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <h4 className="text-center font-bold text-slate-900 text-[15px] mb-1">{t('Excluir plantão?')}</h4>
              <p className="text-center text-slate-500 text-[12px] mb-4">{t('Essa ação não pode ser desfeita.')}</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold hover:bg-slate-200 transition active:scale-[0.98]">
                  {t('Cancelar')}
                </button>
                <button onClick={() => { setConfirmDelete(false); onDelete(); }}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-[13px] font-bold hover:bg-red-700 transition active:scale-[0.98]">
                  {t('Excluir')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
