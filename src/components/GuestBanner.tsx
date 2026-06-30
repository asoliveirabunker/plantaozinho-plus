import { Eye, ChevronRight } from 'lucide-react';
import { useGuest } from '../hooks/useGuest';
import { useApp } from '../contexts/AppContext';

/**
 * Faixa fixa no topo durante a sessão de visitante:
 *  • Sinaliza que é modo demonstração
 *  • CTA "Criar conta" volta para o onboarding (logout)
 *
 * z-index abaixo das telas full-screen (z-50) e dos modais (z-200+),
 * para nunca colidir com cabeçalhos de telas que abrem por cima.
 */
export default function GuestBanner() {
  const { isGuest } = useGuest();
  const { logout } = useApp();

  if (!isGuest) return null;

  function handleSignup() {
    if (confirm('Sair do modo visitante e criar uma conta? Os dados de demonstração serão descartados.')) {
      logout();
    }
  }

  return (
    <div
      className="bg-slate-900 text-white"
      style={{ position: 'sticky', top: 0, zIndex: 40 }}
    >
      <div className="max-w-[430px] mx-auto flex items-center justify-between gap-3 px-4 py-2">
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">
            <Eye size={14} strokeWidth={2.5} className="text-white/90" />
          </span>
          <span className="flex flex-col leading-tight min-w-0">
            <span className="text-[12.5px] font-bold truncate">Modo demonstração</span>
            <span className="text-[10px] text-white/55 truncate">Você está explorando o Plantão Pro</span>
          </span>
        </span>
        <button
          onClick={handleSignup}
          className="flex items-center gap-1 shrink-0 bg-white text-slate-900 px-3 py-1.5 rounded-full text-[11.5px] font-bold hover:bg-slate-100 transition active:scale-95 shadow-sm"
        >
          Criar conta <ChevronRight size={12} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
