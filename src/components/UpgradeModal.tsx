import { usePlan } from '../contexts/PlanContext';
import { openExternal } from '../lib/native';
import { useApp } from '../contexts/AppContext';
import { useLanguage } from '../hooks/useLanguage';
import {
  FEATURE_MIN_PLAN, FEATURE_LABEL, PLAN_META, buildSubscriptionUrl, type PlanId,
} from '../lib/plans';

/**
 * Modal de upgrade — aparece quando o usuário tenta acessar uma feature
 * acima do seu plano.
 *
 * Antes: cabeçalho com `meta.gradient` — linear-gradient(135deg, #03bb85,
 * #39d39b, #27c8fe) no Pro e violeta no Max. Era o elemento mais "template"
 * do app inteiro, justamente na tela que precisa parecer caro.
 *
 * Agora (tela "Upgrade Pro" do bloco Núcleo): cabeçalho de pedra com pílula
 * de vidro do plano. Os dois planos usam a MESMA pedra e o mesmo raio —
 * diferenciados só pelo texto da pílula e pelo preço em 32/200. Benefícios em
 * linhas de filete, não em bullets com círculos pastel.
 *
 * O enquadramento da pedra segue o design (textura a 210%, posição 20% 60%,
 * véu 155° .44→.7), diferente do `frame="deep"` do MarbleBackground.
 *
 * Nota de migração: `PLAN_META[].gradient` e `[].color` deixam de ser usados
 * aqui. Se nenhum outro componente os consumir, podem sair de lib/plans.ts.
 */
export default function UpgradeModal() {
  const { upgradeFeature, closeUpgrade } = usePlan();
  const { user } = useApp();
  const { t } = useLanguage();

  if (!upgradeFeature) return null;

  const requiredPlan: PlanId = FEATURE_MIN_PLAN[upgradeFeature];
  const meta = PLAN_META[requiredPlan];
  const featureInfo = FEATURE_LABEL[upgradeFeature];

  // Direciona para a página de vendas (a contratação acontece lá), levando a
  // identidade da conta para o checkout conseguir ativá-la após o pagamento.
  function handleUpgrade() {
    void openExternal(buildSubscriptionUrl(requiredPlan, user));
    closeUpgrade();
  }

  const [price, period] = meta.priceLabel
    ? [meta.priceLabel.split('/')[0], meta.priceLabel.split('/')[1] || 'mês']
    : ['', 'mês'];

  return (
    <div className="modal-overlay animate-fade-in" onClick={closeUpgrade}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-title"
        className="bg-white w-full max-w-[402px] max-h-[92vh] rounded-[28px] overflow-hidden overflow-y-auto hide-scrollbar leading-[normal] animate-scale-in"
        style={{ boxShadow: '0 40px 80px -30px rgba(7,56,45,.5)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Cabeçalho de pedra */}
        <div className="relative overflow-hidden p-6">
          <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-[#2f6f60]">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: 'url(/marble.webp)',
                backgroundSize: '210% auto',
                backgroundPosition: '20% 60%',
                filter: 'saturate(.84)',
              }}
            />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(155deg, rgba(6,48,39,.44), rgba(6,48,39,.7))' }}
            />
          </div>

          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              {/* Pílula de vidro: "Recurso Pro" / "Recurso Max" — mesmo raio nos dois planos */}
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/30 bg-white/[0.12] text-white text-[11px] font-medium tracking-[0.08em] uppercase">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M13 3 6 13.5h5l-1 7.5 7-10.5h-5z" />
                </svg>
                {t('Recurso')} {meta.name}
              </span>
              <button
                onClick={closeUpgrade}
                className="w-[34px] h-[34px] shrink-0 rounded-full border border-white/30 bg-white/[0.14] hover:bg-white/[0.26] text-white flex items-center justify-center p-0 transition-colors"
                aria-label={t('Fechar')}
                title={t('Fechar')}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <h2
              id="upgrade-title"
              className="mt-[26px] text-[26px] font-light leading-[1.1] tracking-[-0.035em] text-white"
            >
              {t(featureInfo.title)}
            </h2>
            <p className="mt-2.5 text-[14px] font-normal leading-[1.55] text-white/[0.88]">
              {t(featureInfo.description)}
            </p>
          </div>
        </div>

        <div className="p-6">
          <p className="text-[12.5px] font-normal text-slate-500">
            {t('O que abre com o plano')}
          </p>

          {/* Benefícios: linhas de filete, check jade de traço 1.8. */}
          <div className="mt-2.5">
            {meta.highlights.map((h, i) => (
              <div
                key={i}
                className="flex items-start gap-3 py-3 border-b border-[var(--color-border)]"
              >
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                  className="shrink-0 mt-0.5 text-blue-600" aria-hidden="true"
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                <span className="text-[14px] font-normal leading-[1.45] text-slate-700">{t(h)}</span>
              </div>
            ))}
          </div>

          {meta.priceLabel && (
            <div className="flex flex-wrap items-baseline gap-x-2 mt-[22px]">
              <span className="text-[32px] font-extralight tracking-[-0.04em] text-slate-900 tabular-nums">
                {price}
              </span>
              <span className="text-[13px] font-light text-slate-500">
                {t('por')} {period}, {t('cancela quando quiser')}
              </span>
            </div>
          )}

          <button onClick={handleUpgrade} className="btn-primary mt-5 font-medium">
            {t('Assinar')} Plantão {meta.name}
          </button>
          <button
            onClick={closeUpgrade}
            className="w-full h-12 mt-2 rounded-xl bg-transparent text-[13.5px] font-normal text-slate-500 hover:text-slate-900 transition-colors"
          >
            {t('Agora não')}
          </button>
        </div>
      </div>
    </div>
  );
}
