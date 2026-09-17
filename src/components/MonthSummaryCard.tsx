import { useLanguage } from '../hooks/useLanguage';

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Separa "R$ 14.300," de "00" para o centavo ir em corpo menor. */
function splitCurrency(v: number) {
  const full = formatCurrency(v);
  const i = full.lastIndexOf(',');
  return i === -1 ? [full, ''] : [full.slice(0, i), full.slice(i)];
}

interface MonthSummaryCardProps {
  /** Rótulo do período (ex.: "Setembro"). */
  monthLabel: string;
  /** Faturamento previsto do mês (total = recebido + a receber + atrasado). */
  expected: number;
  received: number;
  pending: number;
  overdue: number;
}

/**
 * Resumo financeiro do mês.
 *
 * Antes: card branco sobre fundo branco, número em Inter-900, barra de 10px em
 * verde/ciano/vermelho e três colunas com valor + percentual cada uma na sua
 * cor. Três hues para dizer o que a tipografia diz melhor, e nenhuma
 * hierarquia — o dado que o médico abre o app para ver ("quanto entrou") tinha
 * o mesmo peso dos outros dois.
 *
 * Agora: número herói em 42/200 sem caixa, filete de 4px como proporção, e as
 * três partes em linhas tabulares com valores alinhados à direita. A cor
 * sobrevive apenas no quadradinho de 6px e no atraso (terracota) — uma
 * família, não um semáforo.
 */
export default function MonthSummaryCard({
  monthLabel, expected, received, pending, overdue,
}: MonthSummaryCardProps) {
  const { t } = useLanguage();

  // Clamp defensivo: se um plantão for recebido acima do previsto, `pending`
  // pode ficar negativo — a barra não pode ter segmento negativo.
  // Cores de texto via variável: `html.dark` redefine --color-text; um hex fixo
  // de tinta escura (#0C2A24) sumia sobre a folha no modo escuro.
  const parts = [
    { key: 'received', label: t('Recebido'),  value: Math.max(0, received), swatch: '#0E6B55', text: 'var(--color-text)' },
    { key: 'pending',  label: t('A receber'), value: Math.max(0, pending),  swatch: '#A8CFC4', text: 'var(--color-text)' },
    { key: 'overdue',  label: t('Atrasado'),  value: Math.max(0, overdue),  swatch: '#A9512F', text: '#A9512F' },
  ];

  const barTotal = parts.reduce((sum, p) => sum + p.value, 0);
  const hasData = barTotal > 0;
  const pctOf = (v: number) => (barTotal > 0 ? (v / barTotal) * 100 : 0);
  const receivedPct = expected > 0 ? Math.round((received / expected) * 100) : 0;
  const [intPart, centPart] = splitCurrency(expected);

  return (
    <section>
      {/* Cabeçalho: mês + quanto já entrou, em sentença — sem caixa-alta. */}
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-slate-900">
          {monthLabel}
        </h2>
        {hasData && (
          <p className="text-[12.5px] font-normal text-slate-500 tabular-nums">
            {receivedPct}% {t('já no caixa')}
          </p>
        )}
      </div>

      {/* Número herói — o elemento mais forte da tela. */}
      <p className="hero-value mt-2.5">
        {intPart}
        <span className="hero-value-cents">{centPart}</span>
      </p>
      <p className="mt-2 text-[13px] font-normal text-slate-500">
        {t('previsto para o mês')}
      </p>

      {/* Proporção: filete de 4px, não barra de 10px. */}
      {hasData ? (
        <div
          className="flex gap-0.5 mt-[22px]"
          role="img"
          aria-label={parts
            .filter(p => p.value > 0)
            .map(p => `${p.label}: ${formatCurrency(p.value)}`)
            .join(', ')}
        >
          {parts.filter(p => p.value > 0).map(p => (
            <div
              key={p.key}
              className="h-1 rounded transition-all duration-500"
              style={{ width: `${pctOf(p.value)}%`, background: p.swatch, minWidth: 4 }}
            />
          ))}
        </div>
      ) : (
        <div className="h-1 rounded bg-slate-200 mt-[22px]" />
      )}

      {/* Três linhas tabulares: rótulo à esquerda, valor e % à direita. */}
      <div className="mt-3.5">
        {parts.map((p, i) => (
          <div
            key={p.key}
            className="flex items-center justify-between gap-3 py-[11px]"
            style={{ borderBottom: i < parts.length - 1 ? '1px solid var(--color-border)' : 'none' }}
          >
            <span className="flex items-center gap-2.5 text-[14px] font-normal text-slate-700">
              {/* 6×6 com raio 2px (o `rounded-sm` do tema vale 4px) */}
              <span
                className="w-1.5 h-1.5 rounded-[2px] shrink-0"
                style={{ background: p.swatch, opacity: p.value > 0 ? 1 : 0.35 }}
              />
              {p.label}
            </span>
            <span className="flex items-baseline gap-2.5 shrink-0">
              <span
                className="text-[15px] font-normal tabular-nums"
                style={{ color: p.value > 0 ? p.text : 'var(--color-text-muted)' }}
              >
                {formatCurrency(p.value)}
              </span>
              {hasData && (
                <span className="w-[30px] text-right text-[12px] font-normal text-slate-500 tabular-nums">
                  {Math.round(pctOf(p.value))}%
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
