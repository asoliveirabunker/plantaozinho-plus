import type { ReactNode } from 'react';
import MarbleBackground from './MarbleBackground';

/**
 * A construção-assinatura do sistema: placa de pedra sangrada no topo da tela
 * + folha branca que sobe -28px sobre ela e encosta com raio 28.
 *
 * É a mesma peça em Hoje, Login, Cadastro (1 e 2), Perfil e detalhe de local.
 * Padronizar aqui é o que garante que as margens (24px), o véu e o raio sejam
 * matematicamente idênticos em todas elas — em vez de repetidos à mão em cada
 * tela, como estava antes.
 *
 * Uso:
 *   <JadePlate
 *     frame="hero"
 *     top={<button className="glass-icon-btn"><ChevronLeft size={17} /></button>}
 *     eyebrow="Etapa 1 de 2 · Identificação"
 *     titleLight="Vamos"
 *     titleBold="personalizar"
 *   >
 *     …conteúdo da folha branca…
 *   </JadePlate>
 */
interface JadePlateProps {
  /** Enquadramento da pedra — ver MarbleBackground. */
  frame?: 'hero' | 'alt' | 'deep';
  /** Linha de topo da placa (voltar, menu, avatar, selo de plano). */
  top?: ReactNode;
  /** Linha de contexto acima do título: 13.5px / peso 500 sobre a pedra. */
  eyebrow?: string;
  /** Primeira linha do título — peso 300. */
  titleLight?: string;
  /** Segunda linha do título — peso 600. O par 300/600 é o padrão do sistema. */
  titleBold?: string;
  /** Qualquer coisa a mais dentro da placa (progresso, próximo plantão). */
  plateExtra?: ReactNode;
  /** Altura extra da placa, para quando `plateExtra` é alto. */
  plateClassName?: string;
  /** Conteúdo da folha branca. */
  children: ReactNode;
  /** Classe extra na folha (ex.: pb menor quando não há bottom-nav). */
  sheetClassName?: string;
}

export default function JadePlate({
  frame = 'hero',
  top,
  eyebrow,
  titleLight,
  titleBold,
  plateExtra,
  plateClassName = '',
  children,
  sheetClassName = '',
}: JadePlateProps) {
  return (
    <>
      <div className={`relative overflow-hidden px-6 pt-[22px] pb-[46px] ${plateClassName}`}>
        <MarbleBackground frame={frame} />

        <div className="relative">
          {top}

          {eyebrow && (
            <p className="mt-[26px] text-[13.5px] font-medium text-white/80">{eyebrow}</p>
          )}

          {(titleLight || titleBold) && (
            <h1 className="mt-2.5 text-[30px] font-light leading-[1.08] tracking-[-0.035em] text-white">
              {titleLight}
              {titleLight && titleBold && <br />}
              {titleBold && <span className="font-semibold">{titleBold}</span>}
            </h1>
          )}

          {plateExtra}
        </div>
      </div>

      <div className={`jade-sheet ${sheetClassName}`}>{children}</div>
    </>
  );
}
