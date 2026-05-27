// ============================================================
// TIPOS PRINCIPAIS DO SISTEMA PLANTÃO PRO
// ============================================================

export type ProfileType = 'residente' | 'plantonista' | 'especialista' | 'anestesista' | 'cirurgiao' | 'intensivista' | 'urgencista' | 'outro';
export type SubscriptionPlan = 'free' | 'pro' | 'premium';

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
  '#1877F2', '#22c55e', '#8b5cf6', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];
