import type { SubscriptionPlan } from '../types';

/**
 * Definição central dos planos do Plantão Pro.
 * Toda regra de acesso (limites + features) vive aqui — ponto único de verdade.
 */

export type PlanId = SubscriptionPlan; // 'free' | 'pro' | 'max'

/** Página de vendas — destino de todos os botões de assinatura do app. */
export const SUBSCRIPTION_URL = 'https://plantaopro-vendas.vercel.app/';

/**
 * Monta a URL do checkout já identificando a conta. Sem `uid`/`email` o
 * webhook do Mercado Pago não tem como saber qual conta ativar após o
 * pagamento — por isso sempre passamos os dois quando há usuário logado.
 */
export function buildSubscriptionUrl(
  plan: PlanId,
  user?: { id?: string; email?: string } | null,
): string {
  const url = new URL(SUBSCRIPTION_URL);
  url.searchParams.set('plano', plan);
  if (user?.id) url.searchParams.set('uid', user.id);
  if (user?.email) url.searchParams.set('email', user.email);
  return url.toString();
}

/** Features que podem ser bloqueadas. Cada uma exige um plano mínimo. */
export type Feature =
  | 'unlimited_workplaces'   // Pro — Free permite só 1 local
  | 'unlimited_shifts'       // Pro — Free permite até 10 plantões/mês
  | 'recurrence'             // Pro — escalas recorrentes (12x36, 24x72…)
  | 'charts'                 // Pro — gráfico de evolução
  | 'goals'                  // Pro — meta financeira do mês
  | 'overdue_alerts'         // Pro — alertas/aba de atrasos
  | 'fiscal_report'          // Max — relatório fiscal / PDF contador
  | 'tax_forecast'           // Max — previsão tributária
  | 'fiscal_fields'          // Pro — forma de recebimento nos plantões
  | 'shift_editing'          // Pro — edição completa de plantões
  | 'multiple_cnpj'          // Max — múltiplos CNPJs
  | 'annual_reports'         // Max — relatórios anuais
  | 'whatsapp_accountant'    // Max — envio ao contador via WhatsApp
  | 'unlimited_history'      // Max — histórico ilimitado
  | 'priority_support'       // Max — suporte prioritário
  | 'mixed_fiscal_report';   // Max — relatório financeiro misto por regime fiscal

/** Hierarquia de planos — usada para comparar "é >= que o requerido". */
export const PLAN_RANK: Record<PlanId, number> = {
  free: 0,
  pro: 1,
  max: 2,
};

/** Plano mínimo necessário para cada feature. */
export const FEATURE_MIN_PLAN: Record<Feature, PlanId> = {
  unlimited_workplaces: 'pro',
  unlimited_shifts: 'pro',
  recurrence: 'pro',
  charts: 'pro',
  goals: 'pro',
  overdue_alerts: 'pro',
  fiscal_report: 'max',
  tax_forecast: 'max',
  fiscal_fields: 'pro',
  shift_editing: 'pro',
  multiple_cnpj: 'max',
  annual_reports: 'max',
  whatsapp_accountant: 'max',
  unlimited_history: 'max',
  priority_support: 'max',
  mixed_fiscal_report: 'max',
};

/** Limites quantitativos por plano. null = ilimitado. */
export interface PlanLimits {
  maxWorkplaces: number | null;
  maxShiftsPerMonth: number | null;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: { maxWorkplaces: 1, maxShiftsPerMonth: 10 },
  pro:  { maxWorkplaces: null, maxShiftsPerMonth: null },
  max:  { maxWorkplaces: null, maxShiftsPerMonth: null },
};

/** Metadados de exibição de cada plano. */
export interface PlanMeta {
  id: PlanId;
  name: string;
  tagline: string;
  color: string;       // cor de acento
  gradient: string;    // gradiente do badge/header
  highlights: string[]; // bullets exibidos no upsell
  priceLabel?: string;  // ex.: "R$ 29,90/mês" (null = grátis)
}

export const PLAN_META: Record<PlanId, PlanMeta> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'O essencial para começar',
    color: '#64748b',
    gradient: 'linear-gradient(135deg, #94a3b8, #64748b)',
    highlights: [
      '1 local de trabalho',
      'Até 10 plantões por mês',
      'Painel financeiro mensal',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'Para o plantonista no controle total',
    color: '#03bb85',
    gradient: 'linear-gradient(135deg, #03bb85, #39d39b, #27c8fe)',
    priceLabel: 'R$ 14,90/mês',
    highlights: [
      'Locais e plantões ilimitados',
      'Edição completa de plantões',
      'Escalas recorrentes (12x36, 24x72…)',
      'Gráficos, metas e alertas',
    ],
  },
  max: {
    id: 'max',
    name: 'Max',
    tagline: 'Gestão completa para alta performance',
    color: '#8b5cf6',
    gradient: 'linear-gradient(135deg, #a855f7, #8b5cf6)',
    priceLabel: 'R$ 29,90/mês',
    highlights: [
      'Relatório completo para o contador (PDF + planilha, por forma de recebimento)',
      'Previsão tributária do seu regime',
      'Múltiplos CNPJs e relatórios anuais',
      'Envio ao contador via WhatsApp',
      'Histórico ilimitado e suporte prioritário',
    ],
  },
};

/** Rótulo descritivo de cada feature (mostrado no modal de upgrade). */
export const FEATURE_LABEL: Record<Feature, { title: string; description: string }> = {
  unlimited_workplaces: { title: 'Locais ilimitados', description: 'Cadastre quantos hospitais, UPAs e clínicas quiser.' },
  unlimited_shifts:     { title: 'Plantões ilimitados', description: 'Registre todos os seus plantões, sem limite mensal.' },
  recurrence:           { title: 'Escalas recorrentes', description: 'Crie séries automáticas como 12x36, 24x72 ou mensais.' },
  charts:               { title: 'Gráficos de evolução', description: 'Acompanhe a evolução dos seus ganhos ao longo dos meses.' },
  goals:                { title: 'Metas financeiras', description: 'Defina e acompanhe sua meta de faturamento do mês.' },
  overdue_alerts:       { title: 'Alertas de atrasos', description: 'Saiba exatamente quais pagamentos estão atrasados.' },
  fiscal_report:        { title: 'Relatório fiscal', description: 'Gere PDF/CSV completo para enviar ao seu contador.' },
  tax_forecast:         { title: 'Previsão tributária', description: 'Calcule a provisão de impostos do seu regime.' },
  shift_editing:        { title: 'Edição de plantões', description: 'Altere status, valores, horários e observações de qualquer plantão.' },
  fiscal_fields:        { title: 'Forma de recebimento', description: 'Classifique cada plantão por regime (MEI, Simples, PJ, PF/RPA) ao registrar.' },
  multiple_cnpj:        { title: 'Múltiplos CNPJs', description: 'Gerencie faturamento de vários CNPJs separadamente.' },
  annual_reports:       { title: 'Relatórios anuais', description: 'Visão consolidada do ano inteiro para o IR.' },
  whatsapp_accountant:  { title: 'Envio ao contador', description: 'Mande relatórios direto ao seu contador via WhatsApp.' },
  unlimited_history:    { title: 'Histórico ilimitado', description: 'Acesse todos os seus dados, sem limite de tempo.' },
  priority_support:     { title: 'Suporte prioritário', description: 'Atendimento preferencial sempre que precisar.' },
  mixed_fiscal_report:  { title: 'Relatório para o contador', description: 'Relatório do mês em PDF e planilha, com separação por forma de recebimento (PJ/Autônomo) ou local.' },
};

/** Retorna true se o plano atual tem acesso à feature. */
export function planHasFeature(plan: PlanId, feature: Feature): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[FEATURE_MIN_PLAN[feature]];
}
