import { useState } from 'react';
import { Plus, Trash2, X, Check, Building2, MapPin, ChevronRight } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { createWorkplace, deleteWorkplace, createShiftTemplate, deleteShiftTemplate, getShiftTemplates } from '../lib/db';
import type { Workplace, WorkplaceType, PaymentMethod, ShiftType } from '../types';
import { WORKPLACE_TYPE_LABELS, WORKPLACE_COLORS } from '../types';
import { format } from 'date-fns';


function fmtCur(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

export default function LocaisScreen() {
  const { user, workplaces, shifts, refreshWorkplaces, refreshShifts } = useApp();
  const [view, setView] = useState<'list' | 'detail' | 'new' | 'newTemplate'>('list');
  const [selectedWp, setSelectedWp] = useState<Workplace | null>(null);


  // New workplace form
  const [form, setForm] = useState({
    name: '', type: 'hospital' as WorkplaceType, color: WORKPLACE_COLORS[0],
    default_shift_value: '', default_duration_hours: '12',
    payment_day: '10', payment_method: 'PJ' as PaymentMethod,
    contact_name: '', contact_phone: '', cnpj: '', address: '',
  });

  // New template form
  const [tForm, setTForm] = useState({
    name: '', start_time: '07:00', end_time: '19:00',
    default_value: '', shift_type: 'dia' as ShiftType, notes: '',
  });

  function calcDuration(start: string, end: string) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff <= 0) diff += 1440;
    return diff / 60;
  }

  function handleCreateWp() {
    if (!form.name.trim() || !user) return;
    createWorkplace({
      user_id: user.id,
      name: form.name.trim(),
      type: form.type,
      color: form.color,
      default_shift_value: parseFloat(form.default_shift_value) || 0,
      default_duration_hours: parseFloat(form.default_duration_hours) || 12,
      payment_day: parseInt(form.payment_day) || 10,
      payment_method: form.payment_method,
      contact_name: form.contact_name,
      contact_phone: form.contact_phone,
      cnpj: form.cnpj,
      address: form.address,
      active: true,
    });
    refreshWorkplaces();
    setView('list');
    setForm({ name:'', type:'hospital', color:WORKPLACE_COLORS[0], default_shift_value:'', default_duration_hours:'12', payment_day:'10', payment_method:'PJ', contact_name:'', contact_phone:'', cnpj:'', address:'' });
  }

  function handleDeleteWp(id: string) {
    if (!confirm('Excluir este local?')) return;
    deleteWorkplace(id);
    refreshWorkplaces();
    setView('list');
  }

  function handleCreateTemplate() {
    if (!tForm.name.trim() || !user || !selectedWp) return;
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
      <div className="page-content pb-[130px]">
        {/* Header */}
        <div className="px-5 pt-7 pb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button onClick={() => setView('detail')}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition">
                <X size={15} />
              </button>
              <div>
                <h1 className="font-bold text-[17px] text-slate-900">Novo Modelo</h1>
                <p className="text-[11px] text-slate-400 font-medium">{selectedWp.name}</p>
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: selectedWp.color }}>
              <span className="text-white text-[11px] font-bold">{selectedWp.name.slice(0, 2).toUpperCase()}</span>
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-xl" style={{ background: `${selectedWp.color}18` }}>
            <p className="text-[11px] font-medium" style={{ color: selectedWp.color }}>
              Salvo aqui para usar ao adicionar plantões rapidamente
            </p>
          </div>
        </div>

        <div className="px-5 space-y-5">
          {/* Modelo */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Modelo</p>
            <div className="bg-slate-50 rounded-[14px] overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white">
                <span className="text-[11px] text-slate-400 font-semibold w-14 flex-shrink-0">Nome</span>
                <input value={tForm.name}
                  onChange={e => setTForm(f => ({ ...f, name: e.target.value }))}
                  placeholder='Ex: "Noite 19h–7h"'
                  className="flex-1 bg-transparent text-sm text-slate-800 font-semibold outline-none" />
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="text-[11px] text-slate-400 font-semibold w-14 flex-shrink-0">Tipo</span>
                <select value={tForm.shift_type}
                  onChange={e => setTForm(f => ({ ...f, shift_type: e.target.value as ShiftType }))}
                  className="flex-1 bg-transparent text-sm text-slate-800 font-medium outline-none">
                  {(['dia','noite','24h','sobreaviso','sala_vermelha','UTI','anestesia','cirurgia','ambulatorio','outro'] as ShiftType[]).map(t => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Horário */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Horário</p>
            <div className="bg-slate-50 rounded-[14px] overflow-hidden">
              <div className="grid grid-cols-2">
                <div className="flex items-center gap-2 px-3 py-2.5 border-r border-white">
                  <div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Início</p>
                    <input type="time" value={tForm.start_time}
                      onChange={e => setTForm(f => ({ ...f, start_time: e.target.value }))}
                      className="bg-transparent text-sm text-slate-800 font-semibold outline-none w-full" />
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Fim</p>
                    <input type="time" value={tForm.end_time}
                      onChange={e => setTForm(f => ({ ...f, end_time: e.target.value }))}
                      className="bg-transparent text-sm text-slate-800 font-semibold outline-none w-full" />
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 px-1">
              Duração: <span className="font-semibold text-slate-600">{tDuration}h</span>
            </p>
          </div>

          {/* Valor */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Valor Padrão</p>
            <div className="bg-slate-50 rounded-[14px] flex items-center px-3 py-2.5">
              <span className="text-sm text-slate-400 mr-2 font-semibold">R$</span>
              <input type="number" value={tForm.default_value}
                onChange={e => setTForm(f => ({ ...f, default_value: e.target.value }))}
                placeholder={selectedWp.default_shift_value.toString()}
                className="flex-1 bg-transparent text-sm text-slate-800 font-semibold outline-none" />
            </div>
          </div>
        </div>

        <div className="fixed bottom-[61px] left-1/2 -translate-x-1/2 w-full max-w-[430px] px-5 pb-4 pt-4 bg-white border-t border-slate-100 z-[51]">
          <button onClick={handleCreateTemplate}
            disabled={!tForm.name.trim()}
            className="w-full py-3.5 rounded-[16px] text-white text-[15px] font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{
              background: tForm.name.trim() ? selectedWp.color : '#9ca3af',
              boxShadow: tForm.name.trim() ? `0 8px 20px ${selectedWp.color}40` : 'none',
            }}>
            <Check size={16} strokeWidth={2.5} />
            Salvar modelo
          </button>
        </div>
      </div>
    );
  }

  if (view === 'new') {
    return (
      <div className="page-content pb-[130px]">
        {/* Header */}
        <div className="px-5 pt-7 pb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button onClick={() => setView('list')}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition">
                <X size={15} />
              </button>
              <h1 className="font-bold text-[17px] text-slate-900">Novo Local</h1>
            </div>
            {/* Live color preview */}
            <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-all" style={{ background: form.color }}>
              <Building2 size={18} color="white" strokeWidth={2.2} />
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-blue-50">
            <p className="text-[11px] font-medium text-blue-500">Configure o hospital, UPA ou clínica onde você faz plantões</p>
          </div>
        </div>

        <div className="px-5 space-y-5">
          {/* Identificação */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Identificação</p>
            <div className="bg-slate-50 rounded-[14px] overflow-hidden mb-3">
              <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white">
                <span className="text-[11px] text-slate-400 font-semibold w-14 flex-shrink-0">Nome</span>
                <input value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Hospital São Marcos"
                  className="flex-1 bg-transparent text-sm text-slate-800 font-semibold outline-none" />
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="text-[11px] text-slate-400 font-semibold w-14 flex-shrink-0">Tipo</span>
                <select value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as WorkplaceType }))}
                  className="flex-1 bg-transparent text-sm text-slate-800 font-medium outline-none">
                  {Object.entries(WORKPLACE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">Cor de identificação</p>
            <div className="flex gap-3 flex-wrap">
              {WORKPLACE_COLORS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  className="w-9 h-9 rounded-full transition-all flex items-center justify-center"
                  style={{
                    background: c,
                    transform: form.color === c ? 'scale(1.2)' : 'scale(1)',
                    boxShadow: form.color === c ? `0 0 0 3px white, 0 0 0 5px ${c}` : 'none',
                  }}>
                  {form.color === c && <Check size={13} color="white" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>

          {/* Plantão Padrão */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Plantão Padrão</p>
            <div className="bg-slate-50 rounded-[14px] overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white">
                <span className="text-[11px] text-slate-400 font-semibold w-24 flex-shrink-0">Valor (R$)</span>
                <input type="number" value={form.default_shift_value}
                  onChange={e => setForm(f => ({ ...f, default_shift_value: e.target.value }))}
                  placeholder="1400"
                  className="flex-1 bg-transparent text-sm text-slate-800 font-semibold outline-none" />
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="text-[11px] text-slate-400 font-semibold w-24 flex-shrink-0">Duração (h)</span>
                <input type="number" value={form.default_duration_hours}
                  onChange={e => setForm(f => ({ ...f, default_duration_hours: e.target.value }))}
                  placeholder="12"
                  className="flex-1 bg-transparent text-sm text-slate-800 font-medium outline-none" />
              </div>
            </div>
          </div>

          {/* Pagamento */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Pagamento</p>
            <div className="bg-slate-50 rounded-[14px] overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white">
                <span className="text-[11px] text-slate-400 font-semibold w-24 flex-shrink-0">Dia do mês</span>
                <input type="number" value={form.payment_day}
                  onChange={e => setForm(f => ({ ...f, payment_day: e.target.value }))}
                  placeholder="10"
                  className="flex-1 bg-transparent text-sm text-slate-800 font-semibold outline-none" />
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white">
                <span className="text-[11px] text-slate-400 font-semibold w-24 flex-shrink-0">Método</span>
                <select value={form.payment_method}
                  onChange={e => setForm(f => ({ ...f, payment_method: e.target.value as PaymentMethod }))}
                  className="flex-1 bg-transparent text-sm text-slate-800 font-medium outline-none">
                  {(['PJ','PF','RPA','cooperativa','outro'] as PaymentMethod[]).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="text-[11px] text-slate-400 font-semibold w-24 flex-shrink-0">CNPJ/CPF</span>
                <input value={form.cnpj}
                  onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))}
                  placeholder="Opcional"
                  className="flex-1 bg-transparent text-sm text-slate-800 font-medium outline-none" />
              </div>
            </div>
          </div>

          {/* Contato */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contato</p>
              <span className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-semibold">opcional</span>
            </div>
            <div className="bg-slate-50 rounded-[14px] overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white">
                <span className="text-[11px] text-slate-400 font-semibold w-24 flex-shrink-0">Endereço</span>
                <input value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="Rua, Número, Cidade"
                  className="flex-1 bg-transparent text-sm text-slate-800 font-medium outline-none" />
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white">
                <span className="text-[11px] text-slate-400 font-semibold w-24 flex-shrink-0">Responsável</span>
                <input value={form.contact_name}
                  onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                  placeholder="Nome"
                  className="flex-1 bg-transparent text-sm text-slate-800 font-medium outline-none" />
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="text-[11px] text-slate-400 font-semibold w-24 flex-shrink-0">Telefone</span>
                <input value={form.contact_phone}
                  onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                  placeholder="(00) 00000-0000"
                  className="flex-1 bg-transparent text-sm text-slate-800 font-medium outline-none" />
              </div>
            </div>
          </div>
        </div>

        <div className="fixed bottom-[61px] left-1/2 -translate-x-1/2 w-full max-w-[430px] px-5 pb-4 pt-4 bg-white border-t border-slate-100 z-[51]">
          <button onClick={handleCreateWp}
            disabled={!form.name.trim()}
            className="w-full py-3.5 rounded-[16px] text-white text-[15px] font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{
              background: form.name.trim() ? form.color : '#9ca3af',
              boxShadow: form.name.trim() ? `0 8px 20px ${form.color}40` : 'none',
            }}>
            <Check size={16} strokeWidth={2.5} />
            Salvar local
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
      <div className="page-content">
        <div className="pt-14">
          <div className="px-5 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setView('list')} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} /></button>
            </div>
            <div className="flex items-center gap-4 mb-4">
              <div className="hospital-avatar w-16 h-16 text-xl rounded-2xl" style={{ background: selectedWp.color, width: 64, height: 64, fontSize: 22, borderRadius: 18 }}>
                {selectedWp.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h1 className="font-bold text-2xl text-gray-900">{selectedWp.name}</h1>
                <p className="text-gray-400 text-sm mb-1">{WORKPLACE_TYPE_LABELS[selectedWp.type]} · Pagamento Dia {selectedWp.payment_day} · {selectedWp.payment_method}</p>
                {selectedWp.address && <p className="text-gray-400 text-xs truncate max-w-[250px]">📍 {selectedWp.address}</p>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="card border border-gray-50 text-center">
                <p className="text-xs text-gray-400 mb-1">Padrão</p>
                <p className="font-bold text-gray-900 text-sm">{fmtCur(selectedWp.default_shift_value)}</p>
              </div>
              <div className="card border border-gray-50 text-center">
                <p className="text-xs text-gray-400 mb-1">Total</p>
                <p className="font-bold text-gray-900 text-sm">{fmtCur(totalExpected)}</p>
              </div>
              <div className="card border border-gray-50 text-center">
                <p className="text-xs text-gray-400 mb-1">Recebido</p>
                <p className="font-bold text-green-600 text-sm">{fmtCur(totalReceived)}</p>
              </div>
            </div>
          </div>

          {/* Templates */}
          <div className="px-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Modelos de Plantão</h3>
              <button onClick={() => setView('newTemplate')} className="text-blue-600 text-sm font-medium flex items-center gap-1">
                <Plus size={14} /> Novo
              </button>
            </div>
            {templates.length === 0 ? (
              <div className="card border border-dashed border-gray-200 text-center py-6">
                <p className="text-gray-400 text-sm mb-2">Nenhum modelo criado</p>
                <button onClick={() => setView('newTemplate')} className="text-blue-600 text-sm font-medium">Criar modelo</button>
              </div>
            ) : (
              <div className="space-y-2">
                {templates.map(t => (
                  <div key={t.id} className="card border border-gray-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white" style={{ background: selectedWp.color }}>
                        {t.shift_type.slice(0,2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{t.name}</p>
                        <p className="text-xs text-gray-400">{t.start_time}–{t.end_time} · {t.duration_hours}h · {fmtCur(t.default_value)}</p>
                      </div>
                    </div>
                    <button onClick={() => { if(confirm('Excluir modelo?')) { deleteShiftTemplate(t.id); refreshWorkplaces(); } }}
                      className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Trash2 size={13} className="text-gray-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent shifts */}
          <div className="px-5 mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Histórico de Plantões</h3>
            {wpShifts.length === 0 ? (
              <div className="card border border-gray-50 text-center py-6 text-gray-400 text-sm">Nenhum plantão registrado</div>
            ) : (
              <div className="space-y-2">
                {wpShifts.slice(0, 8).map(s => (
                  <div key={s.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{format(new Date(s.date), 'dd/MM/yyyy')}</p>
                      <p className="text-xs text-gray-400">{format(new Date(s.start_datetime), 'HH:mm')}–{format(new Date(s.end_datetime), 'HH:mm')} · {s.duration_hours}h</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900 text-sm">{fmtCur(s.expected_value)}</p>
                      <span className={`status-badge status-${s.status}`} style={{ fontSize: 9 }}>{s.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-5 pb-6">
            <button onClick={() => handleDeleteWp(selectedWp.id)}
              className="w-full py-3 rounded-xl bg-red-50 text-red-600 font-semibold text-sm flex items-center justify-center gap-2">
              <Trash2 size={16} /> Excluir local
            </button>
          </div>
        </div>
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
            <h1 className="text-[20px] font-black text-slate-900 tracking-tight leading-tight">Locais de Plantão</h1>
            <p className="text-[12px] text-slate-500 mt-0.5">{workplaces.length} {workplaces.length !== 1 ? 'locais cadastrados' : 'local cadastrado'}.</p>
          </div>
          <button onClick={() => setView('new')}
            className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-all active:scale-95 shrink-0 ml-3"
            title="Novo local">
            <Plus size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <div className="px-5 space-y-2">
        {workplaces.length === 0 ? (
          <div className="bg-white rounded-2xl text-center py-8 border border-dashed border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-2.5">
              <Building2 size={22} className="text-blue-500" />
            </div>
            <p className="font-semibold text-slate-900 text-sm mb-1">Nenhum local cadastrado</p>
            <p className="text-slate-500 text-[12px] mb-3 px-6">Adicione hospitais, UPAs e clínicas onde você faz plantões.</p>
            <button onClick={() => setView('new')} className="bg-blue-600 text-white text-[12px] font-bold px-4 py-2 rounded-lg active:scale-95 transition">
              Adicionar primeiro local
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
                        <span>Pag. dia {wp.payment_day} · {wp.payment_method}</span>
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
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Padrão</p>
                      <p className="font-bold text-slate-900 text-[12px] tracking-tight">{fmtCur(wp.default_shift_value)}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Plant./mês</p>
                      <p className="font-bold text-blue-600 text-[12px]">{stats.count}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total</p>
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
    </div>
  );
}
