import { useState, useMemo, useEffect, useRef } from 'react';
import { useTheme } from '../hooks/useTheme';
import { useLanguage } from '../hooks/useLanguage';
import { ChevronRight, ChevronLeft, Calendar, Wallet, RefreshCw, Stethoscope, Eye, EyeOff, Check, X, Lock, UserCircle2 } from 'lucide-react';
import type { ProfileType } from '../types';
import { PROFILE_TYPE_LABELS } from '../types';
import { registerUser, loginUser, getUsers } from '../lib/db';
import { useApp } from '../contexts/AppContext';
import { isSupabaseConfigured } from '../lib/supabase';
import BrandMark from '../components/BrandMark';
import MarbleBackground from '../components/MarbleBackground';
import { signUp as sbSignUp, signIn as sbSignIn } from '../lib/supabaseAuth';

/** Bandeira BR mini para o seletor de idioma */
function MiniFlagBR() {
  return (
    <svg width="16" height="11" viewBox="0 0 700 490" aria-hidden="true">
      <rect width="700" height="490" fill="#009C3B" />
      <polygon points="350,40 660,245 350,450 40,245" fill="#FFDF00" />
      <circle cx="350" cy="245" r="90" fill="#002776" />
    </svg>
  );
}
/** Bandeira MX mini representando ES-LATAM */
function MiniFlagMX() {
  return (
    <svg width="16" height="11" viewBox="0 0 700 490" aria-hidden="true">
      <rect width="233" height="490" fill="#006847" />
      <rect x="233" width="234" height="490" fill="#ffffff" />
      <rect x="467" width="233" height="490" fill="#ce1126" />
    </svg>
  );
}

const slides = [
  {
    icon: <Calendar size={40} className="text-white" />,
    iconBg: '#03bb85',
    title: 'Controle seus plantões\nem segundos.',
    subtitle: 'Cadastre, repita e organize toda sua escala num só lugar — feito para a rotina do médico plantonista.',
  },
  {
    icon: <Wallet size={40} className="text-white" />,
    iconBg: '#22c55e',
    title: 'Saiba exatamente\nquanto você tem a\nreceber.',
    subtitle: 'Visualize ganhos, pagamentos pendentes e atrasos. Pare de descobrir surpresas no fim do mês.',
  },
  {
    icon: <RefreshCw size={40} className="text-white" />,
    iconBg: '#8b5cf6',
    title: 'Repita escalas, confira\npagamentos e gere\nrelatórios.',
    subtitle: 'Plantões recorrentes (12x36, 24x72, mensal), conferência de divergências e relatórios prontos para o contador.',
  },
];

const profileOptions: ProfileType[] = ['residente', 'plantonista', 'especialista', 'anestesista', 'cirurgiao', 'intensivista', 'urgencista', 'outro'];
const goalOptions = ['Organizar minha escala', 'Controlar pagamentos', 'Conferir atrasos', 'Gerar relatórios'];
const specialties = ['Medicina de Urgência', 'Anestesiologia', 'Cirurgia Geral', 'Medicina Intensiva', 'Pediatria', 'Clínica Médica', 'Ortopedia', 'Ginecologia', 'Cardiologia', 'Neurologia', 'Outra'];

interface PasswordRule {
  label: string;
  test: (pw: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: 'Mínimo 8 caracteres', test: pw => pw.length >= 8 },
  { label: 'Letra maiúscula (A-Z)', test: pw => /[A-Z]/.test(pw) },
  { label: 'Letra minúscula (a-z)', test: pw => /[a-z]/.test(pw) },
  { label: 'Número (0-9)', test: pw => /[0-9]/.test(pw) },
  { label: 'Caractere especial (!@#$%&*)', test: pw => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw) },
];

type Mode = 'onboarding' | 'login' | 'register';

export default function OnboardingScreen() {
  const { login } = useApp();
  const { theme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const isDark = theme === 'dark';
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode>('onboarding');

  // Register form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [specialty, setSpecialty] = useState('');
  const [profile, setProfile] = useState<ProfileType>('plantonista');
  const [whatsapp, setWhatsapp] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [withDemo, setWithDemo] = useState(false);
  const [crm, setCrm] = useState('');
  const [registerStep, setRegisterStep] = useState<0 | 1>(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [signupMsg, setSignupMsg] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // A notificação de cadastro flutua no topo e se dispensa sozinha.
  useEffect(() => {
    if (!signupMsg) return;
    const timer = setTimeout(() => setSignupMsg(null), 7000);
    return () => clearTimeout(timer);
  }, [signupMsg]);

  // Password strength
  const passwordChecks = useMemo(() =>
    PASSWORD_RULES.map(rule => ({ ...rule, passed: rule.test(password) })),
    [password]
  );
  const allPasswordChecksPassed = passwordChecks.every(c => c.passed);
  const passwordStrength = useMemo(() => {
    const passed = passwordChecks.filter(c => c.passed).length;
    if (passed <= 1) return { label: 'Muito fraca', color: '#ef4444', percent: 20 };
    if (passed <= 2) return { label: 'Fraca', color: '#f97316', percent: 40 };
    if (passed <= 3) return { label: 'Média', color: '#eab308', percent: 60 };
    if (passed <= 4) return { label: 'Forte', color: '#22c55e', percent: 80 };
    return { label: 'Muito forte', color: '#10b981', percent: 100 };
  }, [passwordChecks]);

  // Auto-rotação do carrossel de slides (15s por slide × 3 slides = 45s total, ciclo infinito)
  useEffect(() => {
    if (mode !== 'onboarding') return;
    const timer = setInterval(() => {
      setStep(s => (s + 1) % slides.length);
    }, 15000);
    return () => clearInterval(timer);
  }, [mode]);

  // Swipe para navegar entre slides
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const end = e.changedTouches[0];
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    const dt = Date.now() - start.t;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 600) {
      if (dx < 0) goNextSlide(); else goPrevSlide();
    }
  }

  function goNextSlide() {
    setStep(s => (s + 1) % slides.length);
  }
  function goPrevSlide() {
    setStep(s => (s - 1 + slides.length) % slides.length);
  }

  function handleNext() {
    setMode('register');
  }

  function toggleGoal(g: string) {
    setGoals(prev =>
      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
    );
  }

  function validateStep1() {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Nome obrigatório';
    if (!email.trim() || !email.includes('@')) errs.email = 'E-mail inválido';
    if (!allPasswordChecksPassed) errs.password = 'A senha não atende todos os requisitos';
    if (password !== confirmPassword) errs.confirmPassword = 'As senhas não coincidem';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateStep2() {
    const errs: Record<string, string> = {};
    if (!specialty.trim()) errs.specialty = 'Especialidade obrigatória';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleRegisterNext() {
    if (registerStep === 0) {
      if (validateStep1()) {
        setRegisterStep(1);
        // scroll to top do form ao avançar
        requestAnimationFrame(() => {
          const scroller = document.querySelector('.app-container .overflow-y-auto');
          scroller?.scrollTo({ top: 0, behavior: 'smooth' });
        });
      }
    } else {
      if (!validateStep2()) return;

      // ---- Modo Supabase: cadastro real (o AppContext detecta a sessão e entra) ----
      if (isSupabaseConfigured) {
        if (authBusy) return;
        setSignupMsg(null);
        setAuthBusy(true);
        sbSignUp({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim(),
          specialty,
          profile_type: profile,
          whatsapp,
          goals,
          crm: crm.trim() || undefined,
        }).then(({ data, error }) => {
          if (error) {
            const msg = /already registered|already exists/i.test(error.message)
              ? 'Este e-mail já tem conta. Volte e faça login.'
              : error.message;
            setSignupMsg({ type: 'error', text: msg });
            return;
          }
          if (!data.session) {
            // Sem Auto Confirm: precisa confirmar o e-mail antes de logar.
            setSignupMsg({ type: 'info', text: 'Conta criada! Enviamos um e-mail de confirmação — confirme para acessar.' });
          }
          // Com sessão, o listener do AppContext carrega o usuário automaticamente.
        }).catch((e) => setSignupMsg({ type: 'error', text: (e as Error).message }))
          .finally(() => setAuthBusy(false));
        return;
      }

      // ---- Modo localStorage (fallback) ----
      const user = registerUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        specialty,
        profile_type: profile,
        subscription_plan: 'free',
        whatsapp,
        goals,
        crm: crm.trim() || undefined,
        onboarding_completed: true,
      });
      login(user, withDemo);
    }
  }

  function handleRegisterBack() {
    if (registerStep === 1) {
      setRegisterStep(0);
      requestAnimationFrame(() => {
        const scroller = document.querySelector('.app-container .overflow-y-auto');
        scroller?.scrollTo({ top: 0, behavior: 'smooth' });
      });
    } else {
      setMode('onboarding');
    }
  }

  function handleLogin() {
    if (!loginEmail.trim()) { setLoginError('Informe seu e-mail'); return; }
    if (!loginPassword.trim()) { setLoginError('Informe sua senha'); return; }

    // ---- Modo Supabase: login real (o AppContext detecta a sessão e entra) ----
    if (isSupabaseConfigured) {
      setLoginError('');
      sbSignIn(loginEmail.trim(), loginPassword).then(({ error }) => {
        if (error) setLoginError('E-mail ou senha incorretos.');
        // Em caso de sucesso, o listener do AppContext carrega o usuário.
      }).catch(() => setLoginError('Falha ao entrar. Tente novamente.'));
      return;
    }

    // ---- Modo localStorage (fallback) ----
    const user = loginUser(loginEmail.trim(), loginPassword);
    if (user) {
      login(user, false);
    } else {
      setLoginError('E-mail ou senha incorretos.');
    }
  }

  function handleGuestLogin() {
    // Sessão de visitante: dados sempre limpos e elevados ao plano max para experimentar tudo.
    // Bloqueios contra abuso são aplicados em runtime (banner, expiração 60min, exports bloqueados).
    const now = Date.now();
    const existing = getUsers().find(u => u.email === 'visitante@plantaopro.app');
    if (existing) {
      // Reseta timestamp ao reentrar
      const refreshed = { ...existing, is_guest: true as const, guest_session_started_at: now, subscription_plan: 'max' as const };
      login(refreshed, false);
      return;
    }
    const guest = registerUser({
      name: 'Visitante',
      email: 'visitante@plantaopro.app',
      password: '',
      specialty: 'Medicina de Urgência',
      profile_type: 'plantonista',
      subscription_plan: 'max', // visitante experimenta todas as features
      whatsapp: '',
      goals: ['Organizar minha escala', 'Controlar pagamentos'],
      onboarding_completed: true,
      tax_regime: 'Simples Nacional',
      tax_rate: 6,
      is_guest: true,
      guest_session_started_at: now,
    });
    login(guest, true);
  }

  // ---- VIEWS ----

  if (mode === 'login') {
    return (
      <div className="app-container flex flex-col min-h-screen bg-white">
        <div className="flex-1 flex flex-col overflow-y-auto hide-scrollbar">
          {/* Hero marmoreado — compacto */}
          <div className="relative overflow-hidden px-5 pt-6 pb-7">
            <MarbleBackground />
            <div className="relative z-10">
              <button onClick={() => setMode('onboarding')}
                className="flex items-center gap-1 text-white font-semibold mb-4 text-sm w-fit px-2.5 py-1.5 -ml-1 rounded-full bg-white/15 border border-white/25 hover:bg-white/25 transition active:scale-95">
                <ChevronLeft size={16} strokeWidth={2.5} />
                {t('Voltar')}
              </button>
              <p className="text-[11px] font-bold text-white/90 uppercase tracking-[0.22em] mb-0.5 on-marble">{t('Acesso')}</p>
              <h1 className="text-[24px] font-black text-white tracking-tight leading-tight on-marble">{t('Entrar na conta')}</h1>
              <p className="text-white/95 text-[13px] mt-0.5 on-marble">{t('Digite e-mail e senha cadastrados.')}</p>
            </div>
          </div>

          {/* Folha branca sobreposta */}
          <div className="relative z-10 bg-white rounded-t-[26px] -mt-4 px-5 pt-5 flex-1">
          <div className="space-y-2.5">
            <div>
              <p className="text-[10px] text-slate-500 mb-1 ml-0.5 font-medium">{t('E-mail')}</p>
              <input
                type="email"
                value={loginEmail}
                onChange={e => { setLoginEmail(e.target.value); setLoginError(''); }}
                placeholder="seu@email.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
              />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 mb-1 ml-0.5 font-medium">{t('Senha')}</p>
              <div className="relative">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={e => { setLoginPassword(e.target.value); setLoginError(''); }}
                  placeholder={t('Sua senha')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 pr-10 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {loginError && (
              <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {loginError}
              </div>
            )}
          </div>
          </div>
        </div>
        <div className="px-5 pb-8 pt-3 space-y-2">
          <button onClick={handleLogin} className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition active:scale-[0.98] shadow-sm shadow-blue-600/20">
            {t('Entrar')}
          </button>
          <button onClick={() => setMode('register')} className="w-full py-3 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition active:scale-[0.98]">
            {t('Criar nova conta')}
          </button>
          <button
            onClick={handleGuestLogin}
            className="w-full flex items-center justify-center gap-2 py-2 text-slate-500 hover:text-slate-800 transition text-[12.5px] font-medium"
          >
            <UserCircle2 size={14} />
            {t('Entrar como visitante')}
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'register') {
    return (
      <div className="app-container flex flex-col min-h-screen bg-white">
        {/* Notificação flutuante (resultado do cadastro) — não empurra o layout */}
        {signupMsg && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[80] w-[calc(100%-32px)] max-w-[400px] animate-scale-in">
            <div className={`flex items-start gap-2.5 rounded-2xl px-3.5 py-3 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.18)] border ${
              signupMsg.type === 'error' ? 'border-red-100' : 'border-emerald-100'
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                signupMsg.type === 'error' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'
              }`}>
                {signupMsg.type === 'error' ? <X size={15} strokeWidth={2.5} /> : <Check size={15} strokeWidth={3} />}
              </div>
              <p className={`flex-1 min-w-0 text-[12.5px] font-semibold leading-snug pt-1 ${
                signupMsg.type === 'error' ? 'text-red-600' : 'text-emerald-700'
              }`}>
                {signupMsg.text}
              </p>
              <button onClick={() => setSignupMsg(null)}
                className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 hover:bg-slate-200 transition">
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto pb-24 hide-scrollbar">
          {/* Hero marmoreado — compacto: tile à esquerda, texto ao lado */}
          <div className="relative overflow-hidden px-5 pt-6 pb-7">
            <MarbleBackground />
            <div className="relative z-10">
              <div className="flex items-center gap-3.5">
                <div className="w-[52px] h-[52px] rounded-2xl bg-white/90 shadow-[0_10px_24px_rgba(4,80,62,0.28)] flex items-center justify-center shrink-0">
                  <Stethoscope size={25} className="text-emerald-600" strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-white/90 uppercase tracking-[0.22em] mb-0.5 on-marble">{t('Cadastro')}</p>
                  <h1 className="text-[24px] font-black text-white tracking-tight leading-tight on-marble">
                    {registerStep === 0 ? t('Vamos personalizar') : t('Seu perfil médico')}
                  </h1>
                  <p className="text-white/95 text-[13px] mt-0.5 on-marble">
                    {registerStep === 0 ? t('Algumas informações rápidas.') : t('Como você atua nos plantões.')}
                  </p>
                </div>
              </div>
              {/* Progress — 2 etapas */}
              <div className="flex gap-2 mt-4">
                {[0, 1].map(i => (
                  <div key={i} className="h-[5px] rounded-full flex-1 transition-all duration-300"
                    style={{ background: `rgba(255,255,255,${i <= registerStep ? 0.95 : 0.3})` }} />
                ))}
              </div>
            </div>
          </div>

          {/* Folha branca sobreposta ao mármore */}
          <div className="relative z-10 bg-white rounded-t-[26px] -mt-4 px-5 pt-5">

          {/* ============ ETAPA 1 — Identificação + Senha ============ */}
          {registerStep === 0 && (<>

          {/* SEÇÃO: IDENTIFICAÇÃO */}
          <section className="mb-3">
            <h2 className="text-[11px] font-black text-emerald-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <UserCircle2 size={11} strokeWidth={2.5} /> {t('Identificação')}
            </h2>
            <div className="bg-white rounded-2xl border border-slate-100 p-2.5 space-y-2 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5 font-medium">{t('Nome')}</p>
                <input value={name} onChange={e => setName(e.target.value)} placeholder={t('Como podemos te chamar?')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
                {errors.name && <p className="text-red-500 text-[11px] mt-1 ml-0.5">{errors.name}</p>}
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5 font-medium">{t('E-mail')}</p>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
                {errors.email && <p className="text-red-500 text-[11px] mt-1 ml-0.5">{errors.email}</p>}
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5 font-medium">WhatsApp <span className="text-slate-400 font-normal">{t('(opcional)')}</span></p>
                <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="(11) 99999-0001"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              </div>
            </div>
          </section>

          {/* SEÇÃO: SENHA */}
          <section className="mb-3">
            <h2 className="text-[11px] font-black text-emerald-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Lock size={11} strokeWidth={2.5} /> {t('Senha')}
            </h2>
            <div className="bg-white rounded-2xl border border-slate-100 p-2.5 space-y-2 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5 font-medium">{t('Criar senha')}</p>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 pr-10 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition">
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {password.length > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t('Força')}</span>
                      <span className="text-[10px] font-bold" style={{ color: passwordStrength.color }}>{t(passwordStrength.label)}</span>
                    </div>
                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-2">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${passwordStrength.percent}%`, background: passwordStrength.color }} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                      {passwordChecks.map((check, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-full flex items-center justify-center shrink-0 transition-all"
                            style={{ background: check.passed ? '#10b981' : 'transparent', border: check.passed ? 'none' : '1.5px solid #cbd5e1' }}>
                            {check.passed && <Check size={7} color="white" strokeWidth={4} />}
                          </div>
                          <span className="text-[10px] font-medium leading-tight"
                            style={{ color: check.passed ? '#10b981' : '#94a3b8' }}>{t(check.label)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {errors.password && <p className="text-red-500 text-[11px] mt-1 ml-0.5">{errors.password}</p>}
              </div>

              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5 font-medium">{t('Confirmar senha')}</p>
                <div className="relative">
                  <input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repita a senha"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 pr-10 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
                  <button type="button" onClick={() => setShowConfirmPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition">
                    {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {confirmPassword.length > 0 && password !== confirmPassword && (
                  <p className="text-red-500 text-[11px] mt-1 ml-0.5 flex items-center gap-1"><X size={10} /> {t('As senhas não coincidem')}</p>
                )}
                {confirmPassword.length > 0 && password === confirmPassword && password.length > 0 && (
                  <p className="text-emerald-500 text-[11px] mt-1 ml-0.5 flex items-center gap-1"><Check size={10} /> {t('Senhas coincidem')}</p>
                )}
              </div>
            </div>
          </section>

          </>)}

          {/* ============ ETAPA 2 — Atuação + Objetivos + CRM + Demo ============ */}
          {registerStep === 1 && (<>

          {/* SEÇÃO: ATUAÇÃO PROFISSIONAL */}
          <section className="mb-3">
            <h2 className="text-[11px] font-black text-emerald-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Stethoscope size={11} strokeWidth={2.5} /> {t('Atuação profissional')}
            </h2>
            <div className="bg-white rounded-2xl border border-slate-100 p-2.5 space-y-2 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5 font-medium">{t('Especialidade')}</p>
                <select value={specialty} onChange={e => setSpecialty(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition">
                  <option value="">{t('Selecione...')}</option>
                  {specialties.map(s => <option key={s} value={s}>{t(s)}</option>)}
                </select>
                {errors.specialty && <p className="text-red-500 text-[11px] mt-1 ml-0.5">{errors.specialty}</p>}
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-1 ml-0.5 font-medium">{t('Perfil')}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {profileOptions.map(p => (
                    <button key={p} onClick={() => setProfile(p)}
                      className={`px-2.5 py-2 rounded-xl text-[11px] font-semibold transition-all active:scale-95 ${
                        profile === p
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}>
                      {t(PROFILE_TYPE_LABELS[p])}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* SEÇÃO: OBJETIVOS */}
          <section className="mb-3">
            <h2 className="text-[11px] font-black text-emerald-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Check size={11} strokeWidth={2.5} /> {t('Principais objetivos')}
              <span className="text-slate-400 font-normal normal-case tracking-normal text-[10px] ml-auto">{t('Selecione um ou mais')}</span>
            </h2>
            <div className="grid grid-cols-2 gap-1.5">
              {goalOptions.map(g => {
                const sel = goals.includes(g);
                return (
                  <button key={g} onClick={() => toggleGoal(g)}
                    className="px-3 py-2.5 rounded-xl text-[11.5px] font-semibold transition-all active:scale-95 text-left flex items-center justify-between gap-1.5"
                    style={{
                      background: sel ? (isDark ? 'rgba(24,119,242,0.15)' : '#eff6ff') : (isDark ? '#1e293b' : '#f8fafc'),
                      color: sel ? '#60a5fa' : (isDark ? '#e2e8f0' : '#475569'),
                      border: `1.5px solid ${sel ? '#03bb85' : (isDark ? '#334155' : 'transparent')}`,
                    }}>
                    <span className="leading-tight">{t(g)}</span>
                    {sel && (
                      <span className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                        <Check size={9} color="white" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* SEÇÃO: CRM */}
          <section className="mb-3">
            <h2 className="text-[11px] font-black text-emerald-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Stethoscope size={11} strokeWidth={2.5} /> CRM
              <span className="text-slate-400 font-normal normal-case tracking-normal text-[10px] ml-auto">{t('(opcional)')}</span>
            </h2>
            <div className="bg-white rounded-2xl border border-slate-100 p-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <input value={crm} onChange={e => setCrm(e.target.value)} placeholder="Ex: 123456 / SP"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
              <p className="text-[10px] text-slate-400 mt-1.5 ml-0.5 leading-snug">
                Número de registro profissional. Aparecerá nos relatórios gerados.
              </p>
            </div>
          </section>

          {/* TOGGLE DEMO */}
          <button onClick={() => setWithDemo(v => !v)}
            className="w-full text-left px-3 py-2.5 rounded-2xl transition-all flex items-center justify-between gap-2 mb-2"
            style={{
              background: withDemo ? (isDark ? 'rgba(24,119,242,0.15)' : '#eff6ff') : (isDark ? '#1e293b' : '#f8fafc'),
              border: `1.5px solid ${withDemo ? '#03bb85' : (isDark ? '#334155' : 'transparent')}`,
            }}>
            <div className="min-w-0">
              <p className="text-[12.5px] font-bold leading-tight" style={{ color: withDemo ? '#60a5fa' : (isDark ? '#e2e8f0' : '#1e293b') }}>
                {t('Carregar dados de demonstração')}
              </p>
              <p className={`text-[10.5px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'} leading-tight mt-0.5`}>
                {t('Plantões e locais pré-cadastrados')}
              </p>
            </div>
            <div className={`w-9 h-5 rounded-full transition-all shrink-0 flex items-center ${withDemo ? 'bg-blue-600 justify-end' : 'bg-slate-300 justify-start'} px-0.5`}>
              <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
            </div>
          </button>

          </>)}
          </div>
        </div>

        {/* Footer sticky */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-5 pb-6 pt-3 bg-white border-t border-slate-100 z-[51]" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
          <div className="flex gap-2">
            <button onClick={handleRegisterBack} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition active:scale-[0.98]">
              {t('Voltar')}
            </button>
            <button onClick={handleRegisterNext} disabled={authBusy}
              className="flex-[2] py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition active:scale-[0.98] shadow-sm shadow-blue-600/20 disabled:opacity-60">
              {authBusy ? t('Criando conta...') : (registerStep === 0 ? t('Continuar') : t('Começar'))}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ONBOARDING — uma única tela com carrossel auto-rotativo (3s por slide, 9s total)
  const slide = slides[step];
  return (
    <div className="app-container relative flex flex-col min-h-screen overflow-hidden">
      {/* Fundo marmoreado animado da marca */}
      <MarbleBackground />

      {/* Top bar: language toggle */}
      <div className="absolute top-0 right-0 left-0 z-20 flex items-center justify-end px-4 pt-4">
        <button
          onClick={() => setLanguage(language === 'pt-BR' ? 'es-LATAM' : 'pt-BR')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/20 border border-white/30 hover:bg-white/30 transition active:scale-95"
          title={language === 'pt-BR' ? 'Cambiar a español' : 'Mudar para português'}
        >
          <span className="rounded-[3px] overflow-hidden leading-none ring-1 ring-white/30">
            {language === 'pt-BR' ? <MiniFlagBR /> : <MiniFlagMX />}
          </span>
          <span className="text-[11px] font-semibold text-white leading-none">
            {language === 'pt-BR' ? 'PT' : 'ES'}
          </span>
        </button>
      </div>

      <div
        className="flex-1 flex flex-col items-center px-5 pt-14 select-none relative z-10"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'pan-y' }}
      >
        {/* Progress dots clicáveis */}
        <div className="flex gap-1.5 mb-8">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className="rounded-full transition-all duration-300 active:scale-90"
              style={{
                width: i === step ? 22 : 6,
                height: 3,
                background: 'white',
                opacity: i === step ? 1 : 0.35,
              }}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>

        {/* Hero carrossel — auto-rotação + swipe */}
        <div className="flex-1 flex flex-col items-center justify-center text-center max-w-xs pb-4 w-full">
          <div key={step} className="flex flex-col items-center animate-fade-in">
            <div className="w-[68px] h-[68px] rounded-[20px] flex items-center justify-center mb-5 bg-white/20 border border-white/30 backdrop-blur-md shadow-[0_14px_30px_rgba(4,80,62,0.28)] transition-all duration-500">
              {slide.icon}
            </div>
            <h1 className="text-[22px] font-black text-white leading-tight tracking-tight whitespace-pre-line mb-3 on-marble">
              {t(slide.title)}
            </h1>
            <p className="text-white/95 text-[13.5px] leading-relaxed on-marble">
              {t(slide.subtitle)}
            </p>
          </div>
        </div>

        {/* Setas de navegação — posicionadas nas bordas, fora do texto, centralizadas verticalmente */}
        <button
          onClick={goPrevSlide}
          aria-label="Slide anterior"
          className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 backdrop-blur-md border border-white/30 text-white flex items-center justify-center hover:bg-white/30 hover:scale-105 active:scale-95 transition-all duration-200"
        >
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>
        <button
          onClick={goNextSlide}
          aria-label="Próximo slide"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 backdrop-blur-md border border-white/30 text-white flex items-center justify-center hover:bg-white/30 hover:scale-105 active:scale-95 transition-all duration-200"
        >
          <ChevronRight size={18} strokeWidth={2.5} />
        </button>
      </div>

      {/* Buttons — sempre visíveis */}
      <div className="relative z-10 px-5 pb-8 pt-3 space-y-2" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
        <button onClick={handleNext} className="w-full py-3.5 rounded-2xl bg-white text-emerald-700 text-sm font-black hover:bg-emerald-50 transition active:scale-[0.98] shadow-[0_10px_26px_rgba(4,80,62,0.3)] flex items-center justify-center gap-1.5">
          {t('Continuar')} <ChevronRight size={16} strokeWidth={2.75} />
        </button>
        <button onClick={() => setMode('login')} className="w-full py-3 rounded-2xl bg-white/15 border border-white/30 text-white text-sm font-semibold hover:bg-white/25 transition active:scale-[0.98]">
          {t('Já tenho conta — Entrar')}
        </button>
        <button onClick={handleGuestLogin}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-white/80 hover:text-white transition text-[12.5px] font-medium">
          <UserCircle2 size={14} />
          {t('Entrar como visitante')}
        </button>
      </div>
    </div>
  );
}
