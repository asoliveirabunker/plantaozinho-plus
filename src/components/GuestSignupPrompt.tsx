import { X, Lock, UserPlus } from 'lucide-react';
import { useGuest } from '../hooks/useGuest';
import { useApp } from '../contexts/AppContext';

/**
 * Modal disparado quando o visitante tenta usar uma função protegida
 * (exportar PDF/CSV, enviar via WhatsApp, etc.). Drilldown centralizado
 * no padrão visual do app.
 */
export default function GuestSignupPrompt() {
  const { signupBlocked, closeSignupPrompt } = useGuest();
  const { logout } = useApp();

  if (!signupBlocked) return null;

  function handleCreateAccount() {
    closeSignupPrompt();
    logout(); // volta para o onboarding onde pode criar conta
  }

  return (
    <div
      className="fixed inset-0 z-[210] bg-slate-900/50 flex items-center justify-center p-4 animate-fade-in"
      onClick={closeSignupPrompt}
    >
      <div
        className="bg-white w-full max-w-sm rounded-[24px] shadow-2xl overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-5 pt-6 pb-5 text-white" style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}>
          <button
            onClick={closeSignupPrompt}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition active:scale-95"
          >
            <X size={16} />
          </button>

          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <Lock size={20} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 leading-none mb-0.5">
                Modo Visitante
              </p>
              <p className="text-[17px] font-black leading-none">Crie sua conta</p>
            </div>
          </div>

          <h3 className="text-[18px] font-black tracking-tight leading-tight">
            {signupBlocked} disponível só para usuários cadastrados
          </h3>
          <p className="text-[12.5px] opacity-90 mt-1 leading-snug">
            No modo Visitante você pode <strong>experimentar</strong> todas as funcionalidades — mas <strong>exportar e compartilhar</strong> dados exige uma conta gratuita.
          </p>
        </div>

        {/* Benefícios */}
        <div className="px-5 py-4 space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Ao criar conta você ganha
          </p>
          {[
            'Seus plantões salvos com segurança',
            'Exportação de PDF e CSV liberada',
            'Envio de relatórios ao contador',
            'Sincronização entre dispositivos',
          ].map((b, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="w-4 h-4 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-emerald-600 text-[10px] font-black leading-none">✓</span>
              </div>
              <span className="text-[13px] text-slate-700 leading-snug">{b}</span>
            </div>
          ))}
        </div>

        {/* Ações */}
        <div className="px-5 pb-5 pt-1 space-y-2">
          <button
            onClick={handleCreateAccount}
            className="w-full py-3 rounded-xl text-white text-sm font-bold transition active:scale-[0.98] shadow-sm flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}
          >
            <UserPlus size={15} strokeWidth={2.5} />
            Criar conta gratuita
          </button>
          <button
            onClick={closeSignupPrompt}
            className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-600 text-[13px] font-semibold hover:bg-slate-200 transition active:scale-[0.98]"
          >
            Continuar explorando
          </button>
        </div>
      </div>
    </div>
  );
}
