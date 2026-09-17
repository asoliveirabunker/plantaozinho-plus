import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.plantaopro.app',
  appName: 'Plantão Pro',
  webDir: 'dist',
  // Fundo da janela nativa: evita o clarão branco entre a abertura e a primeira tela.
  backgroundColor: '#07201B',
  android: {
    backgroundColor: '#07201B',
  },
  plugins: {
    SplashScreen: {
      // O app esconde a abertura sozinho (src/lib/native.ts) quando a tela está pronta.
      launchAutoHide: false,
      launchFadeOutDuration: 250,
      backgroundColor: '#0A5544',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: '#0A5544',
      style: 'DARK', // conteúdo claro sobre a placa de pedra
    },
  },
};

export default config;
