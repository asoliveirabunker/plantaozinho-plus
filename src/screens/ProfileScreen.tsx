import { useState, useEffect, type ReactNode } from 'react';
import { ChevronLeft, LogOut, Loader2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { PROFILE_TYPE_LABELS, type ProfileType, isGuestUser } from '../types';
import { useLanguage, type Language } from '../hooks/useLanguage';
import { isSupabaseConfigured } from '../lib/supabase';
import { countLegacyLocalData, importLegacyLocalToCloud } from '../lib/cloudSync';
import ConfirmDialog from '../components/ConfirmDialog';

/** Partes do nome sem título ("Dra. Ana Souza" → ["Ana", "Souza"]). */
function nameParts(name: string) {
  return name.trim().split(/\s+/).filter(p => p && !/^(dr|dra|doutor|doutora)\.?$/i.test(p));
}

const TAX_REGIMES = ['MEI', 'Simples Nacional', 'Lucro Presumido', 'PF'] as const;

/** Idiomas: nome nativo + região — linha com check, sem bandeira. */
const LANGUAGES: { id: Language; label: string; region: string }[] = [
  { id: 'pt-BR', label: 'Português', region: 'Brasil' },
  { id: 'es-LATAM', label: 'Español', region: 'Latinoamérica' },
];

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
  const [rateFocused, setRateFocused] = useState(false);
  const [companyName, setCompanyName] = useState(user?.company_name || '');
  const [cnpj, setCnpj] = useState(user?.cnpj || '');
  // Erro no próprio campo (borda + linha terracota), como no design.
  const [error, setError] = useState<'' | 'name' | 'email'>('');

  function handleSave() {
    setError('');
    if (!name.trim()) { setError('name'); return; }
    if (!email.trim()) { setError('email'); return; }

    const rate = parseFloat(taxRate.replace('%', '').replace(',', '.'));

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

  // confirm() nativo é bloqueado em iframes/webviews (o botão "não fazia nada"): usa o ConfirmDialog.
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  function handleLogout() {
    setShowLogoutConfirm(true);
  }

  // Placa: iniciais sem o título "Dr./Dra."; nome completo com o último nome em 600.
  const parts = nameParts(user?.name || '');
  const initials = parts.slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'U';
  const fullWords = (user?.name || '').trim().split(/\s+/).filter(Boolean);
  const nameLight = fullWords.slice(0, -1).join(' ');
  const nameBold = fullWords[fullWords.length - 1] || t('Usuário');
  const planLabel = user?.subscription_plan === 'free'
    ? t('Plano Free')
    : user?.subscription_plan === 'pro' ? t('Plano Pro') : t('Plano Max');

  // Alíquota exibida como "6%" fora do foco; ao editar, só o número.
  const rateDisplay = rateFocused || !taxRate ? taxRate : `${taxRate}%`;

  return (
    <div className="fixed inset-0 z-50 flex justify-center animate-fade-in" style={{ background: 'var(--color-bg)' }}>
     <div className="w-full max-w-[430px] h-full bg-white flex flex-col relative shadow-xl overflow-hidden">
      {/* O overlay (z-50) cobre a bottom-nav (z-30): a folha não precisa dos 118px de folga. */}
      <main className="flex-1 overflow-y-auto hide-scrollbar">
        {/* Placa de topo: o médico sobre a pedra */}
        <div className="relative overflow-hidden px-6 pt-[22px] pb-[46px]">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[#2f6f60]"
            style={{
              backgroundImage: 'url(/marble.webp)',
              backgroundSize: '150% auto',
              backgroundPosition: '34% 46%',
              filter: 'var(--marble-filter)',
            }}
          />
          <div aria-hidden="true" className="absolute inset-0" style={{ background: 'var(--marble-veil)' }} />

          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <button onClick={onClose} className="glass-icon-btn" title={t('Voltar')} aria-label={t('Voltar')}>
                <ChevronLeft size={17} strokeWidth={1.5} />
              </button>
              <span className="glass-pill gap-2 text-[11px] font-medium uppercase tracking-[0.08em] hover:bg-white/[0.12]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M13 3 6 13.5h5l-1 7.5 7-10.5h-5z" />
                </svg>
                {planLabel}
              </span>
            </div>

            <div className="mt-7 flex items-end gap-4">
              {/* Superfície sempre branca: cor fixa (o `text-slate-900` clareia no modo escuro) */}
              <span
                className="w-14 h-14 shrink-0 rounded-[18px] bg-white/[0.94] text-[#0A4739] text-[18px] font-semibold tracking-[-0.02em] flex items-center justify-center"
                aria-hidden="true"
              >
                {initials}
              </span>
              <div className="min-w-0">
                <h1 className="m-0 text-[26px] font-light leading-[1.1] tracking-[-0.035em] text-white break-words">
                  {nameLight && <>{nameLight} </>}
                  <span className="font-semibold">{nameBold}</span>
                </h1>
                {user?.email && (
                  <p className="mt-1.5 truncate text-[13.5px] font-medium text-white/[0.82]">{user.email}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Folha contínua com seções em filete */}
        <div className="jade-sheet !pb-[calc(40px_+_env(safe-area-inset-bottom,0px))]">
          {/* Dados pessoais */}
          <section>
            <div className="section-rule mt-0"><span>{t('Dados pessoais')}</span></div>
            <Field label={t('Nome completo')} htmlFor="profile-name">
              <input
                id="profile-name"
                type="text" value={name}
                onChange={e => { setName(e.target.value); if (error === 'name') setError(''); }}
                placeholder={t('Seu nome')}
                autoComplete="name"
                aria-invalid={error === 'name'}
                className="input-field"
              />
              {error === 'name' && <p role="alert" className="input-error">{t('Informe seu nome para salvar.')}</p>}
            </Field>
            <Field label={t('E-mail')} htmlFor="profile-email" className="mt-[18px]">
              <input
                id="profile-email"
                type="email" value={email}
                onChange={e => { setEmail(e.target.value); if (error === 'email') setError(''); }}
                autoComplete="email"
                aria-invalid={error === 'email'}
                className="input-field"
              />
              {error === 'email' && <p role="alert" className="input-error">{t('Informe seu e-mail.')}</p>}
            </Field>
            <Field label="WhatsApp" htmlFor="profile-whatsapp" className="mt-[18px]">
              <input
                id="profile-whatsapp"
                type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
                placeholder="(11) 99999-9999"
                autoComplete="tel"
                className="input-field tabular-nums"
              />
            </Field>
          </section>

          {/* Atuação */}
          <section>
            <div className="section-rule"><span>{t('Atuação')}</span></div>
            <Field label={t('Especialidade')} htmlFor="profile-specialty">
              <input
                id="profile-specialty"
                type="text" value={specialty} onChange={e => setSpecialty(e.target.value)}
                placeholder={t('Ex: Medicina de Urgência')}
                className="input-field"
              />
            </Field>
            <p className="input-label mt-[18px]">{t('Tipo de profissional')}</p>
            <div role="group" aria-label={t('Tipo de profissional')} className="flex flex-wrap gap-2">
              {(Object.entries(PROFILE_TYPE_LABELS) as [ProfileType, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setProfileType(key)}
                  aria-pressed={profileType === key}
                  className="chip"
                >
                  {t(label)}
                </button>
              ))}
            </div>
          </section>

          {/* Tributário */}
          <section>
            <div className="section-rule mb-2"><span>{t('Tributário')}</span></div>
            <p className="mb-[14px] text-[12.5px] font-normal leading-[1.55] text-slate-500">
              {t('Usado para calcular a provisão de imposto nos Relatórios.')}
            </p>
            <div role="group" aria-label={t('Regime tributário')} className="flex flex-wrap gap-2">
              {TAX_REGIMES.map(regime => (
                <button
                  key={regime}
                  type="button"
                  onClick={() => setTaxRegime(regime)}
                  aria-pressed={taxRegime === regime}
                  className="chip"
                >
                  {regime}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-[96px_1fr] gap-[10px] mt-[18px]">
              <Field label={t('Alíquota')} htmlFor="profile-tax-rate">
                <input
                  id="profile-tax-rate"
                  type="text" inputMode="decimal" value={rateDisplay}
                  onFocus={() => setRateFocused(true)}
                  onBlur={() => setRateFocused(false)}
                  onChange={e => setTaxRate(e.target.value.replace(/[^0-9.,]/g, ''))}
                  placeholder="6%"
                  className="input-field tabular-nums"
                />
              </Field>
              <Field label={t('Razão social')} htmlFor="profile-company" className="min-w-0">
                <input
                  id="profile-company"
                  type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                  placeholder={t('Opcional')}
                  className="input-field"
                />
              </Field>
            </div>
            <Field label={t('CNPJ')} htmlFor="profile-cnpj" className="mt-[18px]">
              <input
                id="profile-cnpj"
                type="text" value={cnpj} onChange={e => setCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
                className="input-field tabular-nums"
              />
            </Field>
          </section>

          {/* Idioma — linhas com check */}
          <section>
            <div className="section-rule mb-[14px]"><span>{t('Idioma')}</span></div>
            <div role="group" aria-label={t('Idioma')}>
              {LANGUAGES.map(lang => {
                const active = language === lang.id;
                return (
                  <button
                    key={lang.id}
                    type="button"
                    onClick={() => setLanguage(lang.id)}
                    aria-pressed={active}
                    className="list-row w-full gap-[14px] text-left"
                  >
                    <span className="min-w-0">
                      <span className={`block text-[14.5px] ${active ? 'font-semibold text-slate-900' : 'font-normal text-slate-600'}`}>
                        {lang.label}
                      </span>
                      <span className="block mt-[3px] text-[12.5px] font-normal text-slate-500">{lang.region}</span>
                    </span>
                    {active && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-blue-600">
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Sincronização com a nuvem (Supabase) — mesma peça de aviso do sistema */}
          {cloudEligible && (
            <section>
              <div className="section-rule mb-[14px]"><span>{t('Dados na nuvem')}</span></div>
              <div className="notice flex-col gap-0">
                <span className="block text-[14px] font-semibold text-slate-900">
                  {legacyCount > 0
                    ? `${legacyCount} ${legacyCount === 1 ? t('registro local') : t('registros locais')} ${t('ainda não enviados.')}`
                    : t('Seus dados estão sincronizados com a nuvem.')}
                </span>
                {importMsg && (
                  <span className="block mt-[3px] text-[12.5px] font-normal leading-[1.5] text-slate-500">{importMsg}</span>
                )}
                {legacyCount > 0 && (
                  <button
                    type="button"
                    onClick={handleImportLocal}
                    disabled={importing}
                    className="btn-secondary mt-3 flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {importing && <Loader2 size={15} className="animate-spin" />}
                    {importing ? t('Importando...') : t('Importar dados locais para a nuvem')}
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Salvar ao fim da leitura; sair logo abaixo */}
          <button type="button" onClick={handleSave} className="btn-primary mt-7">
            {t('Salvar alterações')}
          </button>
          <button type="button" onClick={handleLogout} className="btn-danger mt-[10px]">
            {t('Sair da conta')}
          </button>

          <p className="mt-[22px] text-center text-[12px] font-normal text-slate-500">
            Plantão Pro · {t('versão')} 1.0
          </p>
        </div>
      </main>
     </div>

      <ConfirmDialog
        open={showLogoutConfirm}
        icon={LogOut}
        title={t('Sair da conta?')}
        description={t('Você precisará entrar novamente para acessar seus dados.')}
        confirmLabel={t('Sair')}
        tone="danger"
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => { setShowLogoutConfirm(false); logout(); }}
      />
    </div>
  );
}

function Field({ label, htmlFor, children, className = '' }: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {htmlFor
        ? <label htmlFor={htmlFor} className="input-label">{label}</label>
        : <p className="input-label">{label}</p>}
      {children}
    </div>
  );
}
