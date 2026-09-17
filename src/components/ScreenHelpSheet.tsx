import type { ReactNode } from 'react';
import { X, Sparkles, Zap } from 'lucide-react';
import { usePlan } from '../contexts/PlanContext';
import { useLanguage } from '../hooks/useLanguage';
import type { Feature } from '../lib/plans';
import MarbleBackground from './MarbleBackground';

export interface HelpItem {
  title: string;
  desc: string;
}

interface ScreenHelpSheetProps {
  open: boolean;
  onClose: () => void;
  /** Ícone exibido ao lado do pretítulo (solto, sem fundo). */
  icon: ReactNode;
  /** Pretítulo (ex.: nome da tela). */
  pretitle: string;
  /** Título principal (ex.: "Como usar"). */
  title: string;
  /** Lista numerada de funções/recursos da tela. */
  items: HelpItem[];
  /** Texto do card de upsell Pro. */
  proPitch: string;
  /** Feature representativa para abrir o modal de assinatura. */
  proFeature: Feature;
}

/**
 * Drilldown de ajuda reutilizável — modal centrado que explica a função da
 * tela e, para usuários Free, exibe um card de upsell Pro.
 *
 * Sistema Jade: cabeçalho 22/300 com ícone solto (sem quadrado pastel), itens
 * numerados com numeral jade simples separados por filete, e o upsell deixa o
 * gradiente de `PLAN_META.pro` para virar um cartão de pedra (`deep`) com
 * pílula de vidro — a mesma linguagem do UpgradeModal.
 */
export default function ScreenHelpSheet({
  open, onClose, icon, pretitle, title, items, proPitch, proFeature,
}: ScreenHelpSheetProps) {
  const { plan, requireUpgrade } = usePlan();
  const { t } = useLanguage();

  if (!open) return null;

  return (
    <div className="bottom-sheet-overlay animate-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="screen-help-title"
        className="bg-white w-full max-w-sm max-h-[86vh] rounded-3xl overflow-hidden flex flex-col animate-scale-in"
        style={{ boxShadow: '0 40px 80px -30px rgba(7,56,45,.5)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="p-6 pb-4 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[13px] text-slate-500 [&_svg]:w-[18px] [&_svg]:h-[18px] [&_svg]:[stroke-width:1.5]">
              <span className="flex shrink-0 text-blue-600" aria-hidden="true">{icon}</span>
              <span className="truncate">{t(pretitle)}</span>
            </p>
            <h3
              id="screen-help-title"
              className="mt-2 text-[22px] font-light leading-[1.15] tracking-[-0.03em] text-slate-900"
            >
              {t(title)}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn w-9 h-9 -mr-2 -mt-1 flex items-center justify-center shrink-0"
            title={t('Fechar')}
            aria-label={t('Fechar')}
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-6 pb-6 overflow-y-auto hide-scrollbar">
          {/* Passos / funções — numeral jade, filete entre itens */}
          <ol>
            {items.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-4 py-3.5"
                style={i > 0 ? { borderTop: '1px solid var(--color-border)' } : undefined}
              >
                <span className="w-5 shrink-0 pt-px text-[13px] font-semibold text-blue-600 tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <p className="text-[14.5px] font-semibold leading-tight tracking-[-0.01em] text-slate-900">{t(item.title)}</p>
                  <p className="mt-1 text-[13px] leading-[1.5] text-slate-500">{t(item.desc)}</p>
                </div>
              </li>
            ))}
          </ol>

          {/* Upsell Pro — apenas para usuários Free. Cartão de pedra. */}
          {plan === 'free' && (
            <div className="relative overflow-hidden rounded-2xl p-5 mt-4">
              <MarbleBackground frame="deep" />

              <div className="relative">
                <span className="glass-pill !h-auto py-1.5 !text-[11px] uppercase tracking-[0.08em]">
                  <Zap size={12} strokeWidth={2} aria-hidden="true" />
                  {t('Plano Pro')}
                </span>
                <p className="mt-4 text-[20px] font-light leading-[1.15] tracking-[-0.03em] text-white">
                  {t('Desbloqueie tudo')}
                </p>
                <p className="mt-2 text-[13.5px] leading-[1.55] text-white/[0.86]">{t(proPitch)}</p>
                {/* Branco fixo (não `bg-white`, que o modo escuro repinta) sobre a pedra. */}
                <button
                  type="button"
                  onClick={() => { onClose(); requireUpgrade(proFeature); }}
                  className="mt-4 w-full h-12 rounded-xl bg-[#fff] hover:bg-white/90 text-[14px] font-semibold text-[#0C2A24] flex items-center justify-center gap-2 transition"
                >
                  <Sparkles size={15} strokeWidth={1.6} aria-hidden="true" />
                  {t('Conhecer o Plano Pro')}
                </button>
              </div>
            </div>
          )}

          <button type="button" onClick={onClose} className="btn-secondary mt-4">
            {t('Entendi')}
          </button>
        </div>
      </div>
    </div>
  );
}
