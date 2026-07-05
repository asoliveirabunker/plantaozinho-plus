/**
 * Marca do Plantão Pro (public/logo.png) — cruz médica + batimento + gráfico
 * ascendente, gradiente teal → ciano → azul. O arquivo já vem com o quadrado
 * arredondado e a transparência recortados na origem, então basta renderizar
 * a imagem no tamanho desejado.
 */
export default function BrandMark({ size = 48 }: { size?: number }) {
  return (
    <img
      src="/logo.png"
      alt="Plantão Pro"
      width={size}
      height={size}
      style={{ width: size, height: size, display: 'block' }}
    />
  );
}
