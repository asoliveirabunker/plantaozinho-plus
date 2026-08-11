/**
 * Tipos do banco — espelham as migrations SQL em supabase/migrations/.
 *
 * Você pode regenerar automaticamente via:
 *   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
 *
 * Por enquanto, mantemos manualmente.
 */

export type ProfileType = 'residente' | 'plantonista' | 'especialista' | 'anestesista' | 'cirurgiao' | 'intensivista' | 'urgencista' | 'outro';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled' | 'expired';
export type WorkplaceType = 'hospital' | 'clinica' | 'upa' | 'pronto_socorro' | 'maternidade' | 'home_care' | 'outro';
export type PaymentMethod = 'PJ' | 'PF' | 'RPA' | 'cooperativa' | 'outro';
export type ShiftType = 'dia' | 'noite' | '24h' | 'sobreaviso' | 'sala_vermelha' | 'UTI' | 'anestesia' | 'cirurgia' | 'ambulatorio' | 'outro';
export type ShiftStatus = 'previsto' | 'realizado' | 'recebido' | 'atrasado' | 'cancelado';
export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom' | '12x36' | '24x72' | '48h' | '72h';
export type BatchStatus = 'conferido' | 'pendente' | 'divergente';
export type TaxRegime = 'MEI' | 'Simples Nacional' | 'Lucro Presumido' | 'PF';
export type PreferredLanguage = 'pt-BR' | 'es-LATAM';
export type PreferredTheme = 'light' | 'dark';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          email: string;
          specialty: string | null;
          profile_type: ProfileType;
          subscription_plan: string;
          subscription_status: SubscriptionStatus;
          whatsapp: string | null;
          preferred_language: PreferredLanguage;
          preferred_theme: PreferredTheme;
          goals: string[];
          onboarding_completed: boolean;
          tax_regime: TaxRegime | null;
          tax_rate: number | null;
          company_name: string | null;
          cnpj: string | null;
          crm: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & {
          id: string;
          name: string;
          email: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
        Relationships: [];
      };

      workplaces: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: WorkplaceType;
          color: string;
          default_shift_value: number;
          default_hourly_value: number | null;
          default_duration_hours: number;
          payment_day: number;
          payment_method: PaymentMethod;
          contact_name: string | null;
          contact_phone: string | null;
          cnpj: string | null;
          address: string | null;
          notes: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['workplaces']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['workplaces']['Row']>;
        Relationships: [];
      };

      shift_templates: {
        Row: {
          id: string;
          user_id: string;
          workplace_id: string;
          name: string;
          start_time: string;
          end_time: string;
          duration_hours: number;
          default_value: number;
          shift_type: ShiftType;
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['shift_templates']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['shift_templates']['Row']>;
        Relationships: [];
      };

      shifts: {
        Row: {
          id: string;
          user_id: string;
          workplace_id: string;
          template_id: string | null;
          recurrence_id: string | null;
          title: string;
          date: string;
          start_datetime: string;
          end_datetime: string;
          duration_hours: number;
          expected_value: number;
          received_value: number | null;
          status: ShiftStatus;
          payment_due_date: string | null;
          payment_received_date: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['shifts']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['shifts']['Row']>;
        Relationships: [];
      };

      recurrence_rules: {
        Row: {
          id: string;
          user_id: string;
          workplace_id: string;
          template_id: string | null;
          frequency: RecurrenceFrequency;
          interval: number;
          weekdays: number[] | null;
          start_date: string;
          end_date: string | null;
          occurrences: number | null;
          pattern_label: string;
          active: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['recurrence_rules']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['recurrence_rules']['Row']>;
        Relationships: [];
      };

      payment_batches: {
        Row: {
          id: string;
          user_id: string;
          workplace_id: string;
          reference_month: string;
          expected_total: number;
          received_total: number;
          difference: number;
          status: BatchStatus;
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['payment_batches']['Row'], 'id' | 'difference' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['payment_batches']['Row']>;
        Relationships: [];
      };

      subscription_plans: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          price_monthly_brl: number | null;
          price_yearly_brl: number | null;
          price_monthly_usd: number | null;
          price_yearly_usd: number | null;
          max_workplaces: number | null;
          max_shifts_per_month: number | null;
          max_templates: number | null;
          features: Record<string, unknown>;
          can_export_pdf: boolean;
          can_export_csv: boolean;
          has_priority_support: boolean;
          has_team_access: boolean;
          trial_days: number;
          stripe_price_id_monthly: string | null;
          stripe_price_id_yearly: string | null;
          mercadopago_plan_id: string | null;
          is_active: boolean;
          display_order: number;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['subscription_plans']['Row']> & {
          id: string;
          name: string;
        };
        Update: Partial<Database['public']['Tables']['subscription_plans']['Row']>;
        Relationships: [];
      };

      user_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan_id: string;
          status: SubscriptionStatus;
          trial_ends_at: string | null;
          current_period_start: string;
          current_period_end: string | null;
          canceled_at: string | null;
          cancel_at_period_end: boolean;
          payment_provider: 'stripe' | 'mercadopago' | 'manual' | null;
          payment_customer_id: string | null;
          payment_subscription_id: string | null;
          billing_cycle: 'monthly' | 'yearly' | null;
          last_payment_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_subscriptions']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['user_subscriptions']['Row']>;
        Relationships: [];
      };

      subscription_history: {
        Row: {
          id: string;
          user_id: string;
          from_plan_id: string | null;
          to_plan_id: string;
          event: 'signup' | 'upgrade' | 'downgrade' | 'trial_started' | 'trial_converted' | 'renewed' | 'canceled' | 'expired' | 'reactivated';
          amount_charged: number | null;
          currency: 'BRL' | 'USD' | null;
          payment_provider: string | null;
          payment_reference: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['subscription_history']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['subscription_history']['Row']>;
        Relationships: [];
      };

      audit_log: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          changes: Record<string, unknown> | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['audit_log']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: never;
        Relationships: [];
      };
    };

    Views: Record<string, never>;

    Functions: {
      get_monthly_stats: {
        Args: { p_user_id: string; p_year: number; p_month: number };
        Returns: {
          expected: number;
          received: number;
          pending: number;
          overdue: number;
          total_shifts: number;
          total_hours: number;
          avg_per_shift: number;
          avg_per_hour: number;
        }[];
      };
      auto_mark_overdue_shifts: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
  };
}
