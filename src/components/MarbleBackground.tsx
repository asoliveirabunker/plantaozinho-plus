/**
 * Placa de pedra da marca — jade claro marmoreado.
 *
 * Mudança de conceito em relação à versão anterior: o mármore era um fundo
 * ANIMADO (pan de 48s + dois brilhos de cor em soft-light), o que o fazia ler
 * como filtro de foto. Agora é uma SUPERFÍCIE ARQUITETÔNICA: pedra parada,
 * véu em gradiente vertical por cima, e o que muda entre telas é apenas o
 * enquadramento (`frame`).
 *
 * Regras do sistema:
 *  - só aparece onde sustenta conteúdo, sangrando até a borda da tela ou
 *    preenchendo 100% de um elemento — nunca recortada num cantinho;
 *  - no máximo uma superfície marmoreada por tela (fora a placa de topo);
 *  - nunca atrás de texto menor que 16px sem véu, nunca em elemento < 38px.
 *
 * Posiciona-se absoluto dentro do pai (que deve ser relative + overflow-hidden).
 * Estilos em index.css (.marble-bg).
 */

type MarbleFrame = 'hero' | 'alt' | 'deep';

interface MarbleBackgroundProps {
  /**
   * Trecho da placa a mostrar. Telas diferentes usam enquadramentos
   * diferentes da MESMA pedra — é o que faz o usuário sentir que andou
   * pela mesma superfície em vez de ver outra textura.
   *
   *  hero → Hoje, Login, Cadastro 1, Perfil, detalhe de local (34% 46%)
   *  alt  → Cadastro 2 (52% 58%)
   *  deep → detalhe do plantão, paywall, extrato fiscal (60% 30%)
   */
  frame?: MarbleFrame;
  /** Véu de contraste. Desligue só se o conteúdo por cima não tiver texto. */
  contrast?: boolean;
}

export default function MarbleBackground({
  frame = 'hero',
  contrast = true,
}: MarbleBackgroundProps) {
  return (
    <div className="marble-bg" data-frame={frame} aria-hidden="true">
      <img src="/marble.webp" alt="" className="marble-img" draggable={false} />
      {contrast && <div className="marble-contrast" />}
    </div>
  );
}
