import { useState, useMemo, useEffect, useRef } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { X } from 'lucide-react';
import type { ProfileType } from '../types';
import { PROFILE_TYPE_LABELS } from '../types';
import { registerUser, loginUser, getUsers } from '../lib/db';
import { useApp } from '../contexts/AppContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import MarbleBackground from '../components/MarbleBackground';
import JadePlate from '../components/JadePlate';
import { signUp as sbSignUp, signIn as sbSignIn, resetPassword as sbResetPassword } from '../lib/supabaseAuth';

/* ---------------------------------------------------------------------------
 * Ícones do bloco Acesso — traço 1.5, sem preenchimento, desenhados com os
 * mesmos paths do design (chevron, olho, check).
 * ------------------------------------------------------------------------- */
function ChevronIcon({ dir, size }: { dir: 'left' | 'right'; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  );
}

function CheckMark({ size, strokeWidth, className = '' }: { size: number; strokeWidth: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Olho de mostrar/ocultar senha: botão de 40px encaixado a 6px da borda do campo de 52px. */
function RevealToggle({ shown, onToggle, label }: { shown: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-pressed={shown}
      className="absolute right-1.5 top-1.5 w-10 h-10 p-0 rounded-full bg-transparent flex items-center justify-center text-slate-500 hover:text-blue-600 transition-colors"
    >
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
        <circle cx="12" cy="12" r="2.8" />
        {shown && <path d="M4 4l16 16" />}
      </svg>
    </button>
  );
}

/**
 * Título em duas linhas com peso misto (300 / 600). A chave traz a quebra
 * em "\n" ("Entrar na\nsua conta"); sem quebra, a 1ª palavra vai na linha leve.
 */
function splitTitle(text: string): { light?: string; bold: string } {
  const br = text.indexOf('\n');
  if (br !== -1) return { light: text.slice(0, br), bold: text.slice(br + 1) };
  const i = text.indexOf(' ');
  return i === -1 ? { bold: text } : { light: text.slice(0, i), bold: text.slice(i + 1) };
}

/* Campo: fundo papel, filete, 52px, texto 15/400, placeholder #5F736D. */
const FIELD = 'input-field placeholder:text-slate-500 placeholder:font-normal';

/* Botão primário / secundário / terciário do bloco (52 · 50–52 · só texto). */
const BTN_SECONDARY = 'btn-secondary h-[52px] text-[14px]';
const BTN_TERTIARY = 'w-full h-11 bg-transparent text-[13.5px] font-normal text-slate-500 hover:text-slate-800 transition-colors';

/* Pedra do onboarding: a MESMA placa, só o enquadramento muda (transição de 1,2 s). */
const SLIDES = [
  {
    title: 'Controle seus plantões em segundos.',
    text: 'Cadastre, repita e organize toda sua escala num só lugar — feito para a rotina do médico plantonista.',
    frame: '[&_.marble-img]:object-[28%_30%]',
  },
  {
    title: 'Saiba quanto você tem a receber.',
    text: 'Ganhos, pagamentos pendentes e atrasos num só lugar. Sem descobrir surpresa no fim do mês.',
    frame: '[&_.marble-img]:object-[50%_46%]',
  },
  {
    title: 'Escalas recorrentes e relatório pronto.',
    text: '12x36, 24x72 ou mensal em um toque, conferência de divergências e o mês fechado para o contador.',
    frame: '[&_.marble-img]:object-[72%_60%]',
  },
];

/* Véu que escurece para baixo (onboarding) e véu da tela de conta criada. */
const VEIL_ONBOARDING = 'bg-[linear-gradient(178deg,rgba(6,48,39,.42)_0%,rgba(6,48,39,.1)_34%,rgba(6,48,39,.56)_72%,rgba(6,48,39,.82)_100%)]';
const VEIL_CREATED = 'bg-[linear-gradient(170deg,rgba(6,48,39,.44),rgba(6,48,39,.66))]';

const profileOptions: ProfileType[] = ['residente', 'plantonista', 'especialista', 'anestesista', 'cirurgiao', 'intensivista', 'urgencista', 'outro'];
const goalOptions = ['Organizar minha escala', 'Controlar pagamentos', 'Conferir atrasos', 'Gerar relatórios'];
const specialties = ['Medicina de Urgência', 'Anestesiologia', 'Cirurgia Geral', 'Medicina Intensiva', 'Pediatria', 'Clínica Médica', 'Ortopedia', 'Ginecologia', 'Cardiologia', 'Neurologia', 'Outra'];

interface PasswordRule {
  label: string;
  test: (pw: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: 'Mínimo 8 caracteres', test: pw => pw.length >= 8 },
  { label: 'Letra maiúscula', test: pw => /[A-Z]/.test(pw) },
  { label: 'Letra minúscula', test: pw => /[a-z]/.test(pw) },
  { label: 'Um número', test: pw => /[0-9]/.test(pw) },
  { label: 'Um símbolo', test: pw => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw) },
];

/* Rótulo por nº de regras cumpridas (0–5). Cor: terracota abaixo de 3, jade de 3 em diante. */
const STRENGTH_LABELS = ['Muito fraca', 'Fraca', 'Aceitável', 'Boa', 'Forte', 'Muito forte'];

const RESEND_COOLDOWN = 60;

type Mode = 'onboarding' | 'login' | 'register' | 'created';

interface LoginNotice {
  tone: 'warn' | 'info';
  title: string;
  text: string;
}

export default function OnboardingScreen() {
  const { login } = useApp();
  const { language, setLanguage, t } = useLanguage();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode>('onboarding');

  // Register form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
  const [loginNotice, setLoginNotice] = useState<LoginNotice | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  // Cadastro (Supabase): erro em aviso flutuante; sucesso vira a tela "Conta criada"
  const [signupError, setSignupError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [createdEmail, setCreatedEmail] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [resendBusy, setResendBusy] = useState(false);

  // O aviso de erro do cadastro flutua no topo e se dispensa sozinho.
  useEffect(() => {
    if (!signupError) return;
    const timer = setTimeout(() => setSignupError(null), 7000);
    return () => clearTimeout(timer);
  }, [signupError]);

  // Contagem para reenviar o e-mail de confirmação.
  useEffect(() => {
    if (mode !== 'created' || resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [mode, resendIn]);

  // Password strength
  const passwordChecks = useMemo(() =>
    PASSWORD_RULES.map(rule => ({ ...rule, passed: rule.test(password) })),
    [password]
  );
  const allPasswordChecksPassed = passwordChecks.every(c => c.passed);
  const passedCount = passwordChecks.filter(c => c.passed).length;
  const strengthOk = passedCount >= 3;

  // Auto-rotação do carrossel de slides (15s por slide × 3 slides = 45s total, ciclo infinito)
  useEffect(() => {
    if (mode !== 'onboarding') return;
    const timer = setInterval(() => {
      setStep(s => (s + 1) % SLIDES.length);
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
    setStep(s => (s + 1) % SLIDES.length);
  }
  function goPrevSlide() {
    setStep(s => (s - 1 + SLIDES.length) % SLIDES.length);
  }

  function handleNext() {
    setMode('register');
  }

  function toggleGoal(g: string) {
    setGoals(prev =>
      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
    );
  }

  function clearError(key: string) {
    setErrors(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function scrollFormToTop() {
    requestAnimationFrame(() => {
      const scroller = document.querySelector('.app-container .overflow-y-auto');
      scroller?.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function validateStep1() {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Informe seu nome para continuar.';
    if (!email.trim() || !email.includes('@')) errs.email = 'Esse e-mail não parece válido.';
    if (!allPasswordChecksPassed) errs.password = 'Use uma senha com 8 caracteres, maiúscula, minúscula, número e símbolo.';
    if (password !== confirmPassword) errs.confirmPassword = 'As senhas não coincidem.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateStep2() {
    const errs: Record<string, string> = {};
    if (!specialty.trim()) errs.specialty = 'Escolha sua especialidade para continuar.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleRegisterNext() {
    if (registerStep === 0) {
      if (validateStep1()) {
        setRegisterStep(1);
        // scroll to top do form ao avançar
        scrollFormToTop();
      }
    } else {
      if (!validateStep2()) return;

      // ---- Modo Supabase: cadastro real (o AppContext detecta a sessão e entra) ----
      if (isSupabaseConfigured) {
        if (authBusy) return;
        setSignupError(null);
        setAuthBusy(true);
        const normalizedEmail = email.trim().toLowerCase();
        sbSignUp({
          email: normalizedEmail,
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
              ? t('Este e-mail já tem conta. Volte e faça login.')
              : error.message;
            setSignupError(msg);
            return;
          }
          if (!data.session) {
            // Sem Auto Confirm: precisa confirmar o e-mail antes de logar → tela "Conta criada".
            setCreatedEmail(normalizedEmail);
            setResendIn(RESEND_COOLDOWN);
            setMode('created');
          }
          // Com sessão, o listener do AppContext carrega o usuário automaticamente.
        }).catch((e) => setSignupError((e as Error).message))
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
      scrollFormToTop();
    } else {
      setMode('onboarding');
    }
  }

  function handleLogin() {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginNotice({
        tone: 'warn',
        title: t('Faltam dados para entrar'),
        text: t('Preencha e-mail e senha cadastrados para continuar.'),
      });
      return;
    }
    const wrongCredentials: LoginNotice = {
      tone: 'warn',
      title: t('E-mail ou senha incorretos'),
      text: t('Confira os dados ou use "Esqueci minha senha" para receber um link de acesso.'),
    };

    // ---- Modo Supabase: login real (o AppContext detecta a sessão e entra) ----
    if (isSupabaseConfigured) {
      setLoginNotice(null);
      sbSignIn(loginEmail.trim(), loginPassword).then(({ error }) => {
        if (!error) return; // Em caso de sucesso, o listener do AppContext carrega o usuário.
        if (/not confirmed/i.test(error.message)) {
          setLoginNotice({
            tone: 'warn',
            title: t('Confirme seu e-mail'),
            text: t('Abra o link que enviamos no cadastro para liberar o acesso.'),
          });
        } else {
          setLoginNotice(wrongCredentials);
        }
      }).catch(() => setLoginNotice({
        tone: 'warn',
        title: t('Não foi possível entrar'),
        text: t('Verifique sua conexão e tente novamente.'),
      }));
      return;
    }

    // ---- Modo localStorage (fallback) ----
    const user = loginUser(loginEmail.trim(), loginPassword);
    if (user) {
      login(user, false);
    } else {
      setLoginNotice(wrongCredentials);
    }
  }

  function handleForgotPassword() {
    const mail = loginEmail.trim().toLowerCase();
    if (!mail || !mail.includes('@')) {
      setLoginNotice({
        tone: 'warn',
        title: t('Informe seu e-mail'),
        text: t('Digite o e-mail cadastrado para receber o link de acesso.'),
      });
      return;
    }
    if (!isSupabaseConfigured) {
      setLoginNotice({
        tone: 'warn',
        title: t('Recuperação indisponível'),
        text: t('Neste modo a conta fica só neste aparelho. Crie uma nova conta para continuar.'),
      });
      return;
    }
    if (resetBusy) return;
    setResetBusy(true);
    const failed: LoginNotice = {
      tone: 'warn',
      title: t('Não foi possível enviar o link'),
      text: t('Aguarde alguns instantes e tente novamente.'),
    };
    sbResetPassword(mail, window.location.origin)
      .then(({ error }) => {
        setLoginNotice(error ? failed : {
          tone: 'info',
          title: t('Link de acesso enviado'),
          text: `${t('Confira a caixa de entrada de')} ${mail}.`,
        });
      })
      .catch(() => setLoginNotice(failed))
      .finally(() => setResetBusy(false));
  }

  function handleResendConfirmation() {
    if (resendIn > 0 || resendBusy || !createdEmail) return;
    setResendBusy(true);
    supabase.auth.resend({ type: 'signup', email: createdEmail })
      .then(({ error }) => {
        if (error) { setSignupError(error.message); return; }
        setResendIn(RESEND_COOLDOWN);
      })
      .catch((e) => setSignupError((e as Error).message))
      .finally(() => setResendBusy(false));
  }

  function goToLoginFromCreated() {
    setLoginEmail(createdEmail);
    setLoginPassword('');
    setLoginNotice(null);
    setPassword('');
    setConfirmPassword('');
    setRegisterStep(0);
    setErrors({});
    setMode('login');
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

  /* Aviso flutuante de erro do cadastro — mesma peça de "atenção" (régua terracota). */
  const signupToast = signupError && (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[80] w-[calc(100%-32px)] max-w-[398px] animate-scale-in"
      role="alert"
    >
      {/* bg-white por trás: no escuro o .notice é translúcido, e o aviso flutua sobre o formulário */}
      <div className="bg-white shadow-lg">
        <div className="notice notice-warn items-start !pr-2">
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] font-semibold text-slate-900">{t('Não foi possível criar a conta')}</span>
            <span className="block mt-[3px] text-[12.5px] font-normal leading-[1.5] text-slate-500">{signupError}</span>
          </span>
          <button
            onClick={() => setSignupError(null)}
            className="icon-btn -my-1.5 w-8 h-8 flex items-center justify-center shrink-0"
            title={t('Fechar')}
            aria-label={t('Fechar')}
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );

  /* Botão voltar de vidro + linha de contexto (13.5/500 sobre a pedra). */
  function plateTop(onBack: () => void, eyebrow: string, eyebrowMargin: string) {
    return (
      <>
        <button
          onClick={onBack}
          className="glass-icon-btn"
          title={t('Voltar')}
          aria-label={t('Voltar')}
        >
          <ChevronIcon dir="left" size={17} />
        </button>
        <p className={`${eyebrowMargin} text-[13.5px] font-medium text-white/[0.82]`}>{eyebrow}</p>
      </>
    );
  }

  if (mode === 'created') {
    const createdTitle = splitTitle(t('Conta criada.\nConfirme seu e-mail.'));
    return (
      <div className="app-container relative flex items-center justify-center min-h-dvh overflow-hidden p-5 [&_.marble-img]:object-[46%_40%]">
        {signupToast}
        <MarbleBackground contrast={false} />
        <div className={`absolute inset-0 ${VEIL_CREATED}`} aria-hidden="true" />

        <div className="relative w-full bg-white rounded-[28px] px-6 pt-8 pb-6 shadow-xl animate-scale-in" role="status">
          <span className="flex w-12 h-12 rounded-full bg-[#E9F2EF] dark:bg-[rgba(18,168,127,.14)] items-center justify-center text-blue-600">
            <CheckMark size={22} strokeWidth={1.8} />
          </span>
          <h2 className="mt-6 text-[26px] font-light leading-[1.12] tracking-[-0.035em] text-slate-900">
            {createdTitle.light}
            {createdTitle.light && <br />}
            <span className="font-semibold">{createdTitle.bold}</span>
          </h2>
          <p className="mt-3.5 text-[14.5px] font-normal leading-[1.6] text-slate-600">
            {t('Enviamos um link para')}{' '}
            <strong className="font-semibold text-slate-900 break-words">{createdEmail}</strong>.{' '}
            {t('Confirme para liberar o acesso — leva menos de um minuto.')}
          </p>
          <div className="mt-6 pt-5 border-t border-slate-200">
            <p className="text-[12.5px] font-normal leading-[1.55] text-slate-500">
              {t('Não chegou? Veja o spam ou reenvie em 60 segundos.')}
            </p>
          </div>
          <button onClick={goToLoginFromCreated} className="btn-primary mt-[22px]">
            {t('Ir para o login')}
          </button>
          <button
            onClick={handleResendConfirmation}
            disabled={resendIn > 0 || resendBusy}
            className={`${BTN_TERTIARY} !h-[46px] mt-1.5 tabular-nums disabled:cursor-default disabled:hover:text-slate-500`}
          >
            {resendIn > 0
              ? t('Reenviar e-mail em {s}s').replace('{s}', String(resendIn))
              : t('Reenviar e-mail')}
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'login') {
    const loginTitle = splitTitle(t('Entrar na\nsua conta'));
    const noticeWarn = loginNotice?.tone === 'warn';
    return (
      // Altura travada na viewport: quem rola é o <main>, não o documento.
      <div className="app-container flex flex-col h-dvh min-h-0 bg-white">
        {/* A folha ocupa o resto da tela e os botões descem para o fim dela, como no design */}
        <main className="flex-1 overflow-y-auto hide-scrollbar flex flex-col">
          <JadePlate
            frame="hero"
            top={plateTop(() => setMode('onboarding'), t('Acesso'), 'mt-[30px]')}
            titleLight={loginTitle.light}
            titleBold={loginTitle.bold}
            plateClassName="!pb-[52px] shrink-0"
            sheetClassName="!pb-[calc(34px_+_env(safe-area-inset-bottom,0px))] min-h-[520px] flex-[1_0_auto] flex flex-col"
          >
            <div>
              <label htmlFor="login-email" className="input-label">{t('E-mail')}</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={loginEmail}
                onChange={e => { setLoginEmail(e.target.value); setLoginNotice(null); }}
                placeholder="seu@email.com"
                className={FIELD}
              />
            </div>
            <div className="mt-[18px]">
              <label htmlFor="login-password" className="input-label">{t('Senha')}</label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showLoginPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={e => { setLoginPassword(e.target.value); setLoginNotice(null); }}
                  placeholder={t('Sua senha')}
                  className={`${FIELD} pr-12`}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                />
                <RevealToggle
                  shown={showLoginPassword}
                  onToggle={() => setShowLoginPassword(v => !v)}
                  label={t('Mostrar senha')}
                />
              </div>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetBusy}
                className="mt-3 p-0 bg-transparent text-[13px] font-normal text-slate-500 border-b border-[#D6DFDB] dark:border-[#295045] hover:text-blue-600 hover:border-blue-600 transition-colors disabled:opacity-60"
              >
                {t('Esqueci minha senha')}
              </button>
            </div>

            {loginNotice && (
              <div
                className={`notice ${noticeWarn ? 'notice-warn' : ''} mt-5`}
                role={noticeWarn ? 'alert' : 'status'}
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-semibold text-slate-900">{loginNotice.title}</span>
                  <span className="block mt-[3px] text-[12.5px] font-normal leading-[1.5] text-slate-500 break-words">
                    {loginNotice.text}
                  </span>
                </span>
              </div>
            )}

            <div className="mt-auto pt-[34px]">
              <button onClick={handleLogin} className="btn-primary">
                {t('Entrar')}
              </button>
              <button onClick={() => setMode('register')} className="btn-secondary h-[50px] text-[14px] mt-2.5">
                {t('Criar nova conta')}
              </button>
              <button onClick={handleGuestLogin} className={`${BTN_TERTIARY} mt-1`}>
                {t('Entrar como visitante')}
              </button>
            </div>
          </JadePlate>
        </main>
      </div>
    );
  }

  if (mode === 'register') {
    const registerTitle = splitTitle(registerStep === 0 ? t('Vamos\npersonalizar') : t('Seu perfil\nmédico'));
    const confirmMismatch = confirmPassword.length > 0 && password !== confirmPassword;
    // Validação ao avançar com a confirmação ainda vazia também marca o campo.
    const confirmInvalid = confirmMismatch || (!!errors.confirmPassword && confirmPassword.length === 0);
    return (
      // Altura travada na viewport: o <main> rola e o scroll-to-top das etapas funciona.
      <div className="app-container flex flex-col h-dvh min-h-0 bg-white">
        {signupToast}

        <main className="flex-1 overflow-y-auto hide-scrollbar">
          <JadePlate
            frame={registerStep === 0 ? 'hero' : 'alt'}
            top={plateTop(
              handleRegisterBack,
              registerStep === 0 ? t('Etapa 1 de 2 · Identificação') : t('Etapa 2 de 2 · Atuação'),
              'mt-[26px]',
            )}
            titleLight={registerTitle.light}
            titleBold={registerTitle.bold}
            plateExtra={
              /* Progresso — 2 etapas, filetes de 2px sobre a pedra */
              <div className="flex gap-2 mt-6" aria-hidden="true">
                {[0, 1].map(i => (
                  <span
                    key={i}
                    className={`flex-1 h-[2px] rounded-[2px] ${i <= registerStep ? 'bg-white/95' : 'bg-white/[0.28]'}`}
                  />
                ))}
              </div>
            }
            /* Sem bottom-nav e sem rodapé fixo: as ações fecham a folha */
            sheetClassName="!pb-[calc(34px_+_env(safe-area-inset-bottom,0px))]"
          >

            {/* ============ ETAPA 1 — Identificação + Senha ============ */}
            {registerStep === 0 && (<>

              <div>
                <label htmlFor="reg-name" className="input-label">{t('Como podemos te chamar')}</label>
                <input
                  id="reg-name"
                  autoComplete="name"
                  value={name}
                  onChange={e => { setName(e.target.value); clearError('name'); }}
                  placeholder={t('Seu nome')}
                  aria-invalid={!!errors.name}
                  className={FIELD}
                />
                {errors.name && <p className="input-error">{t(errors.name)}</p>}
              </div>

              <div className="mt-[18px]">
                <label htmlFor="reg-email" className="input-label">{t('E-mail')}</label>
                <input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); clearError('email'); }}
                  placeholder="seu@email.com"
                  aria-invalid={!!errors.email}
                  className={FIELD}
                />
                {errors.email && <p className="input-error">{t(errors.email)}</p>}
              </div>

              <div className="mt-[18px]">
                <label htmlFor="reg-whatsapp" className="input-label flex items-baseline gap-2">
                  WhatsApp <span className="text-[12px] text-slate-500">{t('opcional')}</span>
                </label>
                <input
                  id="reg-whatsapp"
                  inputMode="tel"
                  autoComplete="tel"
                  value={whatsapp}
                  onChange={e => setWhatsapp(e.target.value)}
                  placeholder="(11) 99999-0001"
                  className={FIELD}
                />
              </div>

              <div className="section-rule mt-[30px] mb-[22px]"><span>{t('Senha de acesso')}</span></div>

              <div>
                <label htmlFor="reg-password" className="input-label">{t('Criar senha')}</label>
                <div className="relative">
                  <input
                    id="reg-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); clearError('password'); }}
                    placeholder={t('Mínimo 8 caracteres')}
                    aria-invalid={!!errors.password}
                    className={`${FIELD} pr-12`}
                  />
                  <RevealToggle
                    shown={showPassword}
                    onToggle={() => setShowPassword(v => !v)}
                    label={t('Mostrar senha')}
                  />
                </div>

                {password.length > 0 && (
                  <div className="mt-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[12.5px] font-normal text-slate-500">{t('Força da senha')}</span>
                      <span className={`text-[13px] font-semibold ${strengthOk ? 'text-blue-600' : 'text-red-600'}`}>
                        {t(STRENGTH_LABELS[passedCount])}
                      </span>
                    </div>
                    <div className="h-[2px] rounded-[2px] bg-slate-200 mt-2 overflow-hidden">
                      <div
                        className={`h-[2px] rounded-[2px] ${strengthOk ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-warning)]'}`}
                        style={{ width: `${(passedCount / PASSWORD_RULES.length) * 100}%` }}
                      />
                    </div>
                    <ul className="grid grid-cols-2 gap-x-3.5 gap-y-1.5 mt-3.5">
                      {passwordChecks.map(check => (
                        <li key={check.label} className="flex items-center gap-2">
                          {check.passed ? (
                            <>
                              <CheckMark size={14} strokeWidth={2.2} className="shrink-0 text-blue-600" />
                              <span className="text-[12px] font-medium leading-[1.3] text-blue-600">{t(check.label)}</span>
                            </>
                          ) : (
                            <>
                              <span className="w-3.5 h-3.5 shrink-0 rounded-full border border-slate-300" />
                              <span className="text-[12px] font-normal leading-[1.3] text-slate-500">{t(check.label)}</span>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {errors.password && <p className="input-error">{t(errors.password)}</p>}
              </div>

              <div className="mt-[18px]">
                <label htmlFor="reg-confirm" className="input-label">{t('Confirmar senha')}</label>
                {/* Um só olho (no campo de cima) controla as duas senhas */}
                <input
                  id="reg-confirm"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); clearError('confirmPassword'); }}
                  placeholder={t('Repita a senha')}
                  aria-invalid={confirmInvalid}
                  className={FIELD}
                />
                {confirmInvalid && (
                  <p className="input-error">{t('As senhas não coincidem.')}</p>
                )}
                {confirmPassword.length > 0 && password === confirmPassword && (
                  <p className="mt-2 text-[12.5px] font-medium text-blue-600">{t('Senhas coincidem.')}</p>
                )}
              </div>

              <div className="flex gap-2.5 mt-8">
                <button onClick={handleRegisterBack} className={`${BTN_SECONDARY} flex-1 px-1.5`}>
                  {t('Voltar')}
                </button>
                <button onClick={handleRegisterNext} className="btn-primary flex-[2] px-1.5">
                  {t('Continuar')}
                </button>
              </div>
              <p className="mt-4 text-[12.5px] font-normal leading-[1.55] text-slate-500">
                {t('Seus dados de plantão ficam só na sua conta. Nada é compartilhado com hospitais ou operadoras.')}
              </p>

            </>)}

            {/* ============ ETAPA 2 — Especialidade + Atuação + Objetivos + CRM + Demo ============ */}
            {registerStep === 1 && (<>

              <div>
                <label htmlFor="reg-specialty" className="input-label">{t('Especialidade')}</label>
                <select
                  id="reg-specialty"
                  value={specialty}
                  onChange={e => { setSpecialty(e.target.value); clearError('specialty'); }}
                  aria-invalid={!!errors.specialty}
                  className="input-field appearance-none cursor-pointer"
                >
                  <option value="">{t('Selecione')}</option>
                  {specialties.map(s => <option key={s} value={s}>{t(s)}</option>)}
                </select>
                {errors.specialty && <p className="input-error">{t(errors.specialty)}</p>}
              </div>

              <div className="section-rule mt-[30px] mb-4"><span id="reg-profile-label">{t('Como você atua')}</span></div>
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby="reg-profile-label">
                {profileOptions.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProfile(p)}
                    aria-pressed={profile === p}
                    className="chip"
                  >
                    {t(PROFILE_TYPE_LABELS[p])}
                  </button>
                ))}
              </div>

              <div className="section-rule mt-[30px] mb-2"><span id="reg-goals-label">{t('O que você quer resolver')}</span></div>
              <p className="mb-4 text-[12.5px] font-normal text-slate-500">{t('Pode marcar mais de um.')}</p>
              <div role="group" aria-labelledby="reg-goals-label">
                {goalOptions.map(g => {
                  const sel = goals.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleGoal(g)}
                      aria-pressed={sel}
                      className="flex w-full items-center justify-between gap-3.5 py-4 border-b border-slate-200 bg-transparent text-left hover:bg-slate-50 transition-colors"
                    >
                      <span className={`text-[14.5px] ${sel ? 'font-semibold text-slate-900' : 'font-normal text-slate-600'}`}>
                        {t(g)}
                      </span>
                      {sel
                        ? <CheckMark size={18} strokeWidth={1.8} className="shrink-0 text-blue-600" />
                        : <span className="w-[18px] h-[18px] shrink-0 rounded-full border border-slate-300" />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-[26px]">
                <label htmlFor="reg-crm" className="input-label flex items-baseline gap-2">
                  CRM <span className="text-[12px] text-slate-500">{t('opcional')}</span>
                </label>
                <input
                  id="reg-crm"
                  value={crm}
                  onChange={e => setCrm(e.target.value)}
                  placeholder="CRM/SP 000000"
                  className={FIELD}
                />
              </div>

              {/* Dados de exemplo — caixa papel de raio 20 com trilho 44×26 */}
              <button
                type="button"
                role="switch"
                aria-checked={withDemo}
                onClick={() => setWithDemo(v => !v)}
                className="flex w-full items-center gap-3.5 mt-[22px] p-[18px] rounded-[20px] border border-slate-200 bg-slate-50 text-left hover:border-blue-600 transition-colors"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-medium text-slate-900">
                    {t('Começar com dados de exemplo')}
                  </span>
                  <span className="block mt-[3px] text-[12.5px] font-normal leading-[1.5] text-slate-500">
                    {t('Três locais e um mês de plantões já preenchidos, para você ver o app cheio. Dá para apagar depois.')}
                  </span>
                </span>
                <span
                  className={`relative w-11 h-[26px] shrink-0 rounded-full transition-colors duration-200 ${withDemo ? 'bg-[var(--color-primary)]' : 'bg-[#D6DFDB] dark:bg-[#295045]'}`}
                >
                  {/* bg-[#fff] e não bg-white: bg-white é remapeado para verde-escuro no modo escuro */}
                  <span
                    className={`absolute top-[3px] w-5 h-5 rounded-full bg-[#fff] shadow-[0_1px_3px_rgba(12,42,36,.2)] transition-[left] duration-200 ${withDemo ? 'left-[21px]' : 'left-[3px]'}`}
                  />
                </span>
              </button>

              <div className="flex gap-2.5 mt-[30px]">
                <button onClick={handleRegisterBack} className={`${BTN_SECONDARY} flex-1 px-1.5`}>
                  {t('Voltar')}
                </button>
                <button onClick={handleRegisterNext} disabled={authBusy} className="btn-primary flex-[2] px-1.5 disabled:opacity-60">
                  {authBusy ? t('Criando conta...') : t('Criar conta')}
                </button>
              </div>

            </>)}
          </JadePlate>
        </main>
      </div>
    );
  }

  // ONBOARDING — pedra em tela cheia, véu que escurece para baixo, texto ancorado embaixo à esquerda
  const slide = SLIDES[step];
  return (
    <div
      className={`app-container relative flex flex-col min-h-dvh overflow-hidden select-none [&_.marble-img]:transition-[object-position] [&_.marble-img]:duration-[1200ms] [&_.marble-img]:ease-[ease] ${slide.frame}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'pan-y' }}
    >
      {/* Pedra parada — só o enquadramento muda entre os slides */}
      <MarbleBackground contrast={false} />
      <div className={`absolute inset-0 ${VEIL_ONBOARDING}`} aria-hidden="true" />

      {/* Topo: três filetes de 22×2 (esq.) + idioma (dir.) */}
      <div className="relative flex items-center justify-between gap-4 px-6 pt-[26px]">
        <div className="flex gap-1.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className="h-7 p-0 bg-transparent flex items-center"
              title={`${t('Slide')} ${i + 1}`}
              aria-label={`${t('Slide')} ${i + 1}`}
              aria-current={i === step ? 'step' : undefined}
            >
              <span
                className={`block w-[22px] h-[2px] rounded-[2px] transition-colors duration-300 ${i === step ? 'bg-white/95' : 'bg-white/[0.28]'}`}
              />
            </button>
          ))}
        </div>

        <button
          onClick={() => setLanguage(language === 'pt-BR' ? 'es-LATAM' : 'pt-BR')}
          className="inline-flex items-center gap-[7px] px-[11px] py-1.5 rounded-full border border-white/30 bg-white/[0.14] backdrop-blur-[8px] text-white text-[12px] font-medium hover:bg-white/[0.22] transition-colors"
          title={language === 'pt-BR' ? 'Cambiar a español' : 'Mudar para português'}
          aria-label={language === 'pt-BR' ? 'Cambiar a español' : 'Mudar para português'}
        >
          {language === 'pt-BR' ? 'PT · BR' : 'ES · LATAM'}
        </button>
      </div>

      {/* Base: passo, título 34/300, texto, linha de ação e dois links */}
      <div
        className="relative mt-auto px-6"
        style={{ paddingBottom: 'calc(26px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div key={step} className="animate-fade-in">
          <p className="mb-4 text-[13.5px] font-medium text-white/[0.78] tabular-nums">
            {t('Passo {n} de {total}').replace('{n}', String(step + 1)).replace('{total}', String(SLIDES.length))}
          </p>
          <h2 className="max-w-[300px] text-[34px] font-light leading-[1.08] tracking-[-0.035em] text-white text-pretty">
            {t(slide.title)}
          </h2>
          <p className="mt-4 max-w-[308px] text-[15px] font-normal leading-[1.55] text-white/[0.86] text-pretty">
            {t(slide.text)}
          </p>
        </div>

        <div className="flex gap-2.5 mt-[26px]">
          <button
            onClick={goPrevSlide}
            title={t('Slide anterior')}
            aria-label={t('Slide anterior')}
            className="w-12 h-12 shrink-0 p-0 rounded-xl border border-white/30 bg-white/[0.12] backdrop-blur-[10px] text-white flex items-center justify-center hover:bg-white/[0.24] transition-colors"
          >
            <ChevronIcon dir="left" size={18} />
          </button>
          <button
            onClick={goNextSlide}
            title={t('Próximo slide')}
            aria-label={t('Próximo slide')}
            className="w-12 h-12 shrink-0 p-0 rounded-xl border border-white/30 bg-white/[0.12] backdrop-blur-[10px] text-white flex items-center justify-center hover:bg-white/[0.24] transition-colors"
          >
            <ChevronIcon dir="right" size={18} />
          </button>
          {/* Branco sólido fixo (bg-[#fff]/text-[#0A4739]): bg-white é remapeado no escuro */}
          <button
            onClick={handleNext}
            className="flex-1 h-12 rounded-xl bg-[#fff] text-[#0A4739] text-[14.5px] font-semibold tracking-[-0.01em] hover:bg-[#EAF3F0] transition-colors"
          >
            {t('Criar minha conta')}
          </button>
        </div>

        <div className="flex items-center gap-5 mt-[18px]">
          <button
            onClick={() => setMode('login')}
            className="p-0 bg-transparent text-white text-[13.5px] font-medium border-b border-white/45 hover:border-white transition-colors"
          >
            {t('Já tenho conta')}
          </button>
          <button
            onClick={handleGuestLogin}
            className="p-0 bg-transparent text-white/[0.76] text-[13.5px] font-normal hover:text-white transition-colors"
          >
            {t('Ver como visitante')}
          </button>
        </div>
      </div>
    </div>
  );
}
