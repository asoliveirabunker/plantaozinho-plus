import { useState, useEffect } from 'react';
import { Plus, Trash2, X, Check, ChevronLeft, ChevronRight, HelpCircle, Zap, AlertCircle } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { createWorkplace, deleteWorkplace, createShiftTemplate, deleteShiftTemplate, getShiftTemplates, updateWorkplace, updateShiftTemplate } from '../lib/db';
import type { Workplace, WorkplaceType, PaymentMethod, ShiftType, ShiftTemplate, FiscalNature } from '../types';
import { WORKPLACE_TYPE_LABELS, WORKPLACE_COLORS, FISCAL_NATURE_LABELS, FISCAL_NATURE_ORDER, SHIFT_TYPE_LABELS, resolveFiscalNature } from '../types';
import { format } from 'date-fns';
import { ptBR, es } from 'date-fns/locale';
import { useLanguage } from '../hooks/useLanguage';
import { usePlan } from '../contexts/PlanContext';
import JadePlate from '../components/JadePlate';
import MarbleBackground from '../components/MarbleBackground';
import ConfirmDialog from '../components/ConfirmDialog';
import AddShiftModal from '../components/AddShiftModal';

type TFn = (key: string) => string;

function fmtCur(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

/** Número herói: "R$ 7.000" + ",00" (centavos sempre, em corpo menor — 40/200 + 22/300). */
function heroMoney(v: number) {
  const s = fmtCur(v);
  const i = s.lastIndexOf(',');
  return i < 0 ? { int: s, cents: '' } : { int: s.slice(0, i), cents: s.slice(i) };
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

/** Horário do modelo no formato do design: "07:00 — 19:00". */
function timeRange(start: string, end: string) { return `${start} — ${end}`; }

/** Natureza fiscal curta, no vocabulário do design ("PJ · Simples"). */
const FISCAL_NATURE_SHORT: Record<FiscalNature, string> = {
  MEI: 'PJ · MEI',
  SIMPLES: 'PJ · Simples',
  LUCRO_PRESUMIDO: 'PJ · Lucro Presumido',
  PJ: 'PJ',
  AUTONOMO: 'PF · Autônomo',
};

function calcDuration(start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) diff += 1440;
  return diff / 60;
}

const PAYMENT_METHODS: PaymentMethod[] = ['PJ', 'PF', 'RPA', 'cooperativa', 'outro'];
const SHIFT_TYPES: ShiftType[] = ['dia', 'noite', '24h', 'sobreaviso', 'sala_vermelha', 'UTI', 'anestesia', 'cirurgia', 'ambulatorio', 'outro'];

/** Filete padrão (adapta ao modo escuro). */
const RULE = '1px solid var(--color-border)';
const MODAL_SHADOW = { boxShadow: '0 40px 80px -30px rgba(7,56,45,.5)' };

const workplaceTypeOptions = (t: TFn) =>
  (Object.keys(WORKPLACE_TYPE_LABELS) as WorkplaceType[]).map(k => ({ value: k, label: t(WORKPLACE_TYPE_LABELS[k]) }));
const shiftTypeOptions = (t: TFn) =>
  SHIFT_TYPES.map(k => ({ value: k, label: t(SHIFT_TYPE_LABELS[k]) }));

// ============================================================
// PEÇAS COMPARTILHADAS
// ============================================================

/** Escolha única em chips (`aria-pressed`). */
function ChipGroup<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" className="chip"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Paleta do local: as bolinhas são dado do usuário; a selecionada ganha anel jade. */
function ColorPalette({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap gap-3" role="group" aria-label={t('Cor de identificação')}>
      {WORKPLACE_COLORS.map(c => {
        const selected = value === c;
        return (
          <button key={c} type="button" onClick={() => onChange(c)}
            aria-pressed={selected} aria-label={c}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-shadow"
            style={{
              background: c,
              boxShadow: selected ? '0 0 0 2px var(--color-surface), 0 0 0 3.5px var(--color-primary)' : 'none',
            }}>
            {selected && <Check size={14} strokeWidth={2.2} color="#fff" />}
          </button>
        );
      })}
    </div>
  );
}

/** Erro de formulário — a peça única de "atenção" do sistema. */
function FormNotice({ message, className = '' }: { message: string; className?: string }) {
  return (
    <div role="alert" className={`notice notice-warn items-start ${className}`}>
      <AlertCircle size={17} strokeWidth={1.6} className="shrink-0 mt-0.5 text-red-600" />
      <span className="text-[13.5px] leading-[1.45] text-slate-900">{message}</span>
    </div>
  );
}

/** Cabeçalho das telas de formulário (Novo local / Novo modelo). */
function FormScreenHeader({ eyebrow, dotColor, title, subtitle, onClose }: {
  eyebrow: string;
  dotColor?: string;
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  return (
    <header className="px-6 pt-8 pb-2 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[13px] text-slate-500">
          {dotColor && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />}
          <span className="truncate">{eyebrow}</span>
        </p>
        <h1 className="section-title mt-1">{title}</h1>
        <p className="section-subtitle">{subtitle}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={onClose}
          className="icon-btn w-10 h-10 flex items-center justify-center"
          title={t('Fechar')} aria-label={t('Fechar')}>
          <X size={19} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}

/**
 * Rodapé fixo dos formulários em tela. A placa branca desce até o rodapé e a
 * ilha de navegação (z-30) flutua por cima dela; os botões ficam acima da ilha.
 */
function FormFooter({ onCancel, onSave, saveLabel, disabled }: {
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-[25] px-6 pt-3 bg-white flex gap-3"
      style={{ borderTop: RULE, paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 0px))' }}
    >
      <button type="button" onClick={onCancel} className="btn-secondary flex-1 h-[52px]">
        {t('Cancelar')}
      </button>
      <button type="button" onClick={onSave} disabled={disabled}
        className="btn-primary flex-[2] disabled:opacity-50 disabled:cursor-not-allowed">
        <Check size={17} strokeWidth={1.8} /> {saveLabel}
      </button>
    </div>
  );
}

/** Cabeçalho do modal centrado padrão. */
function ModalHeader({ eyebrow, dotColor, title, subtitle, onClose }: {
  eyebrow: string;
  dotColor?: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="p-6 flex items-start justify-between gap-4 shrink-0">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[13px] text-slate-500">
          {dotColor && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />}
          <span className="truncate">{eyebrow}</span>
        </p>
        <h3 className="mt-1 text-[22px] font-light leading-tight tracking-[-0.03em] text-slate-900 truncate">{title}</h3>
        {subtitle && <p className="mt-1 text-[13px] text-slate-500 tabular-nums truncate">{subtitle}</p>}
      </div>
      <button type="button" onClick={onClose}
        className="icon-btn w-10 h-10 -mr-2 -mt-1 flex items-center justify-center shrink-0"
        title={t('Fechar')} aria-label={t('Fechar')}>
        <X size={18} strokeWidth={1.5} />
      </button>
    </div>
  );
}

/** Célula da treliça 2×2 do detalhe (`.data-lattice`): rótulo 12/400, valor 15/400. */
function LatticeCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-slate-500">{label}</p>
      <p className="mt-[5px] text-[15px] text-slate-900 tabular-nums break-words">{value}</p>
    </div>
  );
}

// ============================================================
// TELA
// ============================================================

interface LocaisScreenProps {
  /** Quando true, abre direto no formulário de novo local (ex.: vindo do aviso do AddShiftModal). */
  autoOpenNew?: boolean;
  /** Chamado após consumir o autoOpenNew, para o pai resetar a flag. */
  onAutoOpenNewHandled?: () => void;
}

export default function LocaisScreen({ autoOpenNew, onAutoOpenNewHandled }: LocaisScreenProps = {}) {
  const { user, workplaces, shifts, refreshWorkplaces, refreshShifts } = useApp();
  const { t, language } = useLanguage();
  const { limits, requireUpgrade, plan } = usePlan();
  const [showHelp, setShowHelp] = useState(false);
  const [showAddShift, setShowAddShift] = useState(false);

  // "Setembro" — mês corrente, com inicial maiúscula.
  const monthName = cap(format(new Date(), 'MMMM', { locale: language === 'es-LATAM' ? es : ptBR }));

  // Porteiro de criação de local: respeita o limite do plano (Free = 1).
  function handleNewWorkplace() {
    if (limits.maxWorkplaces !== null && workplaces.length >= limits.maxWorkplaces) {
      requireUpgrade('unlimited_workplaces');
      return;
    }
    setView('new');
  }
  const [view, setView] = useState<'list' | 'detail' | 'new' | 'newTemplate'>('list');

  useEffect(() => {
    if (autoOpenNew) {
      handleNewWorkplace();
      onAutoOpenNewHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenNew]);
  const [selectedWp, setSelectedWp] = useState<Workplace | null>(null);
  const [editWpSheet, setEditWpSheet] = useState<Workplace | null>(null);
  const [editTemplateSheet, setEditTemplateSheet] = useState<ShiftTemplate | null>(null);


  // New workplace form
  const [form, setForm] = useState({
    name: '', type: 'hospital' as WorkplaceType, color: WORKPLACE_COLORS[0],
    default_shift_value: '', default_duration_hours: '12',
    payment_day: '10', payment_method: 'PJ' as PaymentMethod,
    fiscal_nature: 'PJ' as FiscalNature,
    contact_name: '', contact_phone: '', cnpj: '', address: '',
  });
  const [formError, setFormError] = useState('');

  // New template form
  const [tForm, setTForm] = useState({
    name: '', start_time: '07:00', end_time: '19:00',
    default_value: '', shift_type: 'dia' as ShiftType, notes: '',
  });
  const [tFormError, setTFormError] = useState('');

  function handleCreateWp() {
    if (!user) return;
    if (!form.name.trim()) { setFormError('Informe o nome do local.'); return; }
    setFormError('');
    createWorkplace({
      user_id: user.id,
      name: form.name.trim(),
      type: form.type,
      color: form.color,
      default_shift_value: parseFloat(form.default_shift_value) || 0,
      default_duration_hours: parseFloat(form.default_duration_hours) || 12,
      payment_day: parseInt(form.payment_day) || 10,
      payment_method: form.payment_method,
      fiscal_nature: form.fiscal_nature,
      contact_name: form.contact_name,
      contact_phone: form.contact_phone,
      cnpj: form.cnpj,
      address: form.address,
      active: true,
    });
    refreshWorkplaces();
    setView('list');
    setForm({ name:'', type:'hospital', color:WORKPLACE_COLORS[0], default_shift_value:'', default_duration_hours:'12', payment_day:'10', payment_method:'PJ', fiscal_nature:'PJ', contact_name:'', contact_phone:'', cnpj:'', address:'' });
  }

  // confirm() nativo é bloqueado em iframes/webviews: a exclusão usa o ConfirmDialog.
  // Excluir local só existe no detalhe (o design tirou a lixeira da lista);
  // excluir modelo fica dentro do modal de edição do modelo.
  const [pendingDeleteWpId, setPendingDeleteWpId] = useState<string | null>(null);

  function handleDeleteWp(id: string) {
    setPendingDeleteWpId(id);
  }

  function confirmPendingDelete() {
    if (!pendingDeleteWpId) return;
    deleteWorkplace(pendingDeleteWpId);
    refreshWorkplaces();
    setView('list');
    setPendingDeleteWpId(null);
  }

  const deleteConfirm = (
    <ConfirmDialog
      open={!!pendingDeleteWpId}
      icon={Trash2}
      title={t('Excluir local?')}
      description={t('O local sai da sua lista. Os plantões já lançados não são apagados.')}
      confirmLabel={t('Excluir')}
      tone="danger"
      onCancel={() => setPendingDeleteWpId(null)}
      onConfirm={confirmPendingDelete}
    />
  );

  /** "Hospital · pagamento dia 10 · PJ" — linha de meta da lista e da placa. */
  function wpMeta(wp: Workplace) {
    return `${t(WORKPLACE_TYPE_LABELS[wp.type])} · ${t('pagamento dia')} ${wp.payment_day} · ${t(cap(wp.payment_method))}`;
  }

  function handleCreateTemplate() {
    if (!user || !selectedWp) return;
    if (!tForm.name.trim()) { setTFormError('Informe o nome do modelo.'); return; }
    setTFormError('');
    const duration = calcDuration(tForm.start_time, tForm.end_time);
    createShiftTemplate({
      user_id: user.id,
      workplace_id: selectedWp.id,
      name: tForm.name.trim(),
      start_time: tForm.start_time,
      end_time: tForm.end_time,
      duration_hours: duration,
      default_value: parseFloat(tForm.default_value) || selectedWp.default_shift_value,
      shift_type: tForm.shift_type,
      notes: tForm.notes,
    });
    refreshWorkplaces();
    setView('detail');
    setTForm({ name:'', start_time:'07:00', end_time:'19:00', default_value:'', shift_type:'dia', notes:'' });
  }

  function getWpStats(wp: Workplace) {
    if (!user) return { count: 0, total: 0, received: 0 };
    const now = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const monthShifts = shifts.filter(s => s.workplace_id === wp.id && s.date.startsWith(prefix) && s.status !== 'cancelado');
    return {
      count: monthShifts.length,
      total: monthShifts.reduce((s, sh) => s + sh.expected_value, 0),
      received: monthShifts.filter(sh => sh.status === 'recebido').reduce((s, sh) => s + sh.expected_value, 0),
    };
  }

  // ---- VIEWS ----

  if (view === 'newTemplate' && selectedWp) {
    const tDuration = calcDuration(tForm.start_time, tForm.end_time);
    return (
      <div className="bg-white min-h-screen pb-[190px]">
        <FormScreenHeader
          eyebrow={selectedWp.name}
          dotColor={selectedWp.color}
          title={t('Novo modelo')}
          subtitle={t('Horário e valor salvos para lançar em um toque.')}
          onClose={() => setView('detail')}
        />

        <div className="px-6">
          {/* Modelo */}
          <div className="section-rule !mt-6"><span>{t('Modelo')}</span></div>
          <label className="input-label" htmlFor="tpl-new-name">{t('Nome do modelo')}</label>
          <input id="tpl-new-name" className="input-field" value={tForm.name}
            onChange={e => { setTForm(f => ({ ...f, name: e.target.value })); if (tFormError) setTFormError(''); }}
            placeholder={t('Ex: "Noite 19h–7h"')}
            aria-invalid={tFormError ? true : undefined} />

          <p className="input-label mt-5">{t('Tipo de escala')}</p>
          <ChipGroup
            label={t('Tipo de escala')}
            options={shiftTypeOptions(t)}
            value={tForm.shift_type}
            onChange={v => setTForm(f => ({ ...f, shift_type: v }))}
          />

          {/* Horário */}
          <div className="section-rule"><span>{t('Horário')}</span></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label" htmlFor="tpl-new-start">{t('Início')}</label>
              <input id="tpl-new-start" type="time" className="input-field tabular-nums" value={tForm.start_time}
                onChange={e => setTForm(f => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div>
              <label className="input-label" htmlFor="tpl-new-end">{t('Fim')}</label>
              <input id="tpl-new-end" type="time" className="input-field tabular-nums" value={tForm.end_time}
                onChange={e => setTForm(f => ({ ...f, end_time: e.target.value }))} />
            </div>
          </div>
          <p className="input-hint tabular-nums">
            {t('Duração:')} <span className="font-semibold text-slate-700">{tDuration}h</span>
          </p>

          {/* Valor */}
          <div className="section-rule"><span>{t('Valor')}</span></div>
          <label className="input-label" htmlFor="tpl-new-value">{t('Valor padrão (R$)')}</label>
          <input id="tpl-new-value" type="number" inputMode="decimal" step="50" className="input-field tabular-nums"
            value={tForm.default_value}
            onChange={e => setTForm(f => ({ ...f, default_value: e.target.value }))}
            placeholder={selectedWp.default_shift_value.toString()} />
          <p className="input-hint">
            {t('Em branco, usa o valor padrão do local')} ({fmtCur(selectedWp.default_shift_value)}).
          </p>

          {tFormError && <FormNotice className="mt-6" message={t(tFormError)} />}
        </div>

        <FormFooter
          onCancel={() => setView('detail')}
          onSave={handleCreateTemplate}
          disabled={!tForm.name.trim()}
          saveLabel={t('Salvar modelo')}
        />
      </div>
    );
  }

  if (view === 'new') {
    return (
      <div className="bg-white min-h-screen pb-[190px]">
        <FormScreenHeader
          eyebrow={t('Locais de plantão')}
          title={t('Novo local')}
          subtitle={t('Hospital, UPA ou clínica onde você atende.')}
          onClose={() => setView('list')}
        />

        <div className="px-6">
          {/* Identificação */}
          <div className="section-rule !mt-6"><span>{t('Identificação')}</span></div>
          <label className="input-label" htmlFor="wp-new-name">{t('Nome do local')}</label>
          <input id="wp-new-name" className="input-field" value={form.name}
            onChange={e => { setForm(f => ({ ...f, name: e.target.value })); if (formError) setFormError(''); }}
            placeholder="Hospital São Marcos"
            aria-invalid={formError ? true : undefined} />

          <p className="input-label mt-5">{t('Tipo')}</p>
          <ChipGroup
            label={t('Tipo')}
            options={workplaceTypeOptions(t)}
            value={form.type}
            onChange={v => setForm(f => ({ ...f, type: v }))}
          />

          {/* Cor de identificação */}
          <div className="section-rule"><span>{t('Cor de identificação')}</span></div>
          <ColorPalette value={form.color} onChange={c => setForm(f => ({ ...f, color: c }))} />

          {/* Plantão padrão */}
          <div className="section-rule"><span>{t('Plantão padrão')}</span></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label" htmlFor="wp-new-value">{t('Valor (R$)')}</label>
              <input id="wp-new-value" type="number" inputMode="decimal" step="50" className="input-field tabular-nums"
                value={form.default_shift_value}
                onChange={e => setForm(f => ({ ...f, default_shift_value: e.target.value }))}
                placeholder="1400" />
            </div>
            <div>
              <label className="input-label" htmlFor="wp-new-duration">{t('Duração (h)')}</label>
              <input id="wp-new-duration" type="number" inputMode="decimal" step="0.5" className="input-field tabular-nums"
                value={form.default_duration_hours}
                onChange={e => setForm(f => ({ ...f, default_duration_hours: e.target.value }))}
                placeholder="12" />
            </div>
          </div>

          {/* Pagamento */}
          <div className="section-rule"><span>{t('Pagamento')}</span></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label" htmlFor="wp-new-payday">{t('Dia do mês')}</label>
              <input id="wp-new-payday" type="number" inputMode="numeric" min="1" max="31" className="input-field tabular-nums"
                value={form.payment_day}
                onChange={e => setForm(f => ({ ...f, payment_day: e.target.value }))}
                placeholder="10" />
            </div>
            <div>
              <label className="input-label" htmlFor="wp-new-method">{t('Método')}</label>
              <select id="wp-new-method" className="input-field" value={form.payment_method}
                onChange={e => setForm(f => ({ ...f, payment_method: e.target.value as PaymentMethod }))}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(cap(m))}</option>)}
              </select>
            </div>
          </div>

          <label className="input-label mt-5" htmlFor="wp-new-fiscal">{t('Forma de recebimento')}</label>
          <select id="wp-new-fiscal" className="input-field" value={form.fiscal_nature}
            onChange={e => setForm(f => ({ ...f, fiscal_nature: e.target.value as FiscalNature }))}>
            {FISCAL_NATURE_ORDER.map(n => <option key={n} value={n}>{t(FISCAL_NATURE_LABELS[n])}</option>)}
          </select>
          <p className="input-hint">{t('Usada no relatório do contador.')}</p>

          <label className="input-label mt-5" htmlFor="wp-new-cnpj">{t('CNPJ/CPF da fonte pagadora')}</label>
          <input id="wp-new-cnpj" className="input-field tabular-nums" value={form.cnpj}
            onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))}
            placeholder={t('Opcional')} />

          {/* Contato (opcional) */}
          <div className="section-rule">
            <span>{t('Contato')}</span>
            <span className="order-last text-[12.5px] text-slate-500">{t('opcional')}</span>
          </div>
          <label className="input-label" htmlFor="wp-new-address">{t('Endereço')}</label>
          <input id="wp-new-address" className="input-field" value={form.address}
            onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            placeholder={t('Rua, número, cidade')} />
          <div className="grid grid-cols-2 gap-3 mt-5">
            <div>
              <label className="input-label" htmlFor="wp-new-contact">{t('Responsável')}</label>
              <input id="wp-new-contact" className="input-field" value={form.contact_name}
                onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                placeholder={t('Nome')} />
            </div>
            <div>
              <label className="input-label" htmlFor="wp-new-phone">{t('Telefone')}</label>
              <input id="wp-new-phone" type="tel" className="input-field tabular-nums" value={form.contact_phone}
                onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                placeholder="(00) 00000-0000" />
            </div>
          </div>

          {formError && <FormNotice className="mt-6" message={t(formError)} />}
        </div>

        <FormFooter
          onCancel={() => setView('list')}
          onSave={handleCreateWp}
          disabled={!form.name.trim()}
          saveLabel={t('Salvar local')}
        />
      </div>
    );
  }

  // Adicionar plantão a partir do detalhe do local ("Lançar plantão aqui"):
  // o modal abre aqui mesmo, já com este local selecionado.
  const addShiftModal = showAddShift && (
    <AddShiftModal
      initialWorkplaceId={selectedWp?.id}
      onClose={() => setShowAddShift(false)}
      onGoToLocais={() => { setShowAddShift(false); handleNewWorkplace(); }}
    />
  );

  if (view === 'detail' && selectedWp) {
    const templates = user ? getShiftTemplates(user.id, selectedWp.id) : [];
    const stats = getWpStats(selectedWp);
    const monthTotal = workplaces.reduce((a, w) => a + getWpStats(w).total, 0);
    const share = monthTotal > 0 ? Math.round((stats.total / monthTotal) * 100) : 0;
    const hero = heroMoney(stats.total);

    // "Hospital São Marcos" → "Hospital" (300) / "São Marcos" (600)
    const nameWords = selectedWp.name.trim().split(/\s+/);
    const titleLight = nameWords.length > 1 ? nameWords[0] : undefined;
    const titleBold = nameWords.length > 1 ? nameWords.slice(1).join(' ') : selectedWp.name;

    // Treliça 2×2: valor padrão · duração · valor hora (padrão ÷ duração) · natureza fiscal.
    const duration = selectedWp.default_duration_hours;
    const durationLabel = duration > 0
      ? `${duration.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${duration === 1 ? t('hora') : t('horas')}`
      : '—';
    const hourly = duration > 0 ? fmtCur(selectedWp.default_shift_value / duration) : '—';
    const fiscal = resolveFiscalNature({ fiscal_nature: undefined }, selectedWp);
    const facts = [
      { label: t('Valor padrão'), value: fmtCur(selectedWp.default_shift_value) },
      { label: t('Duração padrão'), value: durationLabel },
      { label: t('Valor hora'), value: hourly },
      { label: t('Natureza fiscal'), value: t(FISCAL_NATURE_SHORT[fiscal]) },
    ];

    return (
      <div className="bg-white min-h-screen">
        <JadePlate
          frame="hero"
          // Design do detalhe: meta a 28px do topo e título em 28px (a placa padrão usa 26/30).
          plateClassName="[&_p]:mt-[28px] [&_p]:text-white/[.82] [&_h1]:text-[28px] [&_h1]:break-words"
          top={
            <div className="flex items-start justify-between gap-4">
              <button type="button" onClick={() => setView('list')} className="glass-icon-btn shrink-0"
                aria-label={t('Voltar')} title={t('Voltar')}>
                <ChevronLeft size={17} strokeWidth={1.5} />
              </button>
              <button type="button" onClick={() => setEditWpSheet(selectedWp)}
                className="glass-pill shrink-0 border-white/[.28] hover:bg-white/[.24]"
                aria-label={t('Editar local')} title={t('Editar local')}>
                {t('Editar')}
              </button>
            </div>
          }
          eyebrow={wpMeta(selectedWp)}
          titleLight={titleLight}
          titleBold={titleBold}
        >
          {/* Previsto no mês — número herói 40/200 com centavos 22/300 */}
          <p className="text-[13px] text-slate-500">{t('Previsto em')} {monthName}</p>
          <p className="mt-2.5 text-[40px] font-extralight leading-none tracking-[-0.04em] text-slate-900 tabular-nums whitespace-nowrap">
            {hero.int}<span className="text-[22px] font-light text-slate-500">{hero.cents}</span>
          </p>
          <p className="mt-2.5 text-[13px] text-slate-500 tabular-nums">
            {stats.count} {stats.count !== 1 ? t('plantões') : t('plantão')} · {share}% {t('dos seus ganhos')}
          </p>

          <div className="data-lattice mt-[26px]">
            {facts.map(f => <LatticeCell key={f.label} label={f.label} value={f.value} />)}
          </div>

          {/* Modelos de plantão */}
          <div className="flex items-center gap-3.5 mt-8 mb-1.5">
            <span className="text-[15px] font-semibold tracking-[-0.015em] text-slate-900 whitespace-nowrap">
              {t('Modelos de plantão')}
            </span>
            <span aria-hidden="true" className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
            <button type="button" onClick={() => setView('newTemplate')}
              className="shrink-0 text-[12.5px] font-medium text-blue-600 whitespace-nowrap border-b border-[#C9DED6] hover:border-blue-600 transition-colors">
              {t('Novo')}
            </button>
          </div>
          <p className="mb-1.5 text-[12.5px] leading-[1.55] text-slate-500">
            {t('Horário e valor salvos para lançar em um toque.')}
          </p>
          {templates.length === 0 ? (
            <div className="flex items-center justify-between gap-4 py-4" style={{ borderBottom: RULE }}>
              <p className="min-w-0 text-[13px] text-slate-500">{t('Nenhum modelo criado ainda.')}</p>
              <button type="button" onClick={() => setView('newTemplate')}
                className="shrink-0 text-[12.5px] font-medium text-blue-600 whitespace-nowrap border-b border-[#C9DED6] hover:border-blue-600 transition-colors">
                {t('Criar primeiro modelo')}
              </button>
            </div>
          ) : (
            <div>
              {templates.map(tp => (
                // Tocar na linha abre a edição (e dentro dela, a exclusão do modelo).
                <button key={tp.id} type="button" onClick={() => setEditTemplateSheet(tp)}
                  title="Editar modelo" aria-label={`${t('Editar modelo')}: ${tp.name}`}
                  className="w-full flex items-center justify-between gap-4 py-4 text-left bg-transparent hover:bg-slate-50 transition-colors"
                  style={{ borderBottom: RULE }}>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-medium text-slate-900 truncate">{tp.name}</span>
                    <span className="block mt-1 text-[12.5px] text-slate-500 tabular-nums">
                      {timeRange(tp.start_time, tp.end_time)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[14.5px] text-slate-900 tabular-nums">{fmtCur(tp.default_value)}</span>
                </button>
              ))}
            </div>
          )}

          <button type="button" onClick={() => setShowAddShift(true)} className="btn-primary mt-7">
            {t('Lançar plantão aqui')}
          </button>
          <button type="button" onClick={() => handleDeleteWp(selectedWp.id)} className="btn-danger mt-2.5">
            {t('Excluir local')}
          </button>
        </JadePlate>

        {editWpSheet && (
          <EditWorkplaceSheet
            key={editWpSheet.id}
            workplace={editWpSheet}
            onClose={() => setEditWpSheet(null)}
            onSaved={(updated) => { setSelectedWp(updated); setEditWpSheet(null); refreshWorkplaces(); refreshShifts(); }}
          />
        )}
        {editTemplateSheet && (
          <EditTemplateSheet
            key={editTemplateSheet.id}
            template={editTemplateSheet}
            workplaceColor={selectedWp.color}
            onClose={() => setEditTemplateSheet(null)}
            onSaved={() => { setEditTemplateSheet(null); refreshWorkplaces(); }}
            onDelete={() => { deleteShiftTemplate(editTemplateSheet.id); setEditTemplateSheet(null); refreshWorkplaces(); }}
          />
        )}
        {addShiftModal}
        {deleteConfirm}
      </div>
    );
  }

  // LIST
  const helpSteps = [
    { title: 'Cadastre seu local', desc: 'Hospital, UPA ou clínica — com cor, valor padrão e dia de pagamento.' },
    { title: 'Crie modelos de plantão', desc: 'Salve horários e valores recorrentes para lançar plantões em 1 toque.' },
    { title: 'Acompanhe por local', desc: 'Veja quantos plantões e quanto faturou em cada lugar no mês.' },
  ];

  const listStats = workplaces.map(wp => ({ wp, stats: getWpStats(wp) }));
  const listMonthTotal = listStats.reduce((a, r) => a + r.stats.total, 0);

  return (
    <div className="page-content bg-white min-h-screen">
      {/* Cabeçalho em papel — sem mármore na lista */}
      <header className="bg-slate-50 px-6 pt-[56px] pb-[22px]">
        <p className="text-[13px] text-slate-500">{t('Cadastro')}</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <h1 className="min-w-0 text-[28px] font-light leading-[1.05] tracking-[-0.035em] text-slate-900">
            {t('Locais de')}<br /><span className="font-semibold">{t('plantão')}</span>
          </h1>
          <div className="flex items-center gap-2.5 shrink-0">
            <button type="button" onClick={() => setShowHelp(true)}
              className="w-[34px] h-[34px] rounded-[12px] border border-slate-200 bg-white text-slate-600 flex items-center justify-center p-0 transition-colors hover:border-blue-600 hover:text-blue-600"
              title="Como usar" aria-label={t('Como usar')}>
              <HelpCircle size={16} strokeWidth={1.5} />
            </button>
            <button type="button" onClick={handleNewWorkplace}
              className="w-11 h-11 rounded-[14px] bg-blue-600 text-white flex items-center justify-center p-0 transition-colors hover:bg-blue-700"
              title="Novo local" aria-label={t('Novo local')}>
              <Plus size={20} strokeWidth={1.6} />
            </button>
          </div>
        </div>
        <p className="mt-3.5 text-[13px] text-slate-500 tabular-nums">
          {workplaces.length === 0
            ? t('Hospital, UPA ou clínica onde você atende.')
            : `${workplaces.length} ${workplaces.length !== 1 ? t('locais') : t('local')} · ${fmtCur(listMonthTotal)} ${t('previstos em')} ${monthName}`}
        </p>
      </header>

      <div className="px-6 pt-2">
        {workplaces.length === 0 ? (
          <div className="pt-[60px] pb-10 text-center">
            <p className="text-[19px] font-light tracking-[-0.025em] text-slate-900">{t('Nenhum local cadastrado')}</p>
            <p className="mt-2.5 mx-auto max-w-[280px] text-[13.5px] leading-[1.6] text-slate-500">
              {t('Adicione hospitais, UPAs e clínicas onde você faz plantões.')}
            </p>
            <button type="button" onClick={handleNewWorkplace} className="btn-primary mt-[22px]">
              {t('Adicionar primeiro local')}
            </button>
          </div>
        ) : (
          <div>
            {listStats.map(({ wp, stats }) => {
              const cells = [
                { label: t('Valor padrão'), value: fmtCur(wp.default_shift_value) },
                { label: t('No mês'), value: String(stats.count) },
                { label: t('Total'), value: fmtCur(stats.total) },
              ];
              return (
                <button key={wp.id} type="button" onClick={() => { setSelectedWp(wp); setView('detail'); }}
                  className="block w-full text-left py-[22px] bg-transparent hover:bg-slate-50 transition-colors"
                  style={{ borderBottom: RULE }}>
                  <span className="flex items-start justify-between gap-4">
                    <span className="place-rule block min-w-0" style={{ borderLeftColor: wp.color }}>
                      <span className="block text-[16px] font-medium tracking-[-0.015em] text-slate-900 truncate">{wp.name}</span>
                      <span className="block mt-[5px] text-[12.5px] text-slate-500 truncate">{wpMeta(wp)}</span>
                    </span>
                    <ChevronRight size={18} strokeWidth={1.5} className="shrink-0 mt-0.5 text-slate-500" aria-hidden="true" />
                  </span>
                  {/* Treliça de 3 dados: valor padrão · no mês · total */}
                  <span className="mt-4 pl-4 flex">
                    {cells.map((c, i) => (
                      <span key={c.label}
                        className={`block flex-1 min-w-0 ${i > 0 ? 'pl-4' : ''}`}
                        style={i > 0 ? { borderLeft: RULE } : undefined}>
                        <span className="block text-[12px] text-slate-500 truncate">{c.label}</span>
                        <span className="block mt-[5px] text-[14.5px] text-slate-900 tabular-nums whitespace-nowrap overflow-hidden text-ellipsis">
                          {c.value}
                        </span>
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* COMO USAR + UPSELL PRO (modal centrado)                      */}
      {/* ============================================================ */}
      {showHelp && (
        <div className="modal-overlay animate-fade-in" onClick={() => setShowHelp(false)}>
          <div
            role="dialog" aria-modal="true" aria-label={t('Como usar')}
            className="bg-white w-full max-w-sm rounded-3xl overflow-hidden animate-scale-in max-h-[90vh] overflow-y-auto hide-scrollbar"
            style={MODAL_SHADOW}
            onClick={e => e.stopPropagation()}
          >
            <ModalHeader eyebrow={t('Locais de plantão')} title={t('Como usar')} onClose={() => setShowHelp(false)} />

            <div className="px-6 pb-6">
              {/* Passos numerados, em linhas de filete */}
              <ol style={{ borderTop: RULE }}>
                {helpSteps.map((step, i) => (
                  <li key={step.title} className="flex items-start gap-4 py-3.5" style={{ borderBottom: RULE }}>
                    <span className="w-6 shrink-0 text-[15px] font-light leading-[1.3] text-blue-600 tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold leading-[1.3] text-slate-900">{t(step.title)}</span>
                      <span className="block mt-1 text-[12.5px] leading-[1.5] text-slate-500">{t(step.desc)}</span>
                    </span>
                  </li>
                ))}
              </ol>

              {/* Upsell: no Free só cabe 1 local */}
              {plan === 'free' && (
                <div className="relative overflow-hidden rounded-2xl p-5 mt-6">
                  <MarbleBackground frame="deep" />
                  <div className="relative">
                    {/* Sem caixa-alta: o único versalete do sistema é o cabeçalho de grupo do extrato. */}
                    <span className="glass-pill h-[30px] px-3 border-white/[.28]">
                      <Zap size={12} strokeWidth={1.8} /> {t('Plano Pro')}
                    </span>
                    <p className="mt-5 text-[22px] font-light leading-[1.1] tracking-[-0.03em] text-white">
                      {t('Mais de um local')}
                    </p>
                    <p className="mt-2 text-[13px] leading-[1.55] text-white/[0.86]">
                      {t('No plano Free você cadastra 1 local. Com o Pro, cadastre hospitais, UPAs e clínicas ilimitados e gerencie toda a sua escala em um só lugar.')}
                    </p>
                    {/* Fundo branco fixo (inline): `bg-white` vira escuro no modo escuro. */}
                    <button type="button"
                      onClick={() => { setShowHelp(false); requireUpgrade('unlimited_workplaces'); }}
                      className="mt-5 w-full h-12 rounded-xl text-[14px] font-semibold text-[#0C2A24] flex items-center justify-center transition-opacity hover:opacity-90"
                      style={{ background: '#fff' }}>
                      {t('Conhecer o Plano Pro')}
                    </button>
                  </div>
                </div>
              )}

              <button type="button" onClick={() => setShowHelp(false)}
                className={`btn-secondary ${plan === 'free' ? 'mt-3' : 'mt-6'}`}>
                {t('Entendi')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MODAL: EDITAR LOCAL
// ============================================================
function EditWorkplaceSheet({ workplace, onClose, onSaved }: {
  workplace: Workplace;
  onClose: () => void;
  onSaved: (updated: Workplace) => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(workplace.name);
  const [type, setType] = useState<WorkplaceType>(workplace.type);
  const [color, setColor] = useState(workplace.color);
  const [defaultValue, setDefaultValue] = useState(String(workplace.default_shift_value));
  const [defaultDuration, setDefaultDuration] = useState(String(workplace.default_duration_hours));
  const [paymentDay, setPaymentDay] = useState(String(workplace.payment_day));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(workplace.payment_method);
  const [fiscalNature, setFiscalNature] = useState<FiscalNature>(workplace.fiscal_nature || 'PJ');
  const [cnpj, setCnpj] = useState(workplace.cnpj || '');
  const [address, setAddress] = useState(workplace.address || '');
  const [contactName, setContactName] = useState(workplace.contact_name || '');
  const [contactPhone, setContactPhone] = useState(workplace.contact_phone || '');
  const [notes, setNotes] = useState(workplace.notes || '');
  const [error, setError] = useState('');

  function handleSave() {
    setError('');
    if (!name.trim()) { setError('Informe o nome do local.'); return; }
    const dv = parseFloat(defaultValue.replace(',', '.'));
    const dh = parseFloat(defaultDuration.replace(',', '.'));
    const pd = parseInt(paymentDay);
    if (isNaN(dv) || dv < 0) { setError('Valor padrão inválido.'); return; }
    if (isNaN(dh) || dh <= 0) { setError('Duração padrão inválida.'); return; }
    if (isNaN(pd) || pd < 1 || pd > 31) { setError('Dia de pagamento deve estar entre 1 e 31.'); return; }
    const updated = updateWorkplace(workplace.id, {
      name: name.trim(),
      type,
      color,
      default_shift_value: dv,
      default_duration_hours: dh,
      payment_day: pd,
      payment_method: paymentMethod,
      fiscal_nature: fiscalNature,
      cnpj: cnpj || undefined,
      address: address || undefined,
      contact_name: contactName || undefined,
      contact_phone: contactPhone || undefined,
      notes: notes || undefined,
    });
    onSaved(updated);
  }

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={t('Editar local')}
        className="bg-white w-full max-w-sm rounded-3xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh]"
        style={MODAL_SHADOW}
        onClick={e => e.stopPropagation()}
      >
        <ModalHeader
          eyebrow={t('Editar local')}
          dotColor={color}
          title={name.trim() || t('Local')}
          subtitle={t(WORKPLACE_TYPE_LABELS[type])}
          onClose={onClose}
        />

        <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-6 pb-6">
          {/* Identificação */}
          <div className="section-rule !mt-0 !mb-3"><span>{t('Identificação')}</span></div>
          <label className="input-label" htmlFor="wp-edit-name">{t('Nome do local')}</label>
          <input id="wp-edit-name" className="input-field" value={name}
            onChange={e => setName(e.target.value)} placeholder={t('Nome do local')}
            aria-invalid={error && !name.trim() ? true : undefined} />
          <p className="input-label mt-4">{t('Tipo')}</p>
          <ChipGroup label={t('Tipo')} options={workplaceTypeOptions(t)} value={type} onChange={setType} />

          {/* Cor */}
          <div className="section-rule !mt-6 !mb-3"><span>{t('Cor de identificação')}</span></div>
          <ColorPalette value={color} onChange={setColor} />

          {/* Plantão padrão */}
          <div className="section-rule !mt-6 !mb-3"><span>{t('Plantão padrão')}</span></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label" htmlFor="wp-edit-value">{t('Valor (R$)')}</label>
              <input id="wp-edit-value" type="number" inputMode="decimal" step="0.01" className="input-field tabular-nums"
                value={defaultValue} onChange={e => setDefaultValue(e.target.value)} placeholder="1400" />
            </div>
            <div>
              <label className="input-label" htmlFor="wp-edit-duration">{t('Duração (h)')}</label>
              <input id="wp-edit-duration" type="number" inputMode="decimal" step="0.5" className="input-field tabular-nums"
                value={defaultDuration} onChange={e => setDefaultDuration(e.target.value)} placeholder="12" />
            </div>
          </div>

          {/* Pagamento */}
          <div className="section-rule !mt-6 !mb-3"><span>{t('Pagamento')}</span></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label" htmlFor="wp-edit-payday">{t('Dia do mês')}</label>
              <input id="wp-edit-payday" type="number" inputMode="numeric" min="1" max="31" className="input-field tabular-nums"
                value={paymentDay} onChange={e => setPaymentDay(e.target.value)} placeholder="10" />
            </div>
            <div>
              <label className="input-label" htmlFor="wp-edit-method">{t('Método')}</label>
              <select id="wp-edit-method" className="input-field" value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(cap(m))}</option>)}
              </select>
            </div>
          </div>
          <label className="input-label mt-4" htmlFor="wp-edit-fiscal">{t('Forma de recebimento')}</label>
          <select id="wp-edit-fiscal" className="input-field" value={fiscalNature}
            onChange={e => setFiscalNature(e.target.value as FiscalNature)}>
            {FISCAL_NATURE_ORDER.map(n => <option key={n} value={n}>{t(FISCAL_NATURE_LABELS[n])}</option>)}
          </select>
          <p className="input-hint">{t('Usada no relatório do contador.')}</p>
          <label className="input-label mt-4" htmlFor="wp-edit-cnpj">{t('CNPJ/CPF')}</label>
          <input id="wp-edit-cnpj" className="input-field tabular-nums" value={cnpj}
            onChange={e => setCnpj(e.target.value)} placeholder={t('Opcional')} />

          {/* Contato */}
          <div className="section-rule !mt-6 !mb-3">
            <span>{t('Contato')}</span>
            <span className="order-last text-[12.5px] text-slate-500">{t('opcional')}</span>
          </div>
          <label className="input-label" htmlFor="wp-edit-address">{t('Endereço')}</label>
          <input id="wp-edit-address" className="input-field" value={address}
            onChange={e => setAddress(e.target.value)} placeholder={t('Rua, número, cidade')} />
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div>
              <label className="input-label" htmlFor="wp-edit-contact">{t('Responsável')}</label>
              <input id="wp-edit-contact" className="input-field" value={contactName}
                onChange={e => setContactName(e.target.value)} placeholder={t('Nome')} />
            </div>
            <div>
              <label className="input-label" htmlFor="wp-edit-phone">{t('Telefone')}</label>
              <input id="wp-edit-phone" type="tel" className="input-field tabular-nums" value={contactPhone}
                onChange={e => setContactPhone(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
          </div>

          {/* Observações */}
          <div className="section-rule !mt-6 !mb-3"><span>{t('Observações')}</span></div>
          <textarea className="input-field resize-none" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            aria-label={t('Observações')}
            placeholder={t('Notas internas sobre este local...')} />
        </div>

        {error && (
          <div className="px-6 pt-4 shrink-0" style={{ borderTop: RULE }}>
            <FormNotice message={t(error)} />
          </div>
        )}

        <div className="px-6 pt-4 pb-6 flex gap-3 shrink-0" style={error ? undefined : { borderTop: RULE }}>
          <button type="button" onClick={onClose} className="btn-secondary flex-1 h-[52px]">
            {t('Cancelar')}
          </button>
          <button type="button" onClick={handleSave} className="btn-primary flex-[2]">
            <Check size={17} strokeWidth={1.8} /> {t('Salvar alterações')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL: EDITAR MODELO DE PLANTÃO
// ============================================================
function EditTemplateSheet({ template, workplaceColor, onClose, onSaved, onDelete }: {
  template: ShiftTemplate;
  workplaceColor: string;
  onClose: () => void;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(template.name);
  const [shiftType, setShiftType] = useState<ShiftType>(template.shift_type);
  const [startTime, setStartTime] = useState(template.start_time);
  const [endTime, setEndTime] = useState(template.end_time);
  const [defaultValue, setDefaultValue] = useState(String(template.default_value));
  const [notes, setNotes] = useState(template.notes || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const duration = calcDuration(startTime, endTime);

  function handleSave() {
    setError('');
    if (!name.trim()) { setError('Informe o nome do modelo.'); return; }
    const v = parseFloat(defaultValue.replace(',', '.'));
    if (isNaN(v) || v < 0) { setError('Valor inválido.'); return; }
    updateShiftTemplate(template.id, {
      name: name.trim(),
      shift_type: shiftType,
      start_time: startTime,
      end_time: endTime,
      duration_hours: duration,
      default_value: v,
      notes: notes || undefined,
    });
    onSaved();
  }

  return (
    <>
      <div className="modal-overlay animate-fade-in" onClick={onClose}>
        <div
          role="dialog" aria-modal="true" aria-label={t('Editar modelo')}
          className="bg-white w-full max-w-sm rounded-3xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh]"
          style={MODAL_SHADOW}
          onClick={e => e.stopPropagation()}
        >
          <ModalHeader
            eyebrow={t('Editar modelo')}
            dotColor={workplaceColor}
            title={name.trim() || t('Modelo')}
            subtitle={`${timeRange(startTime, endTime)} · ${duration}h`}
            onClose={onClose}
          />

          <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-6 pb-6">
            {/* Identificação */}
            <div className="section-rule !mt-0 !mb-3"><span>{t('Identificação')}</span></div>
            <label className="input-label" htmlFor="tpl-edit-name">{t('Nome do modelo')}</label>
            <input id="tpl-edit-name" className="input-field" value={name}
              onChange={e => setName(e.target.value)} placeholder={t('Ex: "Noite 19h–7h"')}
              aria-invalid={error && !name.trim() ? true : undefined} />
            <p className="input-label mt-4">{t('Tipo de escala')}</p>
            <ChipGroup label={t('Tipo de escala')} options={shiftTypeOptions(t)} value={shiftType} onChange={setShiftType} />

            {/* Horário */}
            <div className="section-rule !mt-6 !mb-3"><span>{t('Horário')}</span></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="input-label" htmlFor="tpl-edit-start">{t('Início')}</label>
                <input id="tpl-edit-start" type="time" className="input-field tabular-nums" value={startTime}
                  onChange={e => setStartTime(e.target.value)} />
              </div>
              <div>
                <label className="input-label" htmlFor="tpl-edit-end">{t('Fim')}</label>
                <input id="tpl-edit-end" type="time" className="input-field tabular-nums" value={endTime}
                  onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>
            <p className="input-hint tabular-nums">
              {t('Duração:')} <span className="font-semibold text-slate-700">{duration}h</span>
            </p>

            {/* Valor */}
            <div className="section-rule !mt-6 !mb-3"><span>{t('Valor')}</span></div>
            <label className="input-label" htmlFor="tpl-edit-value">{t('Valor padrão (R$)')}</label>
            <input id="tpl-edit-value" type="number" inputMode="decimal" step="0.01" className="input-field tabular-nums"
              value={defaultValue} onChange={e => setDefaultValue(e.target.value)} placeholder="1400"
              aria-invalid={error && name.trim() ? true : undefined} />

            {/* Observações */}
            <div className="section-rule !mt-6 !mb-3"><span>{t('Observações')}</span></div>
            <textarea className="input-field resize-none" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              aria-label={t('Observações')}
              placeholder={t('Anotações sobre este modelo...')} />
          </div>

          {error && (
            <div className="px-6 pt-4 shrink-0" style={{ borderTop: RULE }}>
              <FormNotice message={t(error)} />
            </div>
          )}

          <div className="px-6 pt-4 pb-6 flex gap-3 shrink-0" style={error ? undefined : { borderTop: RULE }}>
            <button type="button" onClick={() => setConfirmDelete(true)}
              className="btn-danger flex-1 h-[52px] flex items-center justify-center gap-2">
              <Trash2 size={16} strokeWidth={1.5} /> {t('Excluir')}
            </button>
            <button type="button" onClick={handleSave} className="btn-primary flex-[2]">
              <Check size={17} strokeWidth={1.8} /> {t('Salvar alterações')}
            </button>
          </div>
        </div>
      </div>

      {/* Confirmação interna — irmã do modal, para o clique não fechar a edição */}
      {confirmDelete && (
        <div className="modal-overlay z-[400] animate-fade-in" onClick={() => setConfirmDelete(false)}>
          <div
            role="alertdialog" aria-modal="true" aria-labelledby="tpl-delete-title"
            className="bg-white w-full max-w-xs rounded-3xl p-6 animate-scale-in"
            style={MODAL_SHADOW}
            onClick={e => e.stopPropagation()}
          >
            <Trash2 size={20} strokeWidth={1.5} className="text-red-600" />
            <h4 id="tpl-delete-title" className="mt-4 text-[22px] font-light leading-tight tracking-[-0.03em] text-slate-900">
              {t('Excluir modelo?')}
            </h4>
            <p className="mt-2 text-[13px] leading-[1.55] text-slate-500">{t('Essa ação não pode ser desfeita.')}</p>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setConfirmDelete(false)} className="btn-secondary flex-1 px-0">
                {t('Cancelar')}
              </button>
              <button type="button" onClick={() => { setConfirmDelete(false); onDelete(); }} className="btn-danger flex-1">
                {t('Excluir')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
