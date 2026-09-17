import { X, Lock, UserPlus, Check } from 'lucide-react';
import { useGuest } from '../hooks/useGuest';
import { useApp } from '../contexts/AppContext';
import { useLanguage } from '../hooks/useLanguage';
import MarbleBackground from './MarbleBackground';

const BENEFITS = [
  'Seus plantões salvos com segurança',
  'Exportação de PDF e CSV liberada',
  'Envio de relatórios ao contador',
  'Sincronização entre dispositivos',
];

/**
 * Modal disparado quando o visitante tenta usar uma função protegida
 * (exportar PDF/CSV, enviar via WhatsApp, etc.). Drilldown centralizado
 * no padrão visual do app.
 *
 * Sistema Jade: o cabeçalho laranja em gradiente virou a mesma placa de pedra
 * (`deep`) do UpgradeModal — pílula de vidro "Modo visitante", título 300/600
 * em branco — e os benefícios viram linhas de filete com check jade.
 */
export default function GuestSignupPrompt() {
  const { signupBlocked, closeSignupPrompt } = useGuest();
  const { logout } = useApp();
  const { t } = useLanguage();

  if (!signupBlocked) return null;

  function handleCreateAccount() {
    closeSignupPrompt();
    logout(); // volta para o onboarding onde pode criar conta
  }

  return (
    <div className="modal-overlay z-[210] animate-fade-in" onClick={closeSignupPrompt}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-signup-title"
        className="bg-white w-full max-w-sm max-h-[92vh] rounded-3xl overflow-y-auto hide-scrollbar animate-scale-in"
        style={{ boxShadow: '0 40px 80px -30px rgba(7,56,45,.5)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Cabeçalho de pedra — mesmo enquadramento `deep` do UpgradeModal. */}
        <div className="relative overflow-hidden p-6">
          <MarbleBackground frame="deep" />

          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <span className="glass-pill !h-auto py-1.5 !text-[11px] uppercase tracking-[0.08em]">
                <Lock size={12} strokeWidth={2} aria-hidden="true" />
                {t('Modo visitante')}
              </span>
              <button
                type="button"
                onClick={closeSignupPrompt}
                className="glass-icon-btn !w-[34px] !h-[34px] shrink-0"
                title={t('Fechar')}
                aria-label={t('Fechar')}
              >
                <X size={15} strokeWidth={1.6} />
              </button>
            </div>

            <h3
              id="guest-signup-title"
              className="mt-[26px] text-[26px] font-light leading-[1.1] tracking-[-0.035em] text-white"
            >
              {t('Crie sua')} <span className="font-semibold">{t('conta')}</span>
            </h3>
            <p className="mt-2.5 text-[13.5px] font-normal leading-[1.55] text-white/[0.86]">
              {t(signupBlocked)} {t('disponível só para usuários cadastrados')}
            </p>
          </div>
        </div>

        <div className="p-6">
          <p className="text-[13.5px] leading-[1.55] text-slate-600">
            {t('No modo Visitante você pode')}{' '}
            <strong className="font-semibold text-slate-900">{t('experimentar')}</strong>{' '}
            {t('todas as funcionalidades — mas')}{' '}
            <strong className="font-semibold text-slate-900">{t('exportar e compartilhar')}</strong>{' '}
            {t('dados exige uma conta gratuita.')}
          </p>

          <p className="mt-5 text-[12.5px] font-normal text-slate-500">
            {t('Ao criar conta você ganha')}
          </p>

          {/* Benefícios: linhas de filete, check jade de traço 1.8. */}
          <div className="mt-2.5">
            {BENEFITS.map(b => (
              <div
                key={b}
                className="flex items-start gap-3 py-3"
                style={{ borderBottom: '1px solid var(--color-border)' }}
              >
                <Check size={16} strokeWidth={1.8} aria-hidden="true" className="shrink-0 mt-0.5 text-blue-600" />
                <span className="text-[14px] font-normal leading-[1.45] text-slate-700">{t(b)}</span>
              </div>
            ))}
          </div>

          <button type="button" onClick={handleCreateAccount} className="btn-primary mt-6">
            <UserPlus size={16} strokeWidth={1.6} aria-hidden="true" />
            {t('Criar conta gratuita')}
          </button>
          <button
            type="button"
            onClick={closeSignupPrompt}
            className="w-full h-12 mt-2 rounded-xl bg-transparent text-[13.5px] font-normal text-slate-500 hover:text-slate-900 transition"
          >
            {t('Continuar explorando')}
          </button>
        </div>
      </div>
    </div>
  );
}
