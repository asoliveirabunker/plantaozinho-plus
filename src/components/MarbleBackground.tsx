/**
 * Fundo marmoreado animado da marca — usa o marmoreio REAL (marble.webp,
 * recorte da referência) com movimento lento de câmera (pan/rotação/zoom)
 * e brilhos de cor derivando por cima. Um véu sutil escurecido garante a
 * legibilidade do texto branco. Posiciona-se absoluto dentro do pai
 * (que deve ser relative + overflow-hidden). Estilos em index.css.
 */
export default function MarbleBackground({ contrast = true }: { contrast?: boolean }) {
  return (
    <div className="marble-bg" aria-hidden="true">
      <img src="/marble.webp" alt="" className="marble-img" draggable={false} />
      <div className="marble-glow marble-glow-a" />
      <div className="marble-glow marble-glow-b" />
      {contrast && <div className="marble-contrast" />}
    </div>
  );
}
