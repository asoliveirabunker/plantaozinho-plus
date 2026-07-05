// ============================================================
// TIPOS PRINCIPAIS DO SISTEMA PLANTÃO PRO
// ============================================================

export type ProfileType = 'residente' | 'plantonista' | 'especialista' | 'anestesista' | 'cirurgiao' | 'intensivista' | 'urgencista' | 'outro';
export type SubscriptionPlan = 'free' | 'pro' | 'max';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  specialty: string;
  profile_type: ProfileType;
  subscription_plan: SubscriptionPlan;
  whatsapp?: string;
  goals?: string[];
  created_at: string;
  onboarding_completed: boolean;
  tax_regime?: 'MEI' | 'Simples Nacional' | 'Lucro Presumido' | 'PF';
  tax_rate?: number;
  company_name?: string;
  cnpj?: string;
  crm?: string;
  /** True quando o usuário entrou via "Entrar como visitante" (modo demo). */
  is_guest?: boolean;
  /** Timestamp (ms) de início da sessão do visitante — usado para expirar a sessão. */
  guest_session_started_at?: number;
}

/** Identifica se um usuário é o visitante de demo (pelo flag ou pelo e-mail legado). */
export function isGuestUser(user: Pick<User, 'is_guest' | 'email'> | null | undefined): boolean {
  if (!user) return false;
  return user.is_guest === true || user.email === 'visitante@plantaopro.app';
}

export type WorkplaceType = 'hospital' | 'clinica' | 'upa' | 'pronto_socorro' | 'maternidade' | 'home_care' | 'outro';
export type PaymentMethod = 'PJ' | 'PF' | 'RPA' | 'cooperativa' | 'outro';

export interface Workplace {
  id: string;
  user_id: string;
  name: string;
  type: WorkplaceType;
  color: string;
  default_shift_value: number;
  default_hourly_value?: number;
  default_duration_hours: number;
  payment_day: number;
  payment_method: PaymentMethod;
  contact_name?: string;
  contact_phone?: string;
  cnpj?: string;
  address?: string;
  notes?: string;
  active: boolean;
  created_at: string;
  /** Natureza fiscal padrão deste local (default aplicado aos plantões dele). */
  fiscal_nature?: FiscalNature;
}

/**
 * Resolve a natureza fiscal de um plantão na seguinte ordem:
 *   1) campo explícito do plantão  2) padrão do local  3) deriva do método de pagamento do local.
 */
export function resolveFiscalNature(
  shift: Pick<Shift, 'fiscal_nature'>,
  workplace: Pick<Workplace, 'fiscal_nature' | 'payment_method'> | null | undefined,
): FiscalNature {
  if (shift.fiscal_nature) return shift.fiscal_nature;
  if (workplace?.fiscal_nature) return workplace.fiscal_nature;
  switch (workplace?.payment_method) {
    case 'PJ': return 'PJ';
    case 'RPA':
    case 'PF':
    case 'cooperativa': return 'AUTONOMO';
    default: return 'AUTONOMO';
  }
}

export type ShiftType = 'dia' | 'noite' | '24h' | 'sobreaviso' | 'sala_vermelha' | 'UTI' | 'anestesia' | 'cirurgia' | 'ambulatorio' | 'outro';

export interface ShiftTemplate {
  id: string;
  user_id: string;
  workplace_id: string;
  name: string;
  start_time: string; // "07:00"
  end_time: string;   // "19:00"
  duration_hours: number;
  default_value: number;
  shift_type: ShiftType;
  notes?: string;
}

export type ShiftStatus = 'previsto' | 'realizado' | 'recebido' | 'atrasado' | 'cancelado';

/**
 * Forma de recebimento de um plantão — usada no relatório do contador (Plano Max).
 * Congruente com os regimes das Configurações Contábeis: os regimes de PJ
 * (MEI, Simples Nacional, Lucro Presumido) + recebimento como pessoa física
 * (PF / Autônomo / RPA). 'PJ' permanece como o genérico (legado / não sabe o regime).
 */
export type FiscalNature = 'MEI' | 'SIMPLES' | 'LUCRO_PRESUMIDO' | 'PJ' | 'AUTONOMO';

export const FISCAL_NATURE_LABELS: Record<FiscalNature, string> = {
  MEI: 'MEI',
  SIMPLES: 'Simples Nacional',
  LUCRO_PRESUMIDO: 'Lucro Presumido',
  PJ: 'PJ (outro)',
  AUTONOMO: 'PF / Autônomo (RPA)',
};

/** Ordem canônica de exibição das formas de recebimento. */
export const FISCAL_NATURE_ORDER: FiscalNature[] = ['MEI', 'SIMPLES', 'LUCRO_PRESUMIDO', 'PJ', 'AUTONOMO'];

/** True se a forma de recebimento é via pessoa jurídica (deduções ISS/PIS/COFINS). */
export function isPJNature(n: FiscalNature): boolean {
  return n !== 'AUTONOMO';
}

export interface Shift {
  id: string;
  user_id: string;
  workplace_id: string;
  template_id?: string;
  title: string;
  date: string; // "2026-05-13"
  start_datetime: string; // ISO
  end_datetime: string;   // ISO
  duration_hours: number;
  expected_value: number;
  received_value?: number;
  status: ShiftStatus;
  payment_due_date?: string;
  payment_received_date?: string;
  recurrence_id?: string;
  notes?: string;
  // --- Campos fiscais (opcionais) — alimentam o relatório por regime (Max) ---
  fiscal_nature?: FiscalNature;   // sobrepõe a natureza derivada do local
  nf_number?: string;             // número da nota fiscal (PJ)
  iss_retido?: number;            // PJ
  pis?: number;                   // PJ
  cofins?: number;                // PJ
  inss_retido?: number;           // Autônomo (RPA)
  irrf_retido?: number;           // Autônomo (RPA)
  descontos?: number;             // (legado — não utilizado)
  created_at: string;
  updated_at: string;
}

export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom' | '12x36' | '24x72' | '48h' | '72h';

export interface RecurrenceRule {
  id: string;
  user_id: string;
  workplace_id: string;
  template_id?: string;
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays?: number[]; // 0=Dom, 1=Seg...
  start_date: string;
  end_date?: string;
  occurrences?: number;
  pattern_label: string;
  active: boolean;
  created_at: string;
}

export interface PaymentBatch {
  id: string;
  user_id: string;
  workplace_id: string;
  reference_month: string; // "2026-05"
  expected_total: number;
  received_total: number;
  difference: number;
  status: 'conferido' | 'pendente' | 'divergente';
  notes?: string;
  created_at: string;
}

export type ReportType = 'mensal' | 'anual' | 'por_hospital' | 'contador' | 'atrasados';

export interface Report {
  id: string;
  user_id: string;
  type: ReportType;
  period_start: string;
  period_end: string;
  generated_at: string;
  data: Record<string, unknown>;
}

// ============================================================
// TIPOS DE APOIO
// ============================================================

export interface MonthlyStats {
  expected: number;
  received: number;
  pending: number;
  overdue: number;
  totalShifts: number;
  totalHours: number;
  avgPerShift: number;
  avgPerHour: number;
}

export interface WorkplaceStats {
  workplace: Workplace;
  totalShifts: number;
  totalExpected: number;
  totalReceived: number;
  pendingAmount: number;
  overdueAmount: number;
  shiftsThisMonth: number;
  expectedThisMonth: number;
}

export const STATUS_LABELS: Record<ShiftStatus, string> = {
  previsto: 'Agendado',
  realizado: 'Realizado',
  recebido: 'Recebido',
  atrasado: 'Atrasado',
  cancelado: 'Cancelado',
};

export const WORKPLACE_TYPE_LABELS: Record<WorkplaceType, string> = {
  hospital: 'Hospital',
  clinica: 'Clínica',
  upa: 'UPA',
  pronto_socorro: 'Pronto-Socorro',
  maternidade: 'Maternidade',
  home_care: 'Home Care',
  outro: 'Outro',
};

export const PROFILE_TYPE_LABELS: Record<ProfileType, string> = {
  residente: 'Residente',
  plantonista: 'Plantonista',
  especialista: 'Especialista',
  anestesista: 'Anestesista',
  cirurgiao: 'Cirurgião',
  intensivista: 'Intensivista',
  urgencista: 'Urgencista',
  outro: 'Outro',
};

export const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  dia: 'Dia',
  noite: 'Noite',
  '24h': '24 horas',
  sobreaviso: 'Sobreaviso',
  sala_vermelha: 'Sala Vermelha',
  UTI: 'UTI',
  anestesia: 'Anestesia',
  cirurgia: 'Cirurgia',
  ambulatorio: 'Ambulatório',
  outro: 'Outro',
};

export const WORKPLACE_COLORS = [
  '#03bb85', '#22c55e', '#8b5cf6', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];
