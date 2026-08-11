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
function clean(obj: object, drop: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if (drop.includes(k)) continue;
    const v = (obj as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// ============================================================================
// Fila de sincronização (offline-safe): cada escrita vira uma operação
// persistida em localStorage; é enviada ao Supabase e só removida da fila em
// caso de sucesso. Reenviada na reconexão e antes da hidratação no login.
// ============================================================================
type SyncOp =
  | { k: 'upsert'; table: string; row: Record<string, unknown>; key: string }
  | { k: 'delete'; table: string; match: Record<string, unknown>; key: string };

const QUEUE_KEY = 'sync_queue';

function readQueue(): SyncOp[] {
  try { return JSON.parse(localStorage.getItem(PREFIX + QUEUE_KEY) || '[]'); } catch { return []; }
}
function writeQueue(q: SyncOp[]): void {
  localStorage.setItem(PREFIX + QUEUE_KEY, JSON.stringify(q));
}

/** Enfileira uma operação (dedupe por `key`: última operação por entidade vence). */
function enqueue(op: SyncOp): void {
  if (!cloudActive()) return;
  const q = readQueue().filter(o => o.key !== op.key);
  q.push(op);
  writeQueue(q);
  void flushQueue();
}

async function execOp(op: SyncOp): Promise<void> {
  if (op.k === 'upsert') {
    const { error } = await supabase.from(op.table).upsert(op.row as never);
    if (error) throw error;
  } else {
    let q = supabase.from(op.table).delete();
    for (const [k, v] of Object.entries(op.match)) q = q.eq(k, v as never);
    const { error } = await q;
    if (error) throw error;
  }
}

let flushing = false;
/** Envia a fila em ordem (FIFO). Para no primeiro erro para preservar a ordem/FK. */
export async function flushQueue(): Promise<boolean> {
  if (!cloudActive() || flushing) return false;
  flushing = true;
  try {
    let q = readQueue();
    while (q.length) {
      try { await execOp(q[0]); }
      catch (e) { log('flush', e); break; }
      q = q.slice(1);
      writeQueue(q);
    }
    return readQueue().length === 0;
  } finally { flushing = false; }
}

/** Quantidade de operações ainda pendentes de envio à nuvem. */
export function pendingSyncCount(): number { return readQueue().length; }

// --- Locais (delete = upsert com active:false, preservado no offline) ---
export function mirrorWorkplace(w: Workplace): void {
  enqueue({ k: 'upsert', table: 'workplaces', row: clean(w, ['updated_at']), key: `workplaces:${w.id}` });
}

// --- Modelos ---
export function mirrorTemplate(t: ShiftTemplate): void {
  enqueue({ k: 'upsert', table: 'shift_templates', row: clean(t), key: `shift_templates:${t.id}` });
}
export function mirrorDeleteTemplate(id: string): void {
  enqueue({ k: 'delete', table: 'shift_templates', match: { id }, key: `shift_templates:${id}` });
}

// --- Plantões ---
export function mirrorShift(s: Shift): void {
  enqueue({ k: 'upsert', table: 'shifts', row: clean(s, ['updated_at']), key: `shifts:${s.id}` });
}
export function mirrorShifts(list: Shift[]): void {
  for (const s of list) mirrorShift(s);
}
export function mirrorDeleteShift(opts: { id?: string; recurrenceId?: string }): void {
  if (opts.recurrenceId) {
    enqueue({ k: 'delete', table: 'shifts', match: { recurrence_id: opts.recurrenceId }, key: `shifts:rec:${opts.recurrenceId}` });
  } else if (opts.id) {
    enqueue({ k: 'delete', table: 'shifts', match: { id: opts.id }, key: `shifts:${opts.id}` });
  }
}

// --- Recorrência ---
export function mirrorRecurrence(r: RecurrenceRule): void {
  enqueue({ k: 'upsert', table: 'recurrence_rules', row: clean(r), key: `recurrence_rules:${r.id}` });
}

// Reenvia a fila automaticamente quando a conexão volta.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushQueue(); });
}

/**
 * Assina mudanças em tempo real dos dados do usuário (multi-dispositivo).
 * Chama `onChange` a cada evento em shifts/workplaces/shift_templates do usuário.
 * Retorna a função para cancelar a assinatura.
 */
export function subscribeUserData(userId: string, onChange: () => void): () => void {
  if (!cloudActive()) return () => {};
  const channel = supabase
    .channel(`userdata:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts', filter: `user_id=eq.${userId}` }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workplaces', filter: `user_id=eq.${userId}` }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_templates', filter: `user_id=eq.${userId}` }, () => onChange())
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

/**
 * Baixa os dados do usuário da nuvem e substitui as linhas dele no cache local.
 * Chamado no login (antes de carregar a UI) para que a leitura síncrona do
 * db.ts already reflita a fonte de verdade na nuvem.
 */
export async function hydrateUserFromCloud(userId: string): Promise<void> {
  if (!cloudActive()) return;
  // Envia primeiro o que estiver pendente, para não sobrescrever escritas locais
  // ainda não sincronizadas ao substituir o cache pelo estado da nuvem.
  await flushQueue();
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
