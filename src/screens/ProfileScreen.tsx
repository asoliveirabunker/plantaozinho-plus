import { useState, useEffect } from 'react';
import { ArrowLeft, Check, User as UserIcon, Briefcase, LogOut, Calculator, Languages, UploadCloud, Loader2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { PROFILE_TYPE_LABELS, type ProfileType, isGuestUser } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { isSupabaseConfigured } from '../lib/supabase';
import { countLegacyLocalData, importLegacyLocalToCloud } from '../lib/cloudSync';

/** Bandeira do Brasil — SVG inline */
function FlagBR({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 7) / 10} viewBox="0 0 700 490" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="700" height="490" fill="#009C3B" />
      <polygon points="350,40 660,245 350,450 40,245" fill="#FFDF00" />
      <circle cx="350" cy="245" r="90" fill="#002776" />
      <path d="M 270 245 A 100 100 0 0 1 430 245" stroke="#fff" strokeWidth="6" fill="none" />
    </svg>
  );
}

/** Bandeira do México — representando espanhol latino-americano */
function FlagMX({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 7) / 10} viewBox="0 0 700 490" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="233" height="490" fill="#006847" />
      <rect x="233" width="234" height="490" fill="#ffffff" />
      <rect x="467" width="233" height="490" fill="#ce1126" />
      <circle cx="350" cy="245" r="34" fill="#8b6914" opacity="0.85" />
    </svg>
  );
}

interface ProfileScreenProps {
  onClose: () => void;
  onSaved?: () => void;
}

export default function ProfileScreen({ onClose, onSaved }: ProfileScreenProps) {
  const { user, updateProfile, logout, refresh } = useApp();
  const { language, setLanguage, t } = useLanguage();

  // --- Importação de dados locais para a nuvem (Supabase) ---
  const cloudEligible = isSupabaseConfigured && !!user && !isGuestUser(user);
  const [legacyCount, setLegacyCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  useEffect(() => {
    if (cloudEligible && user) setLegacyCount(countLegacyLocalData(user.id));
  }, [cloudEligible, user]);

  async function handleImportLocal() {
    if (!user || importing) return;
    setImporting(true);
    setImportMsg('');
    try {
      const r = await importLegacyLocalToCloud(user.id);
      const total = r.workplaces + r.templates + r.shifts;
      setImportMsg(total > 0
        ? `Importado: ${r.workplaces} locais, ${r.shifts} plantões, ${r.templates} modelos.`
        : 'Nenhum dado local para importar.');
      setLegacyCount(countLegacyLocalData(user.id));
      refresh();
    } catch (e) {
      setImportMsg('Falha ao importar: ' + ((e as Error).message || 'erro desconhecido'));
    } finally {
      setImporting(false);
    }
  }
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
    <div className="fixed inset-0 z-50 flex justify-center animate-fade-in" style={{ background: 'var(--color-bg)' }}>
     <div className="w-full max-w-[430px] h-full bg-white flex flex-col relative shadow-xl overflow-hidden">
      {/* Header */}
      <header className="px-5 pt-7 pb-3 bg-white border-b border-slate-100 shrink-0">
        <div className="flex items-center justify-between">
          <button onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-all active:scale-95"
            title={t('Voltar')}
          >
            <ArrowLeft size={16} strokeWidth={2.5} />
          </button>
          <div className="text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{t('Conta')}</p>
            <h1 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight">{t('Perfil')}</h1>
          </div>
          <button onClick={handleSave}
            className="px-3 h-9 rounded-full bg-blue-600 text-white text-[12px] font-bold hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-1 shadow-sm shadow-blue-600/20"
            title={t('Salvar alterações')}
          >
            <Check size={13} strokeWidth={3} /> {t('Salvar')}
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
            <p className="text-[11px] text-blue-600 font-semibold mt-0.5 uppercase tracking-wider">{user?.subscription_plan === 'free' ? t('Plano Free') : user?.subscription_plan === 'pro' ? t('Plano Pro') : t('Plano Max')}</p>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Dados pessoais */}
          <section>
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <UserIcon size={11} strokeWidth={2.5} /> {t('Dados pessoais')}
            </h2>
            <div className="bg-white rounded-2xl border border-slate-100 p-3 space-y-2 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <Field label={t('Nome completo')}>
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  className="profile-input"
                />
              </Field>
              <Field label={t('E-mail')}>
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
              <Briefcase size={11} strokeWidth={2.5} /> {t('Atuação profissional')}
            </h2>
            <div className="bg-white rounded-2xl border border-slate-100 p-3 space-y-2 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <Field label={t('Especialidade')}>
                <input
                  type="text" value={specialty} onChange={e => setSpecialty(e.target.value)}
                  placeholder={t('Ex: Medicina de Urgência')}
                  className="profile-input"
                />
              </Field>
              <Field label={t('Tipo de profissional')}>
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
                      {t(label)}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </section>

          {/* Tributário */}
          <section>
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Calculator size={11} strokeWidth={2.5} /> {t('Tributário')}
            </h2>
            <div className="bg-white rounded-2xl border border-slate-100 p-3 space-y-2 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <Field label={t('Regime tributário')}>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['MEI', 'Simples Nacional', 'Lucro Presumido', 'PF'] as const).map(regime => (
                    <button
                      key={regime}
                      onClick={() => setTaxRegime(regime)}
                      className={`px-2 py-2 rounded-xl text-[11px] font-semibold transition-all active:scale-95 ${
                        taxRegime === regime
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {regime}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label={t('Alíquota (%)')} className="col-span-1">
                  <input
                    type="number" inputMode="decimal" step="0.5" value={taxRate}
                    onChange={e => setTaxRate(e.target.value)}
                    className="profile-input"
                  />
                </Field>
                <Field label={t('Razão social')} className="col-span-2">
                  <input
                    type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                    placeholder={t('Opcional')}
                    className="profile-input"
                  />
                </Field>
              </div>
              <Field label={t('CNPJ')}>
                <input
                  type="text" value={cnpj} onChange={e => setCnpj(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  className="profile-input"
                />
              </Field>
            </div>
          </section>

          {/* Idioma */}
          <section>
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Languages size={11} strokeWidth={2.5} /> {t('Idioma')}
            </h2>
            <div className="bg-white rounded-2xl border border-slate-100 p-2 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <div className="grid grid-cols-2 gap-1.5">
                <LanguageButton
                  active={language === 'pt-BR'}
                  onClick={() => setLanguage('pt-BR')}
                  flag={<FlagBR size={20} />}
                  label="Português"
                  sub="Brasil"
                />
                <LanguageButton
                  active={language === 'es-LATAM'}
                  onClick={() => setLanguage('es-LATAM')}
                  flag={<FlagMX size={20} />}
                  label="Español"
                  sub="Latinoamérica"
                />
              </div>
            </div>
          </section>

          {error && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
              {error}
            </div>
          )}

          {/* Sincronização com a nuvem (Supabase) */}
          {cloudEligible && (
            <div className="mt-2 bg-white border border-slate-100 rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                  <UploadCloud size={16} className="text-violet-600" strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-slate-900 leading-tight">{t('Dados na nuvem')}</p>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    {legacyCount > 0
                      ? `${legacyCount} ${legacyCount === 1 ? 'registro local' : 'registros locais'} ainda não enviados.`
                      : 'Seus dados estão sincronizados com a nuvem.'}
                  </p>
                </div>
              </div>
              {legacyCount > 0 && (
                <button
                  onClick={handleImportLocal}
                  disabled={importing}
                  className="w-full mt-2 py-2.5 rounded-xl bg-violet-600 text-white text-[13px] font-bold flex items-center justify-center gap-2 hover:bg-violet-700 transition active:scale-[0.98] disabled:opacity-60"
                >
                  {importing ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} strokeWidth={2.5} />}
                  {importing ? t('Importando...') : t('Importar dados locais para a nuvem')}
                </button>
              )}
              {importMsg && <p className="text-[11px] text-slate-500 mt-2 text-center">{importMsg}</p>}
            </div>
          )}

          {/* Sair da conta */}
          <button
            onClick={handleLogout}
            className="w-full mt-2 py-3 rounded-2xl bg-white border border-red-100 text-red-600 text-[13px] font-bold flex items-center justify-center gap-2 hover:bg-red-50 transition active:scale-[0.98]"
          >
            <LogOut size={14} strokeWidth={2.5} />
            {t('Sair da conta')}
          </button>

          <p className="text-center text-[10px] text-slate-400 mt-2">
            Plantão Pro · v1.0
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

function LanguageButton({ active, onClick, flag, label, sub }: {
  active: boolean;
  onClick: () => void;
  flag: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-2.5 py-2 rounded-xl transition-all active:scale-95 text-left ${
        active
          ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
          : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
      }`}
    >
      <div className="rounded-[4px] overflow-hidden shrink-0 ring-1 ring-black/5 leading-none">
        {flag}
      </div>
      <div className="flex-1 min-w-0 leading-tight">
        <p className={`text-[12px] font-bold truncate ${active ? 'text-white' : 'text-slate-800'}`}>{label}</p>
        <p className={`text-[10px] ${active ? 'text-blue-100' : 'text-slate-400'} truncate`}>{sub}</p>
      </div>
      {active && (
        <Check size={13} strokeWidth={3} className="text-white shrink-0" />
      )}
    </button>
  );
}
