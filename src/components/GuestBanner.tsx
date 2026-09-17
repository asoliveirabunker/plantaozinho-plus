import { useState } from 'react';
import { Eye, ChevronRight, UserPlus } from 'lucide-react';
import { useGuest } from '../hooks/useGuest';
import { useApp } from '../contexts/AppContext';
import { useLanguage } from '../hooks/useLanguage';
import ConfirmDialog from './ConfirmDialog';

/**
 * Faixa fixa no topo durante a sessão de visitante:
 *  • Sinaliza que é modo demonstração
 *  • CTA "Criar conta" volta para o onboarding (logout)
 *
 * z-index abaixo das telas full-screen (z-50) e dos modais (z-200+),
 * para nunca colidir com cabeçalhos de telas que abrem por cima.
 *
 * Sistema Jade: faixa em tinta jade (`bg-slate-900` = #0C2A24, igual nos dois
 * temas), texto branco, ícone solto e CTA como pílula de vidro.
 */
export default function GuestBanner() {
  const { isGuest } = useGuest();
  const { logout } = useApp();
  const { t } = useLanguage();
  // confirm() nativo é bloqueado em iframes/webviews: usa o ConfirmDialog.
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!isGuest) return null;

  return (
    <>
      <div
        className="bg-slate-900 text-white"
        style={{ position: 'sticky', top: 0, zIndex: 40 }}
      >
        <div className="max-w-[430px] mx-auto flex items-center justify-between gap-3 px-6 py-2.5">
          <span className="flex items-center gap-3 min-w-0">
            <Eye size={17} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-white/80" />
            <span className="flex flex-col min-w-0 leading-tight">
              <span className="text-[13px] font-semibold tracking-[-0.01em] truncate">{t('Modo demonstração')}</span>
              <span className="mt-0.5 text-[11.5px] text-white/60 truncate">{t('Você está explorando o Plantão Pro')}</span>
            </span>
          </span>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="glass-pill !h-8 !pl-3.5 !pr-2.5 !gap-1 shrink-0"
          >
            {t('Criar conta')} <ChevronRight size={14} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        icon={UserPlus}
        title={t('Criar sua conta?')}
        description={t('Sair do modo visitante e criar uma conta? Os dados de demonstração serão descartados.')}
        confirmLabel={t('Criar conta')}
        tone="default"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); logout(); }}
      />
    </>
  );
}
