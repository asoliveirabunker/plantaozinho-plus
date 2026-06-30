import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Cliente Supabase tipado.
 *
 * Configuração: crie um projeto em https://supabase.com e adicione no .env:
 *   VITE_SUPABASE_URL=https://xxxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJhbGc...
 *
 * A anon key é segura para uso no frontend porque as policies de RLS
 * impedem que um cliente leia/altere dados de outros usuários.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não definidas. ' +
    'Crie um arquivo .env na raiz do projeto (veja .env.example).'
  );
}

export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'plantos_session',
    },
    db: { schema: 'public' },
    global: { headers: { 'x-application-name': 'plantao-pro' } },
  }
);

/** True se a configuração do Supabase está válida (URL + key não-placeholder). */
export const isSupabaseConfigured =
  !!supabaseUrl &&
  !!supabaseAnonKey &&
  !supabaseUrl.includes('placeholder');
