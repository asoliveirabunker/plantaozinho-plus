import { supabase, isSupabaseConfigured } from './supabase';
import { isGuestUser } from '../types';
import { importLocalData } from './supabaseDb';
import type { Workplace, Shift, ShiftTemplate, RecurrenceRule } from '../types';

/**
 * Camada de espelhamento localStorage → Supabase (write-through).
 * O app continua lendo/escrevendo no localStorage (síncrono) via db.ts; estas
 * funções replicam cada escrita na nuvem em segundo plano e hidratam o cache
 * local a partir da nuvem no login. Só agem quando o Supabase está configurado
 * e o usuário atual é real (visitante permanece 100% local).
 */

const PREFIX = 'plantos_';

/** Espelhar para a nuvem? Supabase configurado + usuário real (não-visitante). */
export function cloudActive(): boolean {
  if (!isSupabaseConfigured) return false;
  try {
    const raw = localStorage.getItem(PREFIX + 'current_user');
    const u = raw ? JSON.parse(raw) : null;
    return !!u && !isGuestUser(u);
  } catch { return false; }
}

function log(ctx: string, e: unknown) {
  console.error(`[cloudSync] ${ctx}:`, (e as { message?: string })?.message || e);
}

/** Remove chaves indesejadas e campos undefined antes de enviar ao banco. */
function clean<T extends Record<string, unknown>>(obj: T, drop: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if (drop.includes(k)) continue;
    const v = (obj as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// --- Locais ---
export function mirrorWorkplace(w: Workplace): void {
  if (!cloudActive()) return;
  supabase.from('workplaces').upsert(clean(w, ['updated_at']) as never)
    .then(({ error }) => { if (error) log('upsert workplace', error); });
}
export function mirrorDeleteWorkplace(id: string): void {
  if (!cloudActive()) return;
  supabase.from('workplaces').update({ active: false } as never).eq('id', id)
    .then(({ error }) => { if (error) log('delete workplace', error); });
}

// --- Modelos ---
export function mirrorTemplate(t: ShiftTemplate): void {
  if (!cloudActive()) return;
  supabase.from('shift_templates').upsert(clean(t) as never)
    .then(({ error }) => { if (error) log('upsert template', error); });
}
export function mirrorDeleteTemplate(id: string): void {
  if (!cloudActive()) return;
  supabase.from('shift_templates').delete().eq('id', id)
    .then(({ error }) => { if (error) log('delete template', error); });
}

// --- Plantões ---
export function mirrorShift(s: Shift): void {
  if (!cloudActive()) return;
  supabase.from('shifts').upsert(clean(s, ['updated_at']) as never)
    .then(({ error }) => { if (error) log('upsert shift', error); });
}
export function mirrorShifts(list: Shift[]): void {
  if (!cloudActive() || !list.length) return;
  supabase.from('shifts').upsert(list.map(s => clean(s, ['updated_at'])) as never)
    .then(({ error }) => { if (error) log('upsert shifts', error); });
}
export function mirrorDeleteShift(opts: { id?: string; recurrenceId?: string }): void {
  if (!cloudActive()) return;
  if (opts.recurrenceId) {
    supabase.from('shifts').delete().eq('recurrence_id', opts.recurrenceId)
      .then(({ error }) => { if (error) log('delete shifts(recorrência)', error); });
  } else if (opts.id) {
    supabase.from('shifts').delete().eq('id', opts.id)
      .then(({ error }) => { if (error) log('delete shift', error); });
  }
}

// --- Recorrência ---
export function mirrorRecurrence(r: RecurrenceRule): void {
  if (!cloudActive()) return;
  supabase.from('recurrence_rules').upsert(clean(r) as never)
    .then(({ error }) => { if (error) log('upsert recurrence', error); });
}

/**
 * Baixa os dados do usuário da nuvem e substitui as linhas dele no cache local.
 * Chamado no login (antes de carregar a UI) para que a leitura síncrona do
 * db.ts already reflita a fonte de verdade na nuvem.
 */
export async function hydrateUserFromCloud(userId: string): Promise<void> {
  if (!cloudActive()) return;
  const replaceUserRows = (key: string, rows: { user_id?: string }[]) => {
    let all: { user_id?: string }[] = [];
    try { all = JSON.parse(localStorage.getItem(PREFIX + key) || '[]'); } catch { all = []; }
    const others = all.filter(r => r.user_id !== userId);
    localStorage.setItem(PREFIX + key, JSON.stringify([...others, ...rows]));
  };
  try {
    const [wps, tpls, shs] = await Promise.all([
      supabase.from('workplaces').select('*').eq('user_id', userId),
      supabase.from('shift_templates').select('*').eq('user_id', userId),
      supabase.from('shifts').select('*').eq('user_id', userId),
    ]);
    if (wps.data) replaceUserRows('workplaces', wps.data as { user_id?: string }[]);
    if (tpls.data) replaceUserRows('templates', tpls.data as { user_id?: string }[]);
    if (shs.data) replaceUserRows('shifts', shs.data as { user_id?: string }[]);
  } catch (e) { log('hydrate', e); }
}

function readLocal(key: string): any[] {
  try { return JSON.parse(localStorage.getItem(PREFIX + key) || '[]'); } catch { return []; }
}
function writeLocal(key: string, rows: any[]): void {
  localStorage.setItem(PREFIX + key, JSON.stringify(rows));
}
function guestUserIds(): Set<string> {
  const ids = new Set<string>();
  try {
    for (const u of readLocal('users')) {
      if (isGuestUser(u)) ids.add(u.id);
    }
  } catch { /* ignore */ }
  return ids;
}

/** Quantos registros locais legados existem para importar (não-atuais, não-visitante). */
export function countLegacyLocalData(currentUserId: string): number {
  const guests = guestUserIds();
  const keep = (uid?: string) => !!uid && uid !== currentUserId && !guests.has(uid);
  return readLocal('workplaces').filter((w: any) => keep(w.user_id)).length
    + readLocal('templates').filter((t: any) => keep(t.user_id)).length
    + readLocal('shifts').filter((s: any) => keep(s.user_id)).length;
}

/**
 * Importa para a nuvem os dados locais legados (de antes da migração): registros
 * que não são do usuário atual nem de um visitante. Sobe com IDs novos,
 * remove a origem local e re-hidrata o cache do usuário atual.
 */
export async function importLegacyLocalToCloud(currentUserId: string): Promise<{ workplaces: number; templates: number; shifts: number }> {
  if (!cloudActive()) return { workplaces: 0, templates: 0, shifts: 0 };
  const guests = guestUserIds();
  const keep = (uid?: string) => !!uid && uid !== currentUserId && !guests.has(uid);
  const workplaces = readLocal('workplaces').filter((w: any) => keep(w.user_id));
  const templates = readLocal('templates').filter((t: any) => keep(t.user_id));
  const shifts = readLocal('shifts').filter((s: any) => keep(s.user_id));
  if (!workplaces.length && !templates.length && !shifts.length) {
    return { workplaces: 0, templates: 0, shifts: 0 };
  }
  const result = await importLocalData({ workplaces, templates, shifts });
  // Remove os registros legados de origem (agora vivem na nuvem com novos IDs)
  writeLocal('workplaces', readLocal('workplaces').filter((w: any) => !keep(w.user_id)));
  writeLocal('templates', readLocal('templates').filter((t: any) => !keep(t.user_id)));
  writeLocal('shifts', readLocal('shifts').filter((s: any) => !keep(s.user_id)));
  await hydrateUserFromCloud(currentUserId);
  return result;
}
