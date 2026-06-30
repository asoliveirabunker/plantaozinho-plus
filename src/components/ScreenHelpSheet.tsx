import type { ReactNode } from 'react';
import { X, Sparkles, Zap } from 'lucide-react';
import { usePlan } from '../contexts/PlanContext';
import { PLAN_META, type Feature } from '../lib/plans';

export interface HelpItem {
  title: string;
  desc: string;
}

interface ScreenHelpSheetProps {
  open: boolean;
  onClose: () => void;
  /** Ícone exibido no avatar do cabeçalho. */
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
 * Drilldown de ajuda reutilizável — uma folha (bottom-sheet) que explica
 * a função da tela e, para usuários Free, exibe um card de upsell Pro.
 * Padrão visual idêntico ao restante do app.
 */
export default function ScreenHelpSheet({
  open, onClose, icon, pretitle, title, items, proPitch, proFeature,
}: ScreenHelpSheetProps) {
  const { plan, requireUpgrade } = usePlan();

  if (!open) return null;

  return (
    <div className="bottom-sheet-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
              {icon}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{pretitle}</p>
              <h3 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight">{title}</h3>
            </div>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all active:scale-95 shrink-0 ml-3">
            <X size={16} />
          </button>
        </div>

        {/* Passos / funções */}
        <div className="space-y-2.5 mb-4">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 text-[11px] font-bold">
                {i + 1}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-slate-900 leading-tight">{item.title}</p>
                <p className="text-[12px] text-slate-500 leading-snug mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Upsell Pro — apenas para usuários Free */}
        {plan === 'free' && (
          <div className="rounded-2xl p-4 mb-3" style={{ background: PLAN_META.pro.gradient }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <Zap size={15} className="text-white" strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/80 leading-none mb-0.5">Plano Pro</p>
                <p className="text-[15px] font-black text-white leading-none">Desbloqueie tudo</p>
              </div>
            </div>
            <p className="text-[12.5px] text-white/90 leading-snug mb-3">{proPitch}</p>
            <button
              onClick={() => { onClose(); requireUpgrade(proFeature); }}
              className="w-full py-2.5 rounded-xl bg-white text-[13px] font-bold transition active:scale-[0.98] flex items-center justify-center gap-1.5"
              style={{ color: PLAN_META.pro.color }}
            >
              <Sparkles size={14} strokeWidth={2.5} />
              Conhecer o Plano Pro
            </button>
          </div>
        )}

        <button onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-600 text-[13px] font-semibold hover:bg-slate-200 transition active:scale-[0.98]">
          Entendi
        </button>
      </div>
    </div>
  );
}
