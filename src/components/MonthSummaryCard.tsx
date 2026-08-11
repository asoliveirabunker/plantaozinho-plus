import { useLanguage } from '../hooks/useLanguage';

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface MonthSummaryCardProps {
  /** Rótulo do período (ex.: "agosto de 2026"). */
  monthLabel: string;
  /** Faturamento previsto do mês (total = recebido + a receber + atrasado). */
  expected: number;
  received: number;
  pending: number;
  overdue: number;
}

/**
 * Resumo financeiro do mês — um único card com o total previsto em destaque,
 * uma barra segmentada proporcional (recebido / a receber / atrasado) e a
 * legenda com valor e percentual de cada parte.
 *
 * Substitui a grade de 4 cards isolados: aqui as partes são lidas em relação
 * ao todo, então dá para ver de relance quanto do mês já entrou no caixa.
 */
export default function MonthSummaryCard({
  monthLabel, expected, received, pending, overdue,
}: MonthSummaryCardProps) {
  const { t } = useLanguage();

  // Clamp defensivo: se um plantão for recebido acima do previsto, `pending`
  // pode ficar negativo — a barra não pode ter segmento negativo.
  const parts = [
    { key: 'received', label: t('Recebido'), value: Math.max(0, received), bar: 'bg-emerald-500', text: 'text-emerald-600' },
    { key: 'pending',  label: t('A receber'), value: Math.max(0, pending),  bar: 'bg-blue-500',    text: 'text-blue-500' },
    { key: 'overdue',  label: t('Atrasado'),  value: Math.max(0, overdue),  bar: 'bg-red-500',     text: 'text-red-500' },
  ];

  const barTotal = parts.reduce((sum, p) => sum + p.value, 0);
  const hasData = barTotal > 0;
  const pctOf = (v: number) => (barTotal > 0 ? (v / barTotal) * 100 : 0);
  const receivedPct = expected > 0 ? Math.round((received / expected) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.03)] p-4">
      {/* Cabeçalho: período + total previsto */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{monthLabel}</p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[24px] font-black text-slate-900 tracking-tight leading-none">
              {formatCurrency(expected)}
            </span>
            <span className="text-[11px] font-semibold text-slate-400">{t('previsto')}</span>
          </div>
        </div>
        {hasData && (
          <div className="text-right shrink-0">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">{t('Recebido')}</p>
            <p className="text-[16px] font-black text-emerald-600 leading-none tabular-nums">{receivedPct}%</p>
          </div>
        )}
      </div>

      {/* Barra segmentada proporcional */}
      {hasData ? (
        <div className="flex items-center gap-1 mb-3" role="img"
          aria-label={parts.filter(p => p.value > 0).map(p => `${p.label}: ${formatCurrency(p.value)}`).join(', ')}>
          {parts.filter(p => p.value > 0).map(p => (
            <div
              key={p.key}
              className={`${p.bar} h-2.5 rounded-full transition-all duration-500`}
              style={{ width: `${pctOf(p.value)}%`, minWidth: 10 }}
            />
          ))}
        </div>
      ) : (
        <div className="h-2.5 rounded-full bg-slate-100 mb-3" />
      )}

      {/* Legenda — valor e percentual de cada parte */}
      <div className="grid grid-cols-3 gap-2">
        {parts.map(p => (
          <div key={p.key} className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`${p.bar} w-1.5 h-1.5 rounded-full shrink-0 ${p.value > 0 ? '' : 'opacity-30'}`} />
              <span className="text-[10.5px] text-slate-500 font-medium truncate">{p.label}</span>
            </div>
            <p className={`text-[13px] font-bold tracking-tight tabular-nums truncate ${p.value > 0 ? p.text : 'text-slate-300'}`}>
              {formatCurrency(p.value)}
            </p>
            {hasData && (
              <p className="text-[9.5px] text-slate-400 font-medium tabular-nums">{Math.round(pctOf(p.value))}%</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
