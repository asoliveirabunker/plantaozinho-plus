import type { CalendarEventInput } from './shiftParser';

/**
 * ============================================================================
 * Conexão com o Google Agendas (Google Calendar API v3)
 * ============================================================================
 * Usa o Google Identity Services (GIS) para OAuth implícito (token de acesso)
 * com escopo somente-leitura, e busca os eventos via REST.
 *
 * Configuração: crie um OAuth Client ID (tipo "Web") no Google Cloud Console,
 * habilite a Google Calendar API e adicione no .env:
 *   VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
 *
 * Sem o Client ID, `isGoogleConfigured` é false e a UI cai no modo
 * demonstração (mostra o parser em ação com eventos de exemplo).
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

export const isGoogleConfigured = !!CLIENT_ID && !CLIENT_ID.includes('YOUR_');

// Tipagem mínima do Google Identity Services
interface TokenClient {
  requestAccessToken: (opts?: { prompt?: string }) => void;
  callback: (resp: { access_token?: string; error?: string }) => void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;

/** Carrega o script do Google Identity Services uma única vez. */
function loadGisScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Falha ao carregar o Google Identity Services.'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

let cachedToken: string | null = null;

/** Abre o popup de consentimento do Google e resolve com o access token. */
export async function connectGoogle(): Promise<string> {
  if (!isGoogleConfigured) {
    throw new Error('Google Client ID não configurado.');
  }
  await loadGisScript();
  return new Promise<string>((resolve, reject) => {
    try {
      const tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID!,
        scope: SCOPE,
        callback: (resp) => {
          if (resp.error || !resp.access_token) {
            reject(new Error(resp.error || 'Autorização negada.'));
            return;
          }
          cachedToken = resp.access_token;
          resolve(resp.access_token);
        },
        error_callback: (err) => {
          // popup fechado, bloqueado pelo navegador, etc.
          const msg = err?.type === 'popup_closed'
            ? 'Janela do Google fechada antes de concluir.'
            : err?.type === 'popup_failed_to_open'
              ? 'O navegador bloqueou o popup. Permita popups e tente de novo.'
              : (err?.message || 'Não foi possível conectar ao Google.');
          reject(new Error(msg));
        },
      });
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (e) {
      reject(e as Error);
    }
  });
}

/**
 * Busca eventos do calendário principal entre duas datas.
 * @param token  access token obtido em connectGoogle()
 * @param monthsBack  janela retroativa (default 1 mês)
 * @param monthsAhead janela futura (default 3 meses)
 */
export async function fetchCalendarEvents(
  token: string,
  monthsBack = 1,
  monthsAhead = 3
): Promise<CalendarEventInput[]> {
  const now = new Date();
  const timeMin = new Date(now); timeMin.setMonth(timeMin.getMonth() - monthsBack);
  const timeMax = new Date(now); timeMax.setMonth(timeMax.getMonth() + monthsAhead);

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      cachedToken = null; // força novo consentimento na próxima tentativa
      throw new Error('Sessão do Google expirada ou sem permissão. Conecte novamente.');
    }
    throw new Error(`Erro ao ler a agenda (${res.status}).`);
  }
  const data = await res.json();
  const items: any[] = data.items || [];

  return items
    .filter(it => it.status !== 'cancelled' && it.start && (it.start.dateTime || it.start.date))
    .map((it): CalendarEventInput => {
      const allDay = !it.start.dateTime;
      // Resolve o fim do evento de forma robusta (dateTime > date > início)
      let end: string;
      if (it.end?.dateTime) end = it.end.dateTime;
      else if (it.end?.date) end = `${it.end.date}T23:59:59`;
      else end = it.start.dateTime || `${it.start.date}T23:59:59`;
      return {
        id: it.id,
        title: it.summary || '(sem título)',
        description: it.description || '',
        location: it.location || '',
        start: it.start.dateTime || `${it.start.date}T00:00:00`,
        end,
        allDay,
      };
    });
}

/** Retorna o token em cache (se a sessão ainda estiver válida). */
export function getCachedToken(): string | null {
  return cachedToken;
}
