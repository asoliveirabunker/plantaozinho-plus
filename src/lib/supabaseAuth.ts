import { supabase } from './supabase';
import type { ProfileType } from './database.types';
import type { User, SubscriptionPlan } from '../types';

/**
 * Helpers de autenticação Supabase.
 * Cada função retorna `{ data, error }` no padrão do SDK.
 */

export interface SignUpData {
  email: string;
  password: string;
  name: string;
  specialty?: string;
  profile_type?: ProfileType;
  whatsapp?: string;
  goals?: string[];
  crm?: string;
}

/** Cadastra um novo usuário. O profile é criado automaticamente via trigger handle_new_user(). */
export async function signUp(data: SignUpData) {
  return supabase.auth.signUp({
    email: data.email.trim().toLowerCase(),
    password: data.password,
    options: {
      data: {
        name: data.name.trim(),
        specialty: data.specialty || null,
        profile_type: data.profile_type || 'plantonista',
        whatsapp: data.whatsapp || null,
        goals: data.goals || [],
        crm: data.crm || null,
        onboarding_completed: true,
      },
    },
  });
}

/** Login por e-mail e senha. */
export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
}

/** Logout — remove a sessão e dispara o listener onAuthStateChange. */
export async function signOut() {
  return supabase.auth.signOut();
}

/** Solicita e-mail de recuperação de senha. */
export async function resetPassword(email: string, redirectTo?: string) {
  return supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: redirectTo ?? `${window.location.origin}/reset-password`,
  });
}

/** Atualiza a senha do usuário autenticado. */
export async function updatePassword(newPassword: string) {
  return supabase.auth.updateUser({ password: newPassword });
}

/** Retorna a sessão atual (ou null se não autenticado). */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  return { session: data.session, error };
}

/** Retorna o profile completo do usuário autenticado, ou null. */
export async function getCurrentProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) {
    console.error('[supabaseAuth] erro lendo profile:', error);
    return null;
  }
  return profile;
}

/**
 * Listener global: chama o callback sempre que o estado de auth muda
 * (login, logout, refresh token, etc.). Use em App.tsx para sincronizar
 * o contexto da aplicação.
 *
 * @returns função para cancelar a subscription
 */
export function onAuthChange(callback: (userId: string | null) => void) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user?.id ?? null);
  });
  return () => subscription.unsubscribe();
}

/** Converte uma linha de `profiles` no tipo `User` da aplicação. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapProfileToUser(p: any): User {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    password: '', // não aplicável no modo Supabase (auth cuida da senha)
    specialty: p.specialty || '',
    profile_type: p.profile_type,
    subscription_plan: (p.subscription_plan as SubscriptionPlan) || 'free',
    whatsapp: p.whatsapp || undefined,
    goals: p.goals || [],
    created_at: p.created_at,
    onboarding_completed: !!p.onboarding_completed,
    tax_regime: p.tax_regime || undefined,
    tax_rate: p.tax_rate ?? undefined,
    company_name: p.company_name || undefined,
    cnpj: p.cnpj || undefined,
    crm: p.crm || undefined,
  };
}

/**
 * Muda o plano do usuário escrevendo em `user_subscriptions` (fonte de verdade).
 * O trigger `sync_subscription_plan_to_profile` atualiza `profiles.subscription_plan`.
 */
export async function setSubscriptionPlan(planId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: new Error('Sem sessão') };
  const { error } = await supabase
    .from('user_subscriptions')
    .update({ plan_id: planId, status: 'active' })
    .eq('user_id', user.id);
  return { error };
}

/** Atualiza o profile do usuário autenticado com um subconjunto de campos do `User`. */
export async function updateMyProfile(updates: Partial<User>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: new Error('Sem sessão') };
  // Mapeia só as colunas que existem em `profiles`
  const row: Record<string, unknown> = {};
  const allowed: (keyof User)[] = [
    'name', 'specialty', 'profile_type', 'subscription_plan', 'whatsapp',
    'goals', 'onboarding_completed', 'tax_regime', 'tax_rate', 'company_name', 'cnpj', 'crm',
  ];
  for (const k of allowed) {
    if (k in updates && updates[k] !== undefined) row[k] = updates[k];
  }
  if (Object.keys(row).length === 0) return { error: null };
  const { error } = await supabase.from('profiles').update(row).eq('id', user.id);
  return { error };
}
