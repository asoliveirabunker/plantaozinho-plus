import { Capacitor } from '@capacitor/core';

/**
 * Ponte com o aplicativo Android (Capacitor). Na web tudo aqui vira no-op ou
 * cai no comportamento do navegador, então as telas chamam sempre as mesmas
 * funções — não há `if (Android)` espalhado pelo app.
 *
 * Os plugins entram por import dinâmico: no navegador eles nunca são baixados.
 */
export const isNative = Capacitor.isNativePlatform();

/** Tom da barra de status: sobre a placa de pedra (ícones claros) ou sobre papel. */
export type StatusTone = 'pedra' | 'papel';

export async function applyStatusBar(tone: StatusTone, dark: boolean) {
  if (!isNative) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const sobrePedra = tone === 'pedra';
    await StatusBar.setOverlaysWebView({ overlay: false });
    // Style.Dark = conteúdo claro (o nome vem do fundo escuro).
    await StatusBar.setStyle({ style: sobrePedra || dark ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({
      color: sobrePedra ? '#0A5544' : dark ? '#092620' : '#F6F8F7',
    });
  } catch {
    // Sem barra de status (web ou plugin ausente): segue sem alterar nada.
  }
}

/** Esconde a splash nativa assim que a primeira tela está pronta. */
export async function hideSplash() {
  if (!isNative) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch { /* sem splash */ }
}

/**
 * Botão voltar do Android. `handler` devolve true quando já tratou o toque;
 * devolvendo false, o app é minimizado (comportamento esperado na tela inicial).
 */
export async function onAndroidBack(handler: () => boolean) {
  if (!isNative) return () => {};
  try {
    const { App } = await import('@capacitor/app');
    const sub = await App.addListener('backButton', () => {
      if (!handler()) App.minimizeApp();
    });
    return () => { sub.remove(); };
  } catch {
    return () => {};
  }
}

/** Abre link externo (assinatura, WhatsApp, e-mail) fora da janela do app. */
export async function openExternal(url: string) {
  if (isNative && /^https?:/i.test(url)) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
      return;
    } catch { /* cai no window.open */ }
  }
  window.open(url, '_blank', 'noopener');
}

function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const s = String(reader.result);
      resolve(s.slice(s.indexOf(',') + 1)); // tira o prefixo data:...;base64,
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Entrega um arquivo ao usuário.
 * - No aplicativo: grava no cache e abre a folha de compartilhamento do Android
 *   (WhatsApp, e-mail, Arquivos/Drive) — a WebView não tem pasta de downloads.
 * - Na web: tenta compartilhar arquivo; senão, baixa como sempre.
 * Devolve true quando o arquivo saiu por algum caminho nativo/compartilhamento.
 */
export async function entregarArquivo(
  blob: Blob,
  fileName: string,
  { title, text }: { title?: string; text?: string } = {},
): Promise<boolean> {
  if (isNative) {
    try {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ]);
      const data = await blobParaBase64(blob);
      const { uri } = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
      await Share.share({ title, text, files: [uri] });
      return true;
    } catch (err) {
      if ((err as Error)?.message?.includes('cancel')) return true; // usuário fechou a folha
      console.error(err);
    }
  }

  const file = new File([blob], fileName, { type: blob.type });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return true;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return true;
      console.error(err);
    }
  }
  return false;
}

/** Baixa o arquivo (web) ou abre a folha de compartilhamento (aplicativo). */
export async function baixarArquivo(blob: Blob, fileName: string, meta?: { title?: string; text?: string }) {
  if (isNative) {
    await entregarArquivo(blob, fileName, meta);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
