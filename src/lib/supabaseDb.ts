import { supabase } from './supabase';
import type { Database } from './database.types';
import { parseISO, addDays, addWeeks, addMonths, isAfter, format } from 'date-fns';

/* eslint-disable @typescript-eslint/no-explicit-any */
function omit<T extends Record<string, any>>(obj: T, keys: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of Object.keys(obj)) if (!keys.includes(k)) out[k] = obj[k];
  return out;
}
function addHours(d: Date, h: number): Date { return new Date(d.getTime() + h * 3600000); }

/**
 * CRUD assíncrono espelhando as assinaturas de src/lib/db.ts (localStorage).
 * Migração gradual: você pode trocar imports `from '../lib/db'` por `from '../lib/supabaseDb'`
 * em uma tela por vez, transformando funções síncronas em async.
 *
 * Todas as queries respeitam RLS — o Supabase aplica auth.uid() = user_id automaticamente.
 */

type Profile     = Database['public']['Tables']['profiles']['Row'];
type Workplace   = Database['public']['Tables']['workplaces']['Row'];
type Shift       = Database['public']['Tables']['shifts']['Row'];
type Template    = Database['public']['Tables']['shift_templates']['Row'];
type Recurrence  = Database['public']['Tables']['recurrence_rules']['Row'];

// ============================================================================
// PROFILE
// ============================================================================
export async function getCurrentUser(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return data;
}

export async function updateProfile(updates: Partial<Profile>): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ============================================================================
// WORKPLACES
// ============================================================================
export async function getWorkplaces(): Promise<Workplace[]> {
  const { data, error } = await supabase
    .from('workplaces')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getWorkplace(id: string): Promise<Workplace | null> {
  const { data } = await supabase.from('workplaces').select('*').eq('id', id).single();
  return data;
}

export async function createWorkplace(input: Omit<Workplace, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<Workplace> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');
  const { data, error } = await supabase
    .from('workplaces')
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateWorkplace(id: string, updates: Partial<Workplace>): Promise<Workplace> {
  const { data, error } = await supabase
    .from('workplaces')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteWorkplace(id: string): Promise<void> {
  // Soft-delete: marca como inativo em vez de excluir (preserva histórico de plantões)
  const { error } = await supabase.from('workplaces').update({ active: false }).eq('id', id);
  if (error) throw error;
}

// ============================================================================
// SHIFT TEMPLATES
// ============================================================================
export async function getShiftTemplates(workplaceId?: string): Promise<Template[]> {
  let q = supabase.from('shift_templates').select('*').order('created_at', { ascending: false });
  if (workplaceId) q = q.eq('workplace_id', workplaceId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createShiftTemplate(input: Omit<Template, 'id' | 'user_id' | 'created_at'>): Promise<Template> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');
  const { data, error } = await supabase
    .from('shift_templates')
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateShiftTemplate(id: string, updates: Partial<Template>): Promise<Template> {
  const { data, error } = await supabase
    .from('shift_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteShiftTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('shift_templates').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================================
// SHIFTS
// ============================================================================
export async function getShifts(filter?: { from?: string; to?: string; status?: string; workplaceId?: string }): Promise<Shift[]> {
  let q = supabase.from('shifts').select('*').order('date', { ascending: false });
  if (filter?.from) q = q.gte('date', filter.from);
  if (filter?.to)   q = q.lte('date', filter.to);
  if (filter?.status) q = q.eq('status', filter.status);
  if (filter?.workplaceId) q = q.eq('workplace_id', filter.workplaceId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createShift(input: Omit<Shift, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<Shift> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');
  const { data, error } = await supabase
    .from('shifts')
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateShift(id: string, updates: Partial<Shift>): Promise<Shift> {
  const { data, error } = await supabase
    .from('shifts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteShift(id: string): Promise<void> {
  const { error } = await supabase.from('shifts').delete().eq('id', id);
  if (error) throw error;
}

export async function markShiftReceived(id: string, receivedValue: number): Promise<Shift> {
  return updateShift(id, {
    status: 'recebido',
    received_value: receivedValue,
    payment_received_date: new Date().toISOString(),
  });
}

// ============================================================================
// RECURRENCE
// ============================================================================
export async function createRecurrence(input: Omit<Recurrence, 'id' | 'user_id' | 'created_at'>): Promise<Recurrence> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');
  const { data, error } = await supabase
    .from('recurrence_rules')
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Cria a regra de recorrência E gera os plantões da série (espelha
 * createRecurrenceShifts do localStorage). Insere tudo no Supabase.
 */
export async function createRecurrenceShifts(
  baseShiftData: Record<string, any>,
  rule: {
    workplace_id: string; frequency: string; interval: number; weekdays?: number[];
    start_date: string; end_date?: string | null; occurrences?: number | null;
    pattern_label: string; active: boolean;
  },
  workplacePaymentDay: number,
): Promise<Shift[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  // 1) regra
  const { data: ruleRow, error: ruleErr } = await supabase
    .from('recurrence_rules')
    .insert({
      user_id: user.id, workplace_id: rule.workplace_id, frequency: rule.frequency as any,
      interval: rule.interval, weekdays: rule.weekdays ?? null, start_date: rule.start_date,
      end_date: rule.end_date ?? null, occurrences: rule.occurrences ?? null,
      pattern_label: rule.pattern_label, active: rule.active,
    } as any)
    .select().single();
  if (ruleErr) throw ruleErr;

  // 2) datas (mesma lógica do localStorage)
  const startDate = parseISO(rule.start_date);
  const endDate = rule.end_date ? parseISO(rule.end_date) : addMonths(startDate, 3);
  const maxOcc = rule.occurrences || 50;
  const [startH, startM] = baseShiftData._start_time ? String(baseShiftData._start_time).split(':').map(Number) : [7, 0];
  const [endH, endM] = baseShiftData._end_time ? String(baseShiftData._end_time).split(':').map(Number) : [19, 0];
  const dates: Date[] = [];
  let current = startDate; let count = 0;
  while (!isAfter(current, endDate) && count < maxOcc) {
    const f = rule.frequency;
    if (f === 'weekly' && rule.weekdays?.length) {
      if (rule.weekdays.includes(current.getDay())) { dates.push(new Date(current)); count++; }
      current = addDays(current, 1);
    } else if (f === '12x36') { dates.push(new Date(current)); count++; current = addHours(current, 36); }
    else if (f === '24x72') { dates.push(new Date(current)); count++; current = addHours(current, 72); }
    else if (f === '48h') { dates.push(new Date(current)); count++; current = addHours(current, 48); }
    else if (f === '72h') { dates.push(new Date(current)); count++; current = addHours(current, 72); }
    else if (f === 'biweekly') { dates.push(new Date(current)); count++; current = addWeeks(current, 2); }
    else if (f === 'monthly') { dates.push(new Date(current)); count++; current = addMonths(current, 1); }
    else if (f === 'daily') { dates.push(new Date(current)); count++; current = addDays(current, rule.interval || 1); }
    else { dates.push(new Date(current)); count++; current = addWeeks(current, rule.interval || 1); }
  }

  // 3) plantões em lote
  const base = omit(baseShiftData, ['_start_time', '_end_time', 'id', 'user_id', 'created_at', 'updated_at', 'date', 'start_datetime', 'end_datetime']);
  const rows = dates.map(date => {
    const s = new Date(date); s.setHours(startH, startM, 0, 0);
    let e = new Date(date); e.setHours(endH, endM, 0, 0);
    if (e <= s) e = addDays(e, 1);
    const paymentDue = new Date(date.getFullYear(), date.getMonth() + 1, workplacePaymentDay);
    return {
      ...base, user_id: user.id, date: format(date, 'yyyy-MM-dd'),
      start_datetime: s.toISOString(), end_datetime: e.toISOString(),
      duration_hours: (e.getTime() - s.getTime()) / 3600000,
      recurrence_id: ruleRow.id, payment_due_date: format(paymentDue, 'yyyy-MM-dd'),
    };
  });
  if (!rows.length) return [];
  const { data, error } = await supabase.from('shifts').insert(rows as any).select();
  if (error) throw error;
  return data ?? [];
}

/**
 * Importa dados do localStorage para o Supabase (uma vez). Reatribui IDs e
 * preserva as relações local → modelo → plantão. Idempotência fica a cargo
 * do chamador (rodar só quando o usuário pedir).
 */
export async function importLocalData(payload: { workplaces?: any[]; templates?: any[]; shifts?: any[] }): Promise<{ workplaces: number; templates: number; shifts: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');
  const wpMap = new Map<string, string>();
  const tplMap = new Map<string, string>();
  let wpN = 0, tplN = 0, shN = 0;

  for (const w of payload.workplaces ?? []) {
    const rest = omit(w, ['id', 'user_id', 'created_at', 'updated_at']);
    const { data, error } = await supabase.from('workplaces').insert({ ...rest, user_id: user.id } as any).select().single();
    if (error) throw error;
    wpMap.set(w.id, data.id); wpN++;
  }
  for (const t of payload.templates ?? []) {
    const rest = omit(t, ['id', 'user_id', 'created_at']);
    const wid = wpMap.get(t.workplace_id) || t.workplace_id;
    const { data, error } = await supabase.from('shift_templates').insert({ ...rest, workplace_id: wid, user_id: user.id } as any).select().single();
    if (error) throw error;
    tplMap.set(t.id, data.id); tplN++;
  }
  for (const s of payload.shifts ?? []) {
    const rest = omit(s, ['id', 'user_id', 'created_at', 'updated_at', 'recurrence_id']);
    const wid = wpMap.get(s.workplace_id) || s.workplace_id;
    const tid = s.template_id ? (tplMap.get(s.template_id) || null) : null;
    const { error } = await supabase.from('shifts').insert({ ...rest, workplace_id: wid, template_id: tid, user_id: user.id } as any);
    if (error) throw error;
    shN++;
  }
  return { workplaces: wpN, templates: tplN, shifts: shN };
}

// ============================================================================
// STATS — usa a função SQL get_monthly_stats() para cálculos no banco
// ============================================================================
export async function getMonthlyStats(year: number, month: number) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.rpc('get_monthly_stats', {
    p_user_id: user.id,
    p_year: year,
    p_month: month,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}

// ============================================================================
// SUBSCRIPTION
// ============================================================================
export async function getCurrentSubscription() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('user_subscriptions')
    .select('*, subscription_plans!inner(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

export async function getAvailablePlans() {
  const { data } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('display_order');
  return data ?? [];
}

// ============================================================================
// REALTIME — subscribe a mudanças nos plantões do usuário
// ============================================================================
export function subscribeToShifts(userId: string, callback: (payload: { eventType: string; new?: Shift; old?: Shift }) => void) {
  const channel = supabase
    .channel(`shifts:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shifts', filter: `user_id=eq.${userId}` },
      (payload) => {
        callback({
          eventType: payload.eventType,
          new: payload.new as Shift | undefined,
          old: payload.old as Shift | undefined,
        });
      }
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
