import { useState } from 'react';
import { ArrowLeft, Check, User as UserIcon, Briefcase, LogOut, Calculator } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { PROFILE_TYPE_LABELS, type ProfileType } from '../types';

interface ProfileScreenProps {
  onClose: () => void;
  onSaved?: () => void;
}

export default function ProfileScreen({ onClose, onSaved }: ProfileScreenProps) {
  const { user, updateProfile, logout } = useApp();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [specialty, setSpecialty] = useState(user?.specialty || '');
  const [profileType, setProfileType] = useState<ProfileType>(user?.profile_type || 'plantonista');
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp || '');
  const [taxRegime, setTaxRegime] = useState(user?.tax_regime || 'Simples Nacional');
  const [taxRate, setTaxRate] = useState(String(user?.tax_rate ?? 6));
  const [companyName, setCompanyName] = useState(user?.company_name || '');
  const [cnpj, setCnpj] = useState(user?.cnpj || '');
  const [error, setError] = useState('');

  function handleSave() {
    setError('');
    if (!name.trim()) { setError('Informe seu nome.'); return; }
    if (!email.trim()) { setError('Informe seu e-mail.'); return; }

    const rate = parseFloat(taxRate.replace(',', '.'));

    updateProfile({
      name: name.trim(),
      email: email.trim(),
      specialty: specialty.trim(),
      profile_type: profileType,
      whatsapp: whatsapp.trim() || undefined,
      tax_regime: taxRegime as any,
      tax_rate: isNaN(rate) ? undefined : rate,
      company_name: companyName.trim() || undefined,
      cnpj: cnpj.trim() || undefined,
    });
    onSaved?.();
    onClose();
  }

  function handleLogout() {
    if (confirm('Deseja sair da sua conta?')) logout();
  }

  const initials = user?.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'U';

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col animate-fade-in">
      {/* Header */}
      <header className="px-5 pt-7 pb-3 bg-white border-b border-slate-100 shrink-0">
        <div className="flex items-center justify-between">
          <button onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-all active:scale-95"
            title="Voltar"
          >
            <ArrowLeft size={16} strokeWidth={2.5} />
          </button>
          <div className="text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Conta</p>
            <h1 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight">Perfil</h1>
          </div>
          <button onClick={handleSave}
            className="px-3 h-9 rounded-full bg-blue-600 text-white text-[12px] font-bold hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-1 shadow-sm shadow-blue-600/20"
            title="Salvar alterações"
          >
            <Check size={13} strokeWidth={3} /> Salvar
          </button>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-y-auto hide-scrollbar bg-slate-50/40">
        {/* Avatar / identidade */}
        <div className="bg-white px-5 py-5 border-b border-slate-100 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-black text-[20px] shadow-sm shadow-blue-600/20">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-[18px] font-bold text-slate-900 truncate leading-tight">{user?.name || 'Usuário'}</p>
            <p className="text-[12px] text-slate-500 truncate">{user?.email || '—'}</p>
            <p className="text-[11px] text-blue-600 font-semibold mt-0.5 uppercase tracking-wider">{user?.subscription_plan === 'free' ? 'Plano Free' : user?.subscription_plan === 'pro' ? 'Plano Pro' : 'Premium'}</p>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Dados pessoais */}
          <section>
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <UserIcon size={11} strokeWidth={2.5} /> Dados pessoais
            </h2>
            <div className="bg-white rounded-2xl border border-slate-100 p-3 space-y-2 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <Field label="Nome completo">
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  className="profile-input"
                />
              </Field>
              <Field label="E-mail">
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="profile-input"
                />
              </Field>
              <Field label="WhatsApp">
                <input
                  type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="profile-input"
                />
              </Field>
            </div>
          </section>

          {/* Atuação */}
          <section>
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Briefcase size={11} strokeWidth={2.5} /> Atuação profissional
            </h2>
            <div className="bg-white rounded-2xl border border-slate-100 p-3 space-y-2 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <Field label="Especialidade">
                <input
                  type="text" value={specialty} onChange={e => setSpecialty(e.target.value)}
                  placeholder="Ex: Medicina de Urgência"
                  className="profile-input"
                />
              </Field>
              <Field label="Tipo de profissional">
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.entries(PROFILE_TYPE_LABELS) as [ProfileType, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setProfileType(key)}
                      className={`px-2.5 py-2 rounded-xl text-[11px] font-semibold transition-all active:scale-95 ${
                        profileType === key
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </section>

          {/* Tributário */}
          <section>
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Calculator size={11} strokeWidth={2.5} /> Tributário
            </h2>
            <div className="bg-white rounded-2xl border border-slate-100 p-3 space-y-2 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <Field label="Regime tributário">
                <div className="grid grid-cols-2 gap-1.5">
                  {(['MEI', 'Simples Nacional', 'Lucro Presumido', 'PF'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTaxRegime(t)}
                      className={`px-2 py-2 rounded-xl text-[11px] font-semibold transition-all active:scale-95 ${
                        taxRegime === t
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Alíquota (%)" className="col-span-1">
                  <input
                    type="number" inputMode="decimal" step="0.5" value={taxRate}
                    onChange={e => setTaxRate(e.target.value)}
                    className="profile-input"
                  />
                </Field>
                <Field label="Razão social" className="col-span-2">
                  <input
                    type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                    placeholder="Opcional"
                    className="profile-input"
                  />
                </Field>
              </div>
              <Field label="CNPJ">
                <input
                  type="text" value={cnpj} onChange={e => setCnpj(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  className="profile-input"
                />
              </Field>
            </div>
          </section>

          {error && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
              {error}
            </div>
          )}

          {/* Sair da conta */}
          <button
            onClick={handleLogout}
            className="w-full mt-2 py-3 rounded-2xl bg-white border border-red-100 text-red-600 text-[13px] font-bold flex items-center justify-center gap-2 hover:bg-red-50 transition active:scale-[0.98]"
          >
            <LogOut size={14} strokeWidth={2.5} />
            Sair da conta
          </button>

          <p className="text-center text-[10px] text-slate-400 mt-2">
            Plantãozinho Plus · v1.0
          </p>
        </div>
      </main>

      {/* Inline styles for input class */}
      <style>{`
        .profile-input {
          width: 100%;
          background-color: rgb(248 250 252);
          border: 1px solid rgb(226 232 240);
          border-radius: 0.75rem;
          padding: 0.625rem 0.75rem;
          font-size: 13px;
          font-weight: 600;
          color: rgb(30 41 59);
          outline: none;
          transition: all 0.15s;
        }
        .profile-input:focus {
          border-color: rgb(59 130 246);
          background-color: white;
        }
        html.dark .profile-input {
          background-color: rgb(15 23 42);
          border-color: rgb(51 65 85);
          color: rgb(241 245 249);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[10px] text-slate-500 mb-1 ml-0.5 font-medium">{label}</p>
      {children}
    </div>
  );
}
