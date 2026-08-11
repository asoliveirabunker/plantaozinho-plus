import { useState, useEffect } from 'react';
import { Plus, Trash2, X, Check, Building2, MapPin, ChevronRight, ChevronLeft, Pencil, HelpCircle, Zap, Sparkles, Palette, DollarSign, Wallet, Phone, Clock, Tag } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { createWorkplace, deleteWorkplace, createShiftTemplate, deleteShiftTemplate, getShiftTemplates, updateWorkplace, updateShiftTemplate } from '../lib/db';
import type { Workplace, WorkplaceType, PaymentMethod, ShiftType, ShiftTemplate, FiscalNature } from '../types';
import { WORKPLACE_TYPE_LABELS, WORKPLACE_COLORS, FISCAL_NATURE_LABELS, FISCAL_NATURE_ORDER, STATUS_LABELS } from '../types';
import { format } from 'date-fns';
import { useLanguage } from '../hooks/useLanguage';
import { usePlan } from '../contexts/PlanContext';
import { PLAN_META } from '../lib/plans';


function fmtCur(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

interface LocaisScreenProps {
  /** Quando true, abre direto no formulário de novo local (ex.: vindo do aviso do AddShiftModal). */
  autoOpenNew?: boolean;
  /** Chamado após consumir o autoOpenNew, para o pai resetar a flag. */
  onAutoOpenNewHandled?: () => void;
}

export default function LocaisScreen({ autoOpenNew, onAutoOpenNewHandled }: LocaisScreenProps = {}) {
  const { user, workplaces, shifts, refreshWorkplaces, refreshShifts } = useApp();
  const { t } = useLanguage();
  const { limits, requireUpgrade, plan } = usePlan();
  const [showHelp, setShowHelp] = useState(false);

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

  function calcDuration(start: string, end: string) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff <= 0) diff += 1440;
    return diff / 60;
  }

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

  function handleDeleteWp(id: string) {
    if (!confirm('Excluir este local?')) return;
    deleteWorkplace(id);
    refreshWorkplaces();
    setView('list');
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
    const shiftTypes: ShiftType[] = ['dia', 'noite', '24h', 'sobreaviso', 'sala_vermelha', 'UTI', 'anestesia', 'cirurgia', 'ambulatorio', 'outro'];
    const typeLabel = (ty: string) => ty.charAt(0).toUpperCase() + ty.slice(1).replace('_', ' ');
    return (
      <div className="page-content bg-white min-h-screen pb-[150px]">
        {/* Header — padrão do "Editar plantão" */}
        <div className="px-5 pt-7 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="hospital-avatar shrink-0" style={{ background: selectedWp.color }}>
                {selectedWp.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 truncate">{selectedWp.name}</p>
                <h1 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight">Novo modelo</h1>
                <p className="text-[12px] text-slate-500 mt-0.5">Salve horário e valor para lançar em 1 toque.</p>
              </div>
            </div>
            <button onClick={() => setView('detail')}
              className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all active:scale-95 shrink-0 ml-3">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-5 space-y-4">
          {/* Identificação */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Tag size={11} strokeWidth={2.5} /> Modelo
            </label>
            <div>
              <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Nome do modelo</p>
              <input value={tForm.name}
                onChange={e => { setTForm(f => ({ ...f, name: e.target.value })); if (tFormError) setTFormError(''); }}
                placeholder='Ex: "Noite 19h–7h"'
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
            </div>
            <div className="mt-2">
              <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Tipo de escala</p>
              <div className="flex flex-wrap gap-1.5">
                {shiftTypes.map(ty => {
                  const active = tForm.shift_type === ty;
                  return (
                    <button key={ty} type="button"
                      onClick={() => setTForm(f => ({ ...f, shift_type: ty }))}
                      className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide transition-all active:scale-95 ${
                        active ? 'text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:opacity-80'
                      }`}
                      style={active ? { background: selectedWp.color } : undefined}>
                      {typeLabel(ty)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Horário */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Clock size={11} strokeWidth={2.5} /> Horário
            </label>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Início</p>
                <input type="time" value={tForm.start_time}
                  onChange={e => setTForm(f => ({ ...f, start_time: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              </div>
              <span className="pb-3 text-slate-400 text-[11px] font-medium">até</span>
              <div className="flex-1">
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Fim</p>
                <input type="time" value={tForm.end_time}
                  onChange={e => setTForm(f => ({ ...f, end_time: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 px-1">
              Duração: <span className="font-semibold text-slate-600">{tDuration}h</span>
            </p>
          </div>

          {/* Valor padrão */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <DollarSign size={11} strokeWidth={2.5} /> Valor padrão (R$)
            </label>
            <input type="number" inputMode="decimal" step="50" value={tForm.default_value}
              onChange={e => setTForm(f => ({ ...f, default_value: e.target.value }))}
              placeholder={selectedWp.default_shift_value.toString()}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
          </div>

          {tFormError && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {tFormError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="fixed bottom-[61px] left-1/2 -translate-x-1/2 w-full max-w-[430px] px-5 pb-4 pt-3 bg-white border-t border-slate-100 z-[51] flex gap-2">
          <button onClick={() => setView('detail')}
            className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold hover:bg-slate-200 transition active:scale-[0.98]">
            Cancelar
          </button>
          <button onClick={handleCreateTemplate}
            disabled={!tForm.name.trim()}
            className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold transition active:scale-[0.98] shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
            style={{ background: selectedWp.color, boxShadow: `0 4px 12px ${selectedWp.color}40` }}>
            <Check size={14} strokeWidth={3} /> Salvar modelo
          </button>
        </div>
      </div>
    );
  }

  if (view === 'new') {
    return (
      <div className="page-content bg-white min-h-screen pb-[150px]">
        {/* Header — mesmo padrão do "Editar plantão": avatar + pretitle + título black */}
        <div className="px-5 pt-7 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="hospital-avatar shrink-0 transition-all duration-300" style={{ background: form.color }}>
                {form.name.trim()
                  ? form.name.trim().slice(0, 2).toUpperCase()
                  : <Building2 size={17} color="white" strokeWidth={2.2} />}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{t('Locais de Plantão')}</p>
                <h1 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight">Novo local</h1>
                <p className="text-[12px] text-slate-500 mt-0.5">Hospital, UPA ou clínica onde você atende.</p>
              </div>
            </div>
            <button onClick={() => setView('list')}
              className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all active:scale-95 shrink-0 ml-3">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-5 space-y-4">
          {/* Identificação */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Building2 size={11} strokeWidth={2.5} /> Identificação
            </label>
            <div className="space-y-2">
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Nome do local</p>
                <input value={form.name}
                  onChange={e => { setForm(f => ({ ...f, name: e.target.value })); if (formError) setFormError(''); }}
                  placeholder="Hospital São Marcos"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Tipo</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(WORKPLACE_TYPE_LABELS).map(([k, v]) => {
                    const active = form.type === k;
                    return (
                      <button key={k} type="button"
                        onClick={() => setForm(f => ({ ...f, type: k as WorkplaceType }))}
                        className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide transition-all active:scale-95 ${
                          active ? 'text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:opacity-80'
                        }`}
                        style={active ? { background: form.color } : undefined}>
                        {v}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Cor de identificação */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Palette size={11} strokeWidth={2.5} /> Cor de identificação
            </label>
            <div className="flex gap-2.5 flex-wrap">
              {WORKPLACE_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                  className="w-8 h-8 rounded-full transition-all flex items-center justify-center"
                  style={{
                    background: c,
                    transform: form.color === c ? 'scale(1.15)' : 'scale(1)',
                    boxShadow: form.color === c ? `0 0 0 2.5px white, 0 0 0 4.5px ${c}` : 'none',
                  }}>
                  {form.color === c && <Check size={12} color="white" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>

          {/* Plantão padrão */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <DollarSign size={11} strokeWidth={2.5} /> Plantão padrão
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Valor (R$)</p>
                <input type="number" inputMode="decimal" step="50" value={form.default_shift_value}
                  onChange={e => setForm(f => ({ ...f, default_shift_value: e.target.value }))}
                  placeholder="1400"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Duração (h)</p>
                <input type="number" inputMode="decimal" step="0.5" value={form.default_duration_hours}
                  onChange={e => setForm(f => ({ ...f, default_duration_hours: e.target.value }))}
                  placeholder="12"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              </div>
            </div>
          </div>

          {/* Pagamento */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Wallet size={11} strokeWidth={2.5} /> Pagamento
            </label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Dia do mês</p>
                <input type="number" inputMode="numeric" min="1" max="31" value={form.payment_day}
                  onChange={e => setForm(f => ({ ...f, payment_day: e.target.value }))}
                  placeholder="10"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Método</p>
                <select value={form.payment_method}
                  onChange={e => setForm(f => ({ ...f, payment_method: e.target.value as PaymentMethod }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition">
                  {(['PJ','PF','RPA','cooperativa','outro'] as PaymentMethod[]).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Forma de recebimento (relatório do contador)</p>
                <select value={form.fiscal_nature}
                  onChange={e => setForm(f => ({ ...f, fiscal_nature: e.target.value as FiscalNature }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition">
                  {FISCAL_NATURE_ORDER.map(n => <option key={n} value={n}>{FISCAL_NATURE_LABELS[n]}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">CNPJ/CPF da fonte pagadora</p>
                <input value={form.cnpj}
                  onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))}
                  placeholder="Opcional"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              </div>
            </div>
          </div>

          {/* Contato (opcional) */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Phone size={11} strokeWidth={2.5} /> Contato
              <span className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-semibold normal-case tracking-normal">opcional</span>
            </label>
            <div className="space-y-2">
              <input value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Endereço (rua, número, cidade)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              <div className="grid grid-cols-2 gap-2">
                <input value={form.contact_name}
                  onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                  placeholder="Responsável"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
                <input value={form.contact_phone}
                  onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                  placeholder="(00) 00000-0000"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              </div>
            </div>
          </div>

          {formError && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}
        </div>

        {/* Footer — CTA no padrão do "Editar plantão" */}
        <div className="fixed bottom-[61px] left-1/2 -translate-x-1/2 w-full max-w-[430px] px-5 pb-4 pt-3 bg-white border-t border-slate-100 z-[51] flex gap-2">
          <button onClick={() => setView('list')}
            className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold hover:bg-slate-200 transition active:scale-[0.98]">
            Cancelar
          </button>
          <button onClick={handleCreateWp}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-[13px] font-bold hover:bg-blue-700 transition active:scale-[0.98] shadow-sm shadow-blue-600/20 flex items-center justify-center gap-1.5 disabled:opacity-50"
            disabled={!form.name.trim()}>
            <Check size={14} strokeWidth={3} /> Salvar local
          </button>
        </div>
      </div>
    );
  }

  if (view === 'detail' && selectedWp) {
    const templates = user ? getShiftTemplates(user.id, selectedWp.id) : [];
    const wpShifts = shifts.filter(s => s.workplace_id === selectedWp.id);
    const totalExpected = wpShifts.filter(s => s.status !== 'cancelado').reduce((a, s) => a + s.expected_value, 0);
    const totalReceived = wpShifts.filter(s => s.status === 'recebido').reduce((a, s) => a + (s.received_value || s.expected_value), 0);

    return (
      <div className="page-content bg-white min-h-screen">
        {/* Header — botão voltar + editar local */}
        <div className="px-5 pt-7 pb-3 flex items-center justify-between">
          <button onClick={() => setView('list')}
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all active:scale-95">
            <ChevronLeft size={18} strokeWidth={2.5} />
          </button>
          <button onClick={() => setEditWpSheet(selectedWp)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 text-[12px] font-bold hover:bg-blue-100 transition active:scale-95">
            <Pencil size={12} strokeWidth={2.5} /> Editar local
          </button>
        </div>

        {/* Identidade */}
        <div className="px-5">
          <div className="flex items-center gap-3.5 mb-4">
            <div className="hospital-avatar shrink-0" style={{ background: selectedWp.color, width: 60, height: 60, fontSize: 20, borderRadius: 18 }}>
              {selectedWp.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <h1 className="font-black text-[22px] text-slate-900 tracking-tight leading-tight truncate">{selectedWp.name}</h1>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">{WORKPLACE_TYPE_LABELS[selectedWp.type]}</span>
              </div>
              <p className="text-slate-500 text-[12px]">Pag. dia {selectedWp.payment_day} · {selectedWp.payment_method}</p>
              {selectedWp.address && (
                <p className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5 truncate">
                  <MapPin size={10} className="shrink-0" /> <span className="truncate">{selectedWp.address}</span>
                </p>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            <div className="bg-slate-50 rounded-2xl border border-slate-100 px-3 py-3 text-center">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Padrão</p>
              <p className="font-black text-slate-900 text-[14px] tracking-tight">{fmtCur(selectedWp.default_shift_value)}</p>
            </div>
            <div className="bg-slate-50 rounded-2xl border border-slate-100 px-3 py-3 text-center">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total</p>
              <p className="font-black text-slate-900 text-[14px] tracking-tight">{fmtCur(totalExpected)}</p>
            </div>
            <div className="bg-slate-50 rounded-2xl border border-slate-100 px-3 py-3 text-center">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Recebido</p>
              <p className="font-black text-emerald-600 text-[14px] tracking-tight">{fmtCur(totalReceived)}</p>
            </div>
          </div>
        </div>

        {/* Modelos de Plantão */}
        <div className="px-5 mb-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Modelos de plantão</h3>
            <button onClick={() => setView('newTemplate')}
              className="flex items-center gap-1 text-[12px] font-bold text-blue-600 hover:text-blue-700 transition active:scale-95">
              <Plus size={13} strokeWidth={2.5} /> Novo
            </button>
          </div>
          {templates.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 text-center py-6 px-4">
              <p className="text-slate-500 text-[12px] mb-2">Nenhum modelo criado ainda.</p>
              <button onClick={() => setView('newTemplate')}
                className="text-[12px] font-bold text-blue-600 hover:text-blue-700 transition">Criar primeiro modelo</button>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map(t => (
                <div key={t.id} onClick={() => setEditTemplateSheet(t)}
                  className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.03)] p-2.5 flex items-center justify-between gap-2 cursor-pointer hover:border-slate-200 active:scale-[0.99] transition">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: selectedWp.color }}>
                      {t.shift_type.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 text-[13px] truncate leading-tight">{t.name}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{t.start_time}–{t.end_time} · {t.duration_hours}h · {fmtCur(t.default_value)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={e => { e.stopPropagation(); setEditTemplateSheet(t); }}
                      className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition active:scale-95"
                      title="Editar modelo">
                      <Pencil size={12} strokeWidth={2.5} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); if (confirm('Excluir modelo?')) { deleteShiftTemplate(t.id); refreshWorkplaces(); } }}
                      className="w-7 h-7 rounded-full bg-slate-100 hover:bg-red-50 flex items-center justify-center transition active:scale-95"
                      title="Excluir modelo">
                      <Trash2 size={13} className="text-slate-400 hover:text-red-500 transition" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Histórico de Plantões */}
        <div className="px-5 mb-5">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Histórico de plantões</h3>
          {wpShifts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 text-center py-6 text-slate-400 text-[12px]">Nenhum plantão registrado</div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.03)] px-3 divide-y divide-slate-50">
              {wpShifts.slice(0, 8).map(s => (
                <div key={s.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-[13px] font-bold text-slate-800 leading-tight">{format(new Date(s.date), 'dd/MM/yyyy')}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{format(new Date(s.start_datetime), 'HH:mm')}–{format(new Date(s.end_datetime), 'HH:mm')} · {s.duration_hours}h</p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <p className="font-bold text-slate-900 text-[13px] tracking-tight">{fmtCur(s.expected_value)}</p>
                    <span className={`status-badge status-${s.status}`} style={{ fontSize: 9 }}>{STATUS_LABELS[s.status]}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Zona de perigo */}
        <div className="px-5 pb-8">
          <button onClick={() => handleDeleteWp(selectedWp.id)}
            className="w-full py-3 rounded-2xl bg-white border border-red-100 text-red-600 text-[13px] font-bold flex items-center justify-center gap-2 hover:bg-red-50 transition active:scale-[0.98]">
            <Trash2 size={15} strokeWidth={2.5} /> Excluir local
          </button>
        </div>

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
      </div>
    );
  }

  // LIST
  return (
    <div className="page-content bg-white min-h-screen">
      <div className="px-5 pt-7 pb-2 bg-white">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Cadastro</p>
            <h1 className="text-[20px] font-black text-slate-900 tracking-tight leading-tight">{t('Locais de Plantão')}</h1>
            <p className="text-[12px] text-slate-500 mt-0.5">{workplaces.length} {workplaces.length !== 1 ? t('locais cadastrados') : t('local cadastrado')}.</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-3">
            <button onClick={() => setShowHelp(true)}
              className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition-all active:scale-95"
              title="Como usar">
              <HelpCircle size={16} strokeWidth={2.5} />
            </button>
            <button onClick={handleNewWorkplace}
              className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-all active:scale-95"
              title="Novo local">
              <Plus size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 space-y-2">
        {workplaces.length === 0 ? (
          <div className="bg-white rounded-2xl text-center py-8 border border-dashed border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-2.5">
              <Building2 size={22} className="text-blue-500" />
            </div>
            <p className="font-semibold text-slate-900 text-sm mb-1">{t('Nenhum local cadastrado')}</p>
            <p className="text-slate-500 text-[12px] mb-3 px-6">{t('Adicione hospitais, UPAs e clínicas onde você faz plantões.')}</p>
            <button onClick={handleNewWorkplace} className="bg-blue-600 text-white text-[12px] font-bold px-4 py-2 rounded-lg active:scale-95 transition">
              {t('Adicionar primeiro local')}
            </button>
          </div>
        ) : (
          workplaces.map(wp => {
            const stats = getWpStats(wp);
            return (
              <div key={wp.id} onClick={() => { setSelectedWp(wp); setView('detail'); }}
                className="w-full bg-white rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.03)] text-left transition-all active:scale-[0.99] overflow-hidden relative cursor-pointer">
                {/* Top color stripe — distintivo de local */}
                <div className="h-1 w-full" style={{ background: wp.color }} />
                <div className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${wp.color}18`, color: wp.color }}>
                      <Building2 size={20} strokeWidth={2.2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-slate-900 text-[14px] leading-tight truncate">{wp.name}</p>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">{WORKPLACE_TYPE_LABELS[wp.type]}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                        <span>{t('Pag. dia')} {wp.payment_day} · {wp.payment_method}</span>
                      </div>
                      {wp.address && (
                        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-400 truncate">
                          <MapPin size={10} />
                          <span className="truncate">{wp.address}</span>
                        </div>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-slate-300 shrink-0" />
                  </div>
                  <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-slate-50">
                    <div className="flex-1">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t('Padrão')}</p>
                      <p className="font-bold text-slate-900 text-[12px] tracking-tight">{fmtCur(wp.default_shift_value)}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t('Plant./mês')}</p>
                      <p className="font-bold text-blue-600 text-[12px]">{stats.count}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t('Total')}</p>
                      <p className="font-bold text-slate-900 text-[12px] tracking-tight">{fmtCur(stats.total)}</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); handleDeleteWp(wp.id); }}
                      className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-red-50 flex items-center justify-center transition shrink-0">
                      <Trash2 size={13} className="text-slate-400 hover:text-red-500 transition" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ============================================================ */}
      {/* DRILLDOWN: COMO USAR + UPSELL PRO                            */}
      {/* ============================================================ */}
      {showHelp && (
        <div className="bottom-sheet-overlay" onClick={() => setShowHelp(false)}>
          <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />

            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
                  <Building2 size={20} className="text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Locais de Plantão</p>
                  <h3 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight">Como usar</h3>
                </div>
              </div>
              <button onClick={() => setShowHelp(false)}
                className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all active:scale-95 shrink-0 ml-3">
                <X size={16} />
              </button>
            </div>

            {/* Passos de uso */}
            <div className="space-y-2.5 mb-4">
              {[
                { n: '1', title: 'Cadastre seu local', desc: 'Hospital, UPA ou clínica — com cor, valor padrão e dia de pagamento.' },
                { n: '2', title: 'Crie modelos de plantão', desc: 'Salve horários e valores recorrentes para lançar plantões em 1 toque.' },
                { n: '3', title: 'Acompanhe por local', desc: 'Veja quantos plantões e quanto faturou em cada lugar no mês.' },
              ].map(step => (
                <div key={step.n} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 text-[11px] font-bold">
                    {step.n}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-slate-900 leading-tight">{step.title}</p>
                    <p className="text-[12px] text-slate-500 leading-snug mt-0.5">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Aviso explícito: Pro permite múltiplos locais */}
            {plan === 'free' && (
              <div className="rounded-2xl p-4 mb-3" style={{ background: PLAN_META.pro.gradient }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                    <Zap size={15} className="text-white" strokeWidth={2.5} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/80 leading-none mb-0.5">Plano Pro</p>
                    <p className="text-[15px] font-black text-white leading-none">Mais de um local</p>
                  </div>
                </div>
                <p className="text-[12.5px] text-white/90 leading-snug mb-3">
                  No plano <strong>Free</strong> você cadastra <strong>1 local</strong>. Com o <strong>Pro</strong>, cadastre
                  hospitais, UPAs e clínicas <strong>ilimitados</strong> e gerencie toda a sua escala em um só lugar.
                </p>
                <button
                  onClick={() => { setShowHelp(false); requireUpgrade('unlimited_workplaces'); }}
                  className="w-full py-2.5 rounded-xl bg-white text-[13px] font-bold transition active:scale-[0.98] flex items-center justify-center gap-1.5"
                  style={{ color: PLAN_META.pro.color }}
                >
                  <Sparkles size={14} strokeWidth={2.5} />
                  Conhecer o Plano Pro
                </button>
              </div>
            )}

            <button onClick={() => setShowHelp(false)}
              className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-600 text-[13px] font-semibold hover:bg-slate-200 transition active:scale-[0.98]">
              Entendi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// BOTTOM SHEET: EDITAR LOCAL
// ============================================================
function EditWorkplaceSheet({ workplace, onClose, onSaved }: {
  workplace: Workplace;
  onClose: () => void;
  onSaved: (updated: Workplace) => void;
}) {
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
    <div className="bottom-sheet-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-white text-[13px]"
              style={{ background: color }}>
              {name.slice(0, 2).toUpperCase() || '??'}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Editar local</p>
              <h3 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight truncate">{name || 'Local'}</h3>
              <p className="text-[12px] text-slate-500 mt-0.5">{WORKPLACE_TYPE_LABELS[type]}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all active:scale-95 shrink-0 ml-3">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto hide-scrollbar -mx-1 px-1">
          {/* Identificação */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Identificação</label>
            <div className="space-y-2">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do local"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              <select value={type} onChange={e => setType(e.target.value as WorkplaceType)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition">
                {Object.entries(WORKPLACE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          {/* Cor */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Cor de identificação</label>
            <div className="flex gap-2.5 flex-wrap">
              {WORKPLACE_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-full transition-all flex items-center justify-center"
                  style={{
                    background: c,
                    transform: color === c ? 'scale(1.15)' : 'scale(1)',
                    boxShadow: color === c ? `0 0 0 2.5px white, 0 0 0 4.5px ${c}` : 'none',
                  }}>
                  {color === c && <Check size={12} color="white" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>

          {/* Plantão padrão */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Plantão padrão</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Valor (R$)</p>
                <input type="number" inputMode="decimal" step="0.01" value={defaultValue}
                  onChange={e => setDefaultValue(e.target.value)} placeholder="1400"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Duração (h)</p>
                <input type="number" inputMode="decimal" step="0.5" value={defaultDuration}
                  onChange={e => setDefaultDuration(e.target.value)} placeholder="12"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              </div>
            </div>
          </div>

          {/* Pagamento */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Pagamento</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Dia do mês</p>
                <input type="number" inputMode="numeric" min="1" max="31" value={paymentDay}
                  onChange={e => setPaymentDay(e.target.value)} placeholder="10"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Método</p>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition">
                  {(['PJ', 'PF', 'RPA', 'cooperativa', 'outro'] as PaymentMethod[]).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-2">
              <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Forma de recebimento (relatório do contador)</p>
              <select value={fiscalNature} onChange={e => setFiscalNature(e.target.value as FiscalNature)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition">
                {FISCAL_NATURE_ORDER.map(n => <option key={n} value={n}>{FISCAL_NATURE_LABELS[n]}</option>)}
              </select>
            </div>
            <input value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="CNPJ/CPF (opcional)"
              className="w-full mt-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
          </div>

          {/* Contato */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Contato (opcional)</label>
            <div className="space-y-2">
              <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Endereço"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              <div className="grid grid-cols-2 gap-2">
                <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Responsável"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
                <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="Telefone"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              </div>
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Observações</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Notas internas sobre este local..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition resize-none" />
          </div>

          {error && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        <div className="flex gap-2 pt-3 mt-2 border-t border-slate-100">
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold hover:bg-slate-200 transition active:scale-[0.98]">
            Cancelar
          </button>
          <button onClick={handleSave}
            className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold transition active:scale-[0.98] shadow-sm flex items-center justify-center gap-1.5"
            style={{ background: color, boxShadow: `0 4px 12px ${color}40` }}>
            <Check size={14} strokeWidth={3} /> Salvar alterações
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// BOTTOM SHEET: EDITAR MODELO DE PLANTÃO
// ============================================================
function EditTemplateSheet({ template, workplaceColor, onClose, onSaved, onDelete }: {
  template: ShiftTemplate;
  workplaceColor: string;
  onClose: () => void;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [shiftType, setShiftType] = useState<ShiftType>(template.shift_type);
  const [startTime, setStartTime] = useState(template.start_time);
  const [endTime, setEndTime] = useState(template.end_time);
  const [defaultValue, setDefaultValue] = useState(String(template.default_value));
  const [notes, setNotes] = useState(template.notes || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  function calcDuration(s: string, e: string) {
    const [sh, sm] = s.split(':').map(Number);
    const [eh, em] = e.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff <= 0) diff += 1440;
    return diff / 60;
  }

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
    <div className="bottom-sheet-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />

        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-white text-[12px]"
              style={{ background: workplaceColor }}>
              {shiftType.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Editar modelo</p>
              <h3 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight truncate">{name || 'Modelo'}</h3>
              <p className="text-[12px] text-slate-500 mt-0.5">{startTime}–{endTime} · {duration}h</p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all active:scale-95 shrink-0 ml-3">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Identificação */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Identificação</label>
            <div className="space-y-2">
              <input value={name} onChange={e => setName(e.target.value)} placeholder='Ex: "Noite 19h–7h"'
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              <select value={shiftType} onChange={e => setShiftType(e.target.value as ShiftType)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition">
                {(['dia', 'noite', '24h', 'sobreaviso', 'sala_vermelha', 'UTI', 'anestesia', 'cirurgia', 'ambulatorio', 'outro'] as ShiftType[]).map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Horário */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Horário</label>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Início</p>
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              </div>
              <span className="pb-3 text-slate-400 text-[11px] font-medium">até</span>
              <div className="flex-1">
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5">Fim</p>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 px-1">
              Duração: <span className="font-semibold text-slate-600">{duration}h</span>
            </p>
          </div>

          {/* Valor */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Valor padrão (R$)</label>
            <input type="number" inputMode="decimal" step="0.01" value={defaultValue}
              onChange={e => setDefaultValue(e.target.value)} placeholder="1400"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
          </div>

          {/* Observações */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Observações</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Anotações sobre este modelo..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition resize-none" />
          </div>

          {error && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-red-50 text-red-600 text-[12.5px] font-semibold hover:bg-red-100 transition active:scale-[0.98]">
              <Trash2 size={13} strokeWidth={2.5} /> Excluir
            </button>
            <button onClick={handleSave}
              className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold transition active:scale-[0.98] shadow-sm flex items-center justify-center gap-1.5"
              style={{ background: workplaceColor, boxShadow: `0 4px 12px ${workplaceColor}40` }}>
              <Check size={14} strokeWidth={3} /> Salvar alterações
            </button>
          </div>
        </div>

        {confirmDelete && (
          <div className="fixed inset-0 z-[400] bg-slate-900/50 flex items-center justify-center p-4" onClick={() => setConfirmDelete(false)}>
            <div className="bg-white w-full max-w-xs rounded-2xl p-5 shadow-xl animate-fade-in" onClick={e => e.stopPropagation()}>
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <h4 className="text-center font-bold text-slate-900 text-[15px] mb-1">Excluir modelo?</h4>
              <p className="text-center text-slate-500 text-[12px] mb-4">Essa ação não pode ser desfeita.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold hover:bg-slate-200 transition active:scale-[0.98]">
                  Cancelar
                </button>
                <button onClick={() => { setConfirmDelete(false); onDelete(); }}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-[13px] font-bold hover:bg-red-700 transition active:scale-[0.98]">
                  Excluir
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
