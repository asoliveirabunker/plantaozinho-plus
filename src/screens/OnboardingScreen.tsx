import { useState, useMemo } from 'react';
import { ChevronRight, ChevronLeft, Calendar, Wallet, RefreshCw, Stethoscope, Eye, EyeOff, Check, X, Lock, UserCircle2 } from 'lucide-react';
import type { ProfileType } from '../types';
import { PROFILE_TYPE_LABELS } from '../types';
import { registerUser, loginUser, getUsers } from '../lib/db';
import { useApp } from '../contexts/AppContext';

const slides = [
  {
    icon: <Calendar size={40} className="text-white" />,
    iconBg: '#1877F2',
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
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState('');

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

  function handleNext() {
    if (step < slides.length - 1) setStep(s => s + 1);
    else setMode('register');
  }

  function handleBack() {
    if (step > 0) setStep(s => s - 1);
    else if (mode !== 'onboarding') setMode('onboarding');
  }

  function toggleGoal(g: string) {
    setGoals(prev =>
      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
    );
  }

  function validateRegister() {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Nome obrigatório';
    if (!email.trim() || !email.includes('@')) errs.email = 'E-mail inválido';
    if (!specialty.trim()) errs.specialty = 'Especialidade obrigatória';
    if (!allPasswordChecksPassed) errs.password = 'A senha não atende todos os requisitos';
    if (password !== confirmPassword) errs.confirmPassword = 'As senhas não coincidem';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleRegister() {
    if (!validateRegister()) return;
    const user = registerUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      specialty,
      profile_type: profile,
      subscription_plan: 'free',
      whatsapp,
      goals,
      onboarding_completed: true,
    });
    login(user, withDemo);
  }

  function handleLogin() {
    if (!loginEmail.trim()) { setLoginError('Informe seu e-mail'); return; }
    if (!loginPassword.trim()) { setLoginError('Informe sua senha'); return; }
    const user = loginUser(loginEmail.trim(), loginPassword);
    if (user) {
      login(user, false);
    } else {
      setLoginError('E-mail ou senha incorretos.');
    }
  }

  function handleGuestLogin() {
    // Reuse an existing guest if it already exists (keeps demo data between sessions)
    const existing = getUsers().find(u => u.email === 'visitante@plantaozinho.app');
    if (existing) {
      login(existing, false);
      return;
    }
    const guest = registerUser({
      name: 'Visitante',
      email: 'visitante@plantaozinho.app',
      password: '',
      specialty: 'Medicina de Urgência',
      profile_type: 'plantonista',
      subscription_plan: 'free',
      whatsapp: '',
      goals: ['Organizar minha escala', 'Controlar pagamentos'],
      onboarding_completed: true,
      tax_regime: 'Simples Nacional',
      tax_rate: 6,
    });
    login(guest, true);
  }

  // ---- VIEWS ----

  if (mode === 'login') {
    return (
      <div className="app-container flex flex-col min-h-screen bg-white">
        <div className="flex-1 flex flex-col px-6 pt-16">
          <button onClick={() => setMode('onboarding')} className="flex items-center gap-1 text-blue-600 font-medium mb-8">
            <ChevronLeft size={20} />
            Voltar
          </button>
          <div className="mb-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6" style={{ background: '#1877F2' }}>
              <Calendar size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Entrar na sua conta</h1>
            <p className="text-gray-500 mt-2">Digite o e-mail e senha cadastrados.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="input-label">E-mail</label>
              <input
                type="email"
                value={loginEmail}
                onChange={e => { setLoginEmail(e.target.value); setLoginError(''); }}
                placeholder="seu@email.com"
                className="input-field"
              />
            </div>
            <div>
              <label className="input-label">Senha</label>
              <div className="relative">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={e => { setLoginPassword(e.target.value); setLoginError(''); }}
                  placeholder="Sua senha"
                  className="input-field !pr-10"
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
            {loginError && <p className="text-red-500 text-sm">{loginError}</p>}
          </div>
        </div>
        <div className="px-6 pb-10 pt-4">
          <button onClick={handleLogin} className="btn-primary mb-3">
            Entrar
          </button>
          <button onClick={() => setMode('register')} className="btn-secondary mb-3">
            Criar nova conta
          </button>
          <button
            onClick={handleGuestLogin}
            className="w-full flex items-center justify-center gap-2 py-3 text-slate-500 hover:text-slate-800 transition text-sm font-medium"
          >
            <UserCircle2 size={16} />
            Entrar como visitante
          </button>
          <p className="text-center text-[11px] text-slate-400 mt-1.5 px-4 leading-snug">
            Acesse com dados de demonstração — sem precisar criar conta.
          </p>
        </div>
      </div>
    );
  }

  if (mode === 'register') {
    return (
      <div className="app-container flex flex-col min-h-screen bg-white">
        <div className="flex-1 overflow-y-auto px-6 pt-12 pb-32">
          {/* Progress */}
          <div className="flex gap-1.5 mb-8 justify-center">
            {[0,1,2,3].map(i => (
              <div key={i} className="h-1 rounded-full transition-all duration-300"
                style={{ width: i === 3 ? 24 : 8, background: '#1877F2', opacity: i <= 3 ? 1 : 0.2 }} />
            ))}
          </div>

          <div className="flex flex-col items-center mb-8 text-center">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
              <Stethoscope size={28} className="text-blue-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Vamos personalizar</h1>
            <p className="text-gray-500 text-sm mt-1">Algumas informações rápidas.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="input-label">Como podemos te chamar?</label>
              <input
                value={name} onChange={e => setName(e.target.value)}
                placeholder="Marcos" className="input-field"
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="input-label">E-mail</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com" className="input-field"
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>

            {/* Password with strength indicator */}
            <div>
              <label className="input-label flex items-center gap-1.5">
                <Lock size={12} className="text-slate-400" />
                Crie uma senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="input-field !pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Strength bar */}
              {password.length > 0 && (
                <div className="mt-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Força da senha</span>
                    <span className="text-[11px] font-bold" style={{ color: passwordStrength.color }}>
                      {passwordStrength.label}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${passwordStrength.percent}%`, background: passwordStrength.color }}
                    />
                  </div>

                  {/* Requirements checklist */}
                  <div className="grid grid-cols-1 gap-1">
                    {passwordChecks.map((check, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                          style={{
                            background: check.passed ? '#10b981' : '#f1f5f9',
                            border: check.passed ? 'none' : '1.5px solid #e2e8f0',
                          }}
                        >
                          {check.passed
                            ? <Check size={9} color="white" strokeWidth={3} />
                            : <X size={8} color="#cbd5e1" strokeWidth={2.5} />
                          }
                        </div>
                        <span
                          className="text-[11px] font-medium transition-colors"
                          style={{ color: check.passed ? '#10b981' : '#94a3b8' }}
                        >
                          {check.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
            </div>

            {/* Confirm password */}
            <div>
              <label className="input-label">Confirme a senha</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                  className="input-field !pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                  <X size={11} /> As senhas não coincidem
                </p>
              )}
              {confirmPassword.length > 0 && password === confirmPassword && password.length > 0 && (
                <p className="text-emerald-500 text-xs mt-1 flex items-center gap-1">
                  <Check size={11} /> Senhas coincidem
                </p>
              )}
              {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
            </div>

            <div>
              <label className="input-label">Especialidade</label>
              <select value={specialty} onChange={e => setSpecialty(e.target.value)} className="input-field">
                <option value="">Selecione...</option>
                {specialties.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {errors.specialty && <p className="text-red-500 text-xs mt-1">{errors.specialty}</p>}
            </div>
            <div>
              <label className="input-label">WhatsApp (para enviar relatórios)</label>
              <input
                value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
                placeholder="(11) 99999-0001" className="input-field"
              />
              <p className="text-gray-400 text-xs mt-1">Usamos para abrir sua conversa no WhatsApp ao exportar — opcional.</p>
            </div>
            <div>
              <label className="input-label">Perfil</label>
              <select value={profile} onChange={e => setProfile(e.target.value as ProfileType)} className="input-field">
                {profileOptions.map(p => <option key={p} value={p}>{PROFILE_TYPE_LABELS[p]}</option>)}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="input-label !mb-0">Principais objetivos</label>
                <span className="text-xs text-gray-400">Selecione um ou mais</span>
              </div>
              <div className="space-y-2">
                {goalOptions.map(g => (
                  <button
                    key={g}
                    onClick={() => toggleGoal(g)}
                    className="w-full text-left px-4 py-3 rounded-xl border-1.5 transition-all text-sm font-medium flex items-center justify-between"
                    style={{
                      borderColor: goals.includes(g) ? '#1877F2' : '#e5e7eb',
                      background: goals.includes(g) ? '#eff6ff' : 'white',
                      color: goals.includes(g) ? '#1877F2' : '#374151',
                    }}
                  >
                    {g}
                    {goals.includes(g) && (
                      <span className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                        <Check size={10} color="white" strokeWidth={2.5} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <button
                onClick={() => setWithDemo(v => !v)}
                className="w-full text-left px-4 py-3 rounded-xl border-1.5 transition-all text-sm font-medium flex items-center justify-between"
                style={{
                  borderColor: withDemo ? '#1877F2' : '#e5e7eb',
                  background: withDemo ? '#eff6ff' : 'white',
                  color: withDemo ? '#1877F2' : '#374151',
                }}
              >
                <div>
                  <div className="font-semibold">Carregar dados de demonstração</div>
                  <div className="text-xs font-normal text-gray-500">Plantões e locais pré-cadastrados para explorar o app</div>
                </div>
                {withDemo && (
                  <span className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <Check size={10} color="white" strokeWidth={2.5} />
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-6 pb-10 pt-4 bg-white border-t border-gray-100 flex gap-3 z-[51]">
          <button onClick={() => setMode('onboarding')} className="btn-secondary flex-1">Voltar</button>
          <button onClick={handleRegister} className="btn-primary flex-2" style={{ flex: 2 }}>Começar</button>
        </div>
      </div>
    );
  }

  // ONBOARDING SLIDES
  const slide = slides[step];
  return (
    <div className="app-container flex flex-col min-h-screen bg-white">
      <div className="flex-1 flex flex-col items-center justify-start pt-12 px-6">
        {/* Progress dots */}
        <div className="flex gap-1.5 mb-12">
          {slides.map((_, i) => (
            <div key={i} className="rounded-full transition-all duration-300"
              style={{
                width: i === step ? 24 : 8,
                height: 4,
                background: '#1877F2',
                opacity: i === step ? 1 : 0.25,
              }}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-8 shadow-lg"
          style={{ background: slide.iconBg }}>
          {slide.icon}
        </div>

        {/* Text */}
        <h1 className="text-2xl font-bold text-gray-900 text-center leading-tight whitespace-pre-line mb-4">
          {slide.title}
        </h1>
        <p className="text-gray-500 text-center text-[15px] leading-relaxed max-w-xs">
          {slide.subtitle}
        </p>
      </div>

      {/* Buttons */}
      <div className="px-6 pb-10 pt-4">
        {step === 0 ? (
          <>
            <button onClick={handleNext} className="btn-primary mb-3">
              Continuar <ChevronRight size={18} />
            </button>
            <button onClick={() => setMode('login')} className="btn-secondary mb-3">
              Já tenho conta — Entrar
            </button>
            <button
              onClick={handleGuestLogin}
              className="w-full flex items-center justify-center gap-2 py-3 text-slate-500 hover:text-slate-800 transition text-sm font-medium"
            >
              <UserCircle2 size={16} />
              Entrar como visitante
            </button>
            <p className="text-center text-[11px] text-slate-400 mt-1.5 px-4 leading-snug">
              Explore o app com dados de demonstração — sem cadastro.
            </p>
          </>
        ) : (
          <div className="flex gap-3">
            <button onClick={handleBack} className="btn-secondary flex-1">Voltar</button>
            <button onClick={handleNext} className="btn-primary flex-1">
              {step === slides.length - 1 ? 'Começar' : 'Continuar'} <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
