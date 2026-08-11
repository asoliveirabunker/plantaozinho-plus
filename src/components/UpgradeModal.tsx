import { X, Check, Sparkles, Crown, Zap } from 'lucide-react';
import { usePlan } from '../contexts/PlanContext';
import { useApp } from '../contexts/AppContext';
import { useLanguage } from '../hooks/useLanguage';
import {
  FEATURE_MIN_PLAN, FEATURE_LABEL, PLAN_META, buildSubscriptionUrl, type PlanId,
} from '../lib/plans';

/**
 * Modal de upgrade — aparece quando o usuário tenta acessar uma feature
 * acima do seu plano. Mostra o plano necessário, os benefícios e o CTA.
 *
 * Renderizado uma única vez no nível do App (consome PlanContext).
 */
export default function UpgradeModal() {
  const { upgradeFeature, closeUpgrade } = usePlan();
  const { user } = useApp();
  const { t } = useLanguage();

  if (!upgradeFeature) return null;

  const requiredPlan: PlanId = FEATURE_MIN_PLAN[upgradeFeature];
  const meta = PLAN_META[requiredPlan];
  const featureInfo = FEATURE_LABEL[upgradeFeature];
  const PlanIcon = requiredPlan === 'max' ? Crown : Zap;

  // Direciona para a página de vendas (a contratação acontece lá), levando a
  // identidade da conta para o checkout conseguir ativá-la após o pagamento.
  function handleUpgrade() {
    window.open(buildSubscriptionUrl(requiredPlan, user), '_blank', 'noopener');
    closeUpgrade();
  }

  return (
    <div
      className="fixed inset-0 z-[200] bg-slate-900/50 flex items-center justify-center p-4 animate-fade-in"
      onClick={closeUpgrade}
    >
      <div
        className="bg-white w-full max-w-sm rounded-[24px] shadow-2xl overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header com gradiente do plano */}
        <div className="relative px-5 pt-6 pb-5 text-white" style={{ background: meta.gradient }}>
          <button
            onClick={closeUpgrade}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition active:scale-95"
          >
            <X size={16} />
          </button>

          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <PlanIcon size={20} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 leading-none mb-0.5">
                {t('Recurso')} {meta.name}
              </p>
              <p className="text-[17px] font-black leading-none">Plantão {meta.name}</p>
            </div>
          </div>

          <h3 className="text-[18px] font-black tracking-tight leading-tight">{featureInfo.title}</h3>
          <p className="text-[12.5px] opacity-90 mt-1 leading-snug">{featureInfo.description}</p>
        </div>

        {/* Benefícios do plano */}
        <div className="px-5 py-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Sparkles size={11} strokeWidth={2.5} style={{ color: meta.color }} />
            {t('O que você desbloqueia')}
          </p>
          <div className="space-y-2">
            {meta.highlights.map((h, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: `${meta.color}1a` }}
                >
                  <Check size={10} strokeWidth={3} style={{ color: meta.color }} />
                </div>
                <span className="text-[13px] text-slate-700 leading-snug">{h}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Ações */}
        <div className="px-5 pb-5 pt-1 space-y-2">
          {meta.priceLabel && (
            <div className="flex items-baseline justify-center gap-1 mb-1">
              <span className="text-[22px] font-black text-slate-900">{meta.priceLabel.split('/')[0]}</span>
              <span className="text-[12px] text-slate-400">/{meta.priceLabel.split('/')[1] || 'mês'}</span>
            </div>
          )}
          <button
            onClick={handleUpgrade}
            className="w-full py-3 rounded-xl text-white text-sm font-bold transition active:scale-[0.98] shadow-sm flex items-center justify-center gap-2"
            style={{ background: meta.gradient }}
          >
            <PlanIcon size={15} strokeWidth={2.5} />
            {t('Assinar')} Plantão {meta.name}
          </button>
          <button
            onClick={closeUpgrade}
            className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-600 text-[13px] font-semibold hover:bg-slate-200 transition active:scale-[0.98]"
          >
            {t('Agora não')}
          </button>
        </div>
      </div>
    </div>
  );
}
