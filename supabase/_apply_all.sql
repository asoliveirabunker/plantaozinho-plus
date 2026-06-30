-- ============================================================================
-- Plantão Pro — TODAS as migrations (0001 → 0005) em ordem.
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique RUN uma vez.
-- Gerado a partir de supabase/migrations/*.sql
-- ============================================================================


-- ============================================================================
-- >>> 0001_initial_schema.sql
-- ============================================================================
-- ============================================================================
-- Plantão Pro — Schema inicial
-- ============================================================================
-- Banco de dados PostgreSQL hospedado no Supabase.
-- Convenções:
--   • Todas as chaves primárias são UUID (gen_random_uuid()).
--   • Timestamps em timestamptz (UTC) com default now().
--   • Soft-references usam ON DELETE SET NULL; cascatas só em hierarquias claras.
--   • Colunas monetárias em numeric(10,2) para precisão financeira.
--   • CHECK constraints alinhados aos enums TypeScript em src/types/index.ts.
-- ============================================================================

-- Habilita extensão de UUID (geralmente já ativa no Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. PROFILES — perfil estendido vinculado ao auth.users do Supabase Auth
-- ============================================================================
CREATE TABLE public.profiles (
    id                      uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    name                    text NOT NULL,
    email                   text NOT NULL UNIQUE,
    specialty               text,
    profile_type            text NOT NULL DEFAULT 'plantonista'
                            CHECK (profile_type IN ('residente','plantonista','especialista','anestesista','cirurgiao','intensivista','urgencista','outro')),

    -- Assinatura (preenchida via tabela user_subscriptions; aqui mantém-se o plano corrente para queries rápidas)
    subscription_plan       text NOT NULL DEFAULT 'free',
    subscription_status     text NOT NULL DEFAULT 'active'
                            CHECK (subscription_status IN ('trial','active','past_due','canceled','expired')),

    -- Contato
    whatsapp                text,

    -- Preferências de UX
    preferred_language      text NOT NULL DEFAULT 'pt-BR'
                            CHECK (preferred_language IN ('pt-BR','es-LATAM')),
    preferred_theme         text NOT NULL DEFAULT 'light'
                            CHECK (preferred_theme IN ('light','dark')),

    -- Objetivos selecionados no onboarding (multi-select)
    goals                   text[] NOT NULL DEFAULT '{}',
    onboarding_completed    boolean NOT NULL DEFAULT false,

    -- Dados fiscais/profissionais
    tax_regime              text CHECK (tax_regime IN ('MEI','Simples Nacional','Lucro Presumido','PF')),
    tax_rate                numeric(5,2),
    company_name            text,
    cnpj                    text,
    crm                     text,

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'Perfil estendido do médico — 1:1 com auth.users';
COMMENT ON COLUMN public.profiles.subscription_plan IS 'Cache do plano atual; fonte de verdade é user_subscriptions';
COMMENT ON COLUMN public.profiles.cnpj IS 'Aceita CNPJ ou CPF dependendo do tax_regime (PF usa CPF)';

-- ============================================================================
-- 2. WORKPLACES — hospitais, UPAs, clínicas onde o médico trabalha
-- ============================================================================
CREATE TABLE public.workplaces (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name                    text NOT NULL,
    type                    text NOT NULL
                            CHECK (type IN ('hospital','clinica','upa','pronto_socorro','maternidade','home_care','outro')),
    color                   text NOT NULL DEFAULT '#1877F2',  -- HEX para identificação visual

    -- Defaults para plantões
    default_shift_value     numeric(10,2) NOT NULL DEFAULT 0 CHECK (default_shift_value >= 0),
    default_hourly_value    numeric(10,2),
    default_duration_hours  numeric(5,2) NOT NULL DEFAULT 12 CHECK (default_duration_hours > 0),

    -- Pagamento
    payment_day             int NOT NULL DEFAULT 10 CHECK (payment_day BETWEEN 1 AND 31),
    payment_method          text NOT NULL DEFAULT 'PJ'
                            CHECK (payment_method IN ('PJ','PF','RPA','cooperativa','outro')),

    -- Identificação/contato
    contact_name            text,
    contact_phone           text,
    cnpj                    text,
    address                 text,
    notes                   text,

    active                  boolean NOT NULL DEFAULT true,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workplaces_user_active ON public.workplaces(user_id, active);

-- ============================================================================
-- 3. SHIFT_TEMPLATES — modelos pré-cadastrados para criação rápida
-- ============================================================================
CREATE TABLE public.shift_templates (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    workplace_id            uuid NOT NULL REFERENCES public.workplaces(id) ON DELETE CASCADE,
    name                    text NOT NULL,
    start_time              text NOT NULL,  -- "07:00" formato HH:MM (24h)
    end_time                text NOT NULL,  -- "19:00"
    duration_hours          numeric(5,2) NOT NULL CHECK (duration_hours > 0),
    default_value           numeric(10,2) NOT NULL CHECK (default_value >= 0),
    shift_type              text NOT NULL
                            CHECK (shift_type IN ('dia','noite','24h','sobreaviso','sala_vermelha','UTI','anestesia','cirurgia','ambulatorio','outro')),
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_templates_workplace ON public.shift_templates(workplace_id);
CREATE INDEX idx_templates_user ON public.shift_templates(user_id);

-- ============================================================================
-- 4. RECURRENCE_RULES — regras de recorrência (12x36, 24x72, semanal, etc.)
-- ============================================================================
CREATE TABLE public.recurrence_rules (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    workplace_id            uuid NOT NULL REFERENCES public.workplaces(id) ON DELETE CASCADE,
    template_id             uuid REFERENCES public.shift_templates(id) ON DELETE SET NULL,
    frequency               text NOT NULL
                            CHECK (frequency IN ('daily','weekly','biweekly','monthly','custom','12x36','24x72','48h','72h')),
    interval                int NOT NULL DEFAULT 1 CHECK (interval > 0),
    weekdays                int[],                          -- array de 0..6 (Dom..Sáb)
    start_date              date NOT NULL,
    end_date                date,
    occurrences             int CHECK (occurrences IS NULL OR occurrences > 0),
    pattern_label           text NOT NULL,                  -- ex: "12x36 - Segunda a Quinta"
    active                  boolean NOT NULL DEFAULT true,
    created_at              timestamptz NOT NULL DEFAULT now(),
    CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX idx_recurrence_user_active ON public.recurrence_rules(user_id, active);

-- ============================================================================
-- 5. SHIFTS — tabela principal: cada plantão registrado
-- ============================================================================
CREATE TABLE public.shifts (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    workplace_id            uuid NOT NULL REFERENCES public.workplaces(id) ON DELETE CASCADE,
    template_id             uuid REFERENCES public.shift_templates(id) ON DELETE SET NULL,
    recurrence_id           uuid REFERENCES public.recurrence_rules(id) ON DELETE SET NULL,

    title                   text NOT NULL,
    date                    date NOT NULL,                   -- data canônica do plantão
    start_datetime          timestamptz NOT NULL,
    end_datetime            timestamptz NOT NULL,
    duration_hours          numeric(5,2) NOT NULL CHECK (duration_hours > 0),

    -- Financeiro
    expected_value          numeric(10,2) NOT NULL CHECK (expected_value >= 0),
    received_value          numeric(10,2) CHECK (received_value IS NULL OR received_value >= 0),

    -- Status do ciclo: agendado → realizado → recebido
    status                  text NOT NULL DEFAULT 'previsto'
                            CHECK (status IN ('previsto','realizado','recebido','atrasado','cancelado')),

    -- Datas de pagamento
    payment_due_date        date,
    payment_received_date   timestamptz,

    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    -- Validação de coerência temporal
    CHECK (end_datetime > start_datetime)
);

-- Índices para queries comuns
CREATE INDEX idx_shifts_user_date           ON public.shifts(user_id, date DESC);
CREATE INDEX idx_shifts_user_status         ON public.shifts(user_id, status);
CREATE INDEX idx_shifts_workplace_date      ON public.shifts(workplace_id, date DESC);
CREATE INDEX idx_shifts_payment_due         ON public.shifts(user_id, payment_due_date) WHERE payment_due_date IS NOT NULL;
CREATE INDEX idx_shifts_recurrence          ON public.shifts(recurrence_id) WHERE recurrence_id IS NOT NULL;

-- ============================================================================
-- 6. PAYMENT_BATCHES — fechamentos mensais por local (conferência contábil)
-- ============================================================================
CREATE TABLE public.payment_batches (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    workplace_id            uuid NOT NULL REFERENCES public.workplaces(id) ON DELETE CASCADE,
    reference_month         text NOT NULL,                   -- "2026-05" (ISO YYYY-MM)
    expected_total          numeric(12,2) NOT NULL DEFAULT 0,
    received_total          numeric(12,2) NOT NULL DEFAULT 0,
    difference              numeric(12,2) GENERATED ALWAYS AS (received_total - expected_total) STORED,
    status                  text NOT NULL DEFAULT 'pendente'
                            CHECK (status IN ('conferido','pendente','divergente')),
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, workplace_id, reference_month)
);

CREATE INDEX idx_batches_user_month ON public.payment_batches(user_id, reference_month DESC);

-- ============================================================================
-- 7. AUDIT_LOG — trilha de auditoria (LGPD compliance, debugging)
-- ============================================================================
CREATE TABLE public.audit_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    action          text NOT NULL,                     -- 'created' | 'updated' | 'deleted' | 'login' | 'logout'
    entity_type     text NOT NULL,                     -- 'shift' | 'workplace' | 'template' | 'profile'
    entity_id       uuid,
    changes         jsonb,                             -- diff entre antes/depois
    ip_address      inet,
    user_agent      text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_user_created ON public.audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON public.audit_log(entity_type, entity_id);


-- ============================================================================
-- >>> 0002_subscriptions.sql
-- ============================================================================
-- ============================================================================
-- Plantão Pro — Sistema de assinaturas
-- ============================================================================
-- Pronto para integração com gateways de pagamento (Stripe / Mercado Pago).
-- A coluna `profiles.subscription_plan` é um cache; a fonte de verdade é
-- `user_subscriptions`. Triggers mantêm os dois sincronizados.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- subscription_plans — catálogo de planos disponíveis
-- ----------------------------------------------------------------------------
CREATE TABLE public.subscription_plans (
    id                          text PRIMARY KEY,                       -- 'free' | 'pro' | 'premium' | 'enterprise'
    name                        text NOT NULL,
    description                 text,

    -- Preços (NULL = grátis)
    price_monthly_brl           numeric(10,2),
    price_yearly_brl            numeric(10,2),
    price_monthly_usd           numeric(10,2),
    price_yearly_usd            numeric(10,2),

    -- Limites (NULL = ilimitado)
    max_workplaces              int,
    max_shifts_per_month        int,
    max_templates               int,

    -- Features (jsonb para flexibilidade futura)
    features                    jsonb NOT NULL DEFAULT '{}'::jsonb,
    can_export_pdf              boolean NOT NULL DEFAULT true,
    can_export_csv              boolean NOT NULL DEFAULT true,
    has_priority_support        boolean NOT NULL DEFAULT false,
    has_team_access             boolean NOT NULL DEFAULT false,         -- multi-usuário (escritório)

    -- Período de trial (em dias)
    trial_days                  int NOT NULL DEFAULT 0 CHECK (trial_days >= 0),

    -- Identificadores do gateway (preenchidos quando integrar Stripe/MP)
    stripe_price_id_monthly     text,
    stripe_price_id_yearly      text,
    mercadopago_plan_id         text,

    is_active                   boolean NOT NULL DEFAULT true,
    display_order               int NOT NULL DEFAULT 0,
    created_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subscription_plans IS 'Catálogo de planos. Editar os preços/features aqui propaga para todos os usuários.';

-- ----------------------------------------------------------------------------
-- user_subscriptions — assinatura ativa de cada usuário
-- ----------------------------------------------------------------------------
CREATE TABLE public.user_subscriptions (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan_id                     text NOT NULL REFERENCES public.subscription_plans(id),
    status                      text NOT NULL DEFAULT 'active'
                                CHECK (status IN ('trial','active','past_due','canceled','expired')),

    -- Períodos
    trial_ends_at               timestamptz,
    current_period_start        timestamptz NOT NULL DEFAULT now(),
    current_period_end          timestamptz,
    canceled_at                 timestamptz,
    cancel_at_period_end        boolean NOT NULL DEFAULT false,

    -- Pagamento (preenchido quando houver gateway)
    payment_provider            text CHECK (payment_provider IN ('stripe','mercadopago','manual')),
    payment_customer_id         text,            -- ex: cus_XXX (Stripe), customer_id (MP)
    payment_subscription_id     text,            -- ex: sub_XXX (Stripe), preapproval_id (MP)
    billing_cycle               text CHECK (billing_cycle IN ('monthly','yearly')),
    last_payment_at             timestamptz,

    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_subs_user        ON public.user_subscriptions(user_id);
CREATE INDEX idx_user_subs_status      ON public.user_subscriptions(status) WHERE status IN ('active','trial');
CREATE INDEX idx_user_subs_renewal     ON public.user_subscriptions(current_period_end) WHERE status = 'active';

-- ----------------------------------------------------------------------------
-- subscription_history — histórico imutável de mudanças (auditoria fiscal/cobrança)
-- ----------------------------------------------------------------------------
CREATE TABLE public.subscription_history (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    from_plan_id                text REFERENCES public.subscription_plans(id),
    to_plan_id                  text NOT NULL REFERENCES public.subscription_plans(id),
    event                       text NOT NULL
                                CHECK (event IN ('signup','upgrade','downgrade','trial_started','trial_converted','renewed','canceled','expired','reactivated')),
    amount_charged              numeric(10,2),
    currency                    text CHECK (currency IN ('BRL','USD')),
    payment_provider            text,
    payment_reference           text,
    notes                       text,
    created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sub_history_user ON public.subscription_history(user_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- Seed inicial: plano FREE (sempre presente)
-- ----------------------------------------------------------------------------
INSERT INTO public.subscription_plans (id, name, description, max_workplaces, max_shifts_per_month, can_export_pdf, can_export_csv, display_order)
VALUES
    ('free', 'Free', 'Gratuito — recursos essenciais para começar', 3, 30, false, true, 0)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Trigger: sincroniza profiles.subscription_plan com user_subscriptions
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_subscription_plan_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.profiles
    SET subscription_plan = NEW.plan_id,
        subscription_status = NEW.status,
        updated_at = now()
    WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_sub_to_profile
AFTER INSERT OR UPDATE OF plan_id, status ON public.user_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.sync_subscription_plan_to_profile();


-- ============================================================================
-- >>> 0003_triggers_and_functions.sql
-- ============================================================================
-- ============================================================================
-- Plantão Pro — Triggers e funções auxiliares
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. set_updated_at — atualiza coluna updated_at em qualquer UPDATE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Aplicar em todas as tabelas com updated_at
CREATE TRIGGER trg_profiles_updated_at         BEFORE UPDATE ON public.profiles         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_workplaces_updated_at       BEFORE UPDATE ON public.workplaces       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_shifts_updated_at           BEFORE UPDATE ON public.shifts           FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_user_subs_updated_at        BEFORE UPDATE ON public.user_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. handle_new_user — cria profile + assinatura free quando usuário se cadastra
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_name              text;
    v_specialty         text;
    v_profile_type      text;
    v_whatsapp          text;
    v_goals             text[];
    v_onboarding_done   boolean;
BEGIN
    -- Lê metadados enviados no signUp (raw_user_meta_data)
    v_name              := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
    v_specialty         := COALESCE(NEW.raw_user_meta_data->>'specialty', NULL);
    v_profile_type      := COALESCE(NEW.raw_user_meta_data->>'profile_type', 'plantonista');
    v_whatsapp          := COALESCE(NEW.raw_user_meta_data->>'whatsapp', NULL);
    v_goals             := COALESCE(
                            (SELECT array_agg(value::text) FROM jsonb_array_elements_text(COALESCE(NEW.raw_user_meta_data->'goals', '[]'::jsonb))),
                            '{}'::text[]
                          );
    v_onboarding_done   := COALESCE((NEW.raw_user_meta_data->>'onboarding_completed')::boolean, false);

    -- Cria profile vinculado
    INSERT INTO public.profiles (id, name, email, specialty, profile_type, whatsapp, goals, onboarding_completed)
    VALUES (NEW.id, v_name, NEW.email, v_specialty, v_profile_type, v_whatsapp, v_goals, v_onboarding_done);

    -- Atribui plano Free por padrão
    INSERT INTO public.user_subscriptions (user_id, plan_id, status, payment_provider)
    VALUES (NEW.id, 'free', 'active', 'manual');

    -- Registra no histórico
    INSERT INTO public.subscription_history (user_id, to_plan_id, event, notes)
    VALUES (NEW.id, 'free', 'signup', 'Cadastro inicial');

    RETURN NEW;
END;
$$;

-- Trigger no auth.users (Supabase Auth) → cria o profile automaticamente
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 3. audit_changes — registra mudanças em audit_log
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_changes jsonb;
    v_action  text;
    v_user_id uuid;
    v_eid     uuid;
BEGIN
    v_action := lower(TG_OP);  -- 'insert' | 'update' | 'delete'

    IF TG_OP = 'DELETE' THEN
        v_user_id := OLD.user_id;
        v_eid     := OLD.id;
        v_changes := to_jsonb(OLD);
    ELSE
        v_user_id := NEW.user_id;
        v_eid     := NEW.id;
        v_changes := CASE
                        WHEN TG_OP = 'UPDATE'
                        THEN jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW))
                        ELSE to_jsonb(NEW)
                     END;
    END IF;

    INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, changes)
    VALUES (v_user_id, v_action, TG_TABLE_NAME, v_eid, v_changes);

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_shifts        AFTER INSERT OR UPDATE OR DELETE ON public.shifts        FOR EACH ROW EXECUTE FUNCTION public.audit_changes();
CREATE TRIGGER trg_audit_workplaces    AFTER INSERT OR UPDATE OR DELETE ON public.workplaces    FOR EACH ROW EXECUTE FUNCTION public.audit_changes();

-- ----------------------------------------------------------------------------
-- 4. auto_mark_overdue — marca plantões com payment_due_date vencido como 'atrasado'
--    (a aplicação chama via cron diário ou edge function)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_mark_overdue_shifts()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated int;
BEGIN
    UPDATE public.shifts
    SET    status = 'atrasado',
           updated_at = now()
    WHERE  status = 'realizado'
      AND  payment_due_date IS NOT NULL
      AND  payment_due_date < CURRENT_DATE;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.auto_mark_overdue_shifts() IS
'Marca como "atrasado" plantões realizados cujo payment_due_date já passou. Idempotente. Execute via cron ou Supabase Edge Function diariamente.';

-- ----------------------------------------------------------------------------
-- 5. get_monthly_stats — função SQL otimizada para o card de estatísticas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_monthly_stats(p_user_id uuid, p_year int, p_month int)
RETURNS TABLE (
    expected         numeric,
    received         numeric,
    pending          numeric,
    overdue          numeric,
    total_shifts     int,
    total_hours      numeric,
    avg_per_shift    numeric,
    avg_per_hour     numeric
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_month_prefix text := p_year || '-' || lpad(p_month::text, 2, '0');
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(s.expected_value) FILTER (WHERE s.status <> 'cancelado'), 0)::numeric                                    AS expected,
        COALESCE(SUM(COALESCE(s.received_value, s.expected_value)) FILTER (WHERE s.status = 'recebido'), 0)::numeric         AS received,
        COALESCE(SUM(s.expected_value) FILTER (WHERE s.status IN ('previsto','realizado')), 0)::numeric                       AS pending,
        COALESCE(SUM(s.expected_value) FILTER (WHERE s.status = 'atrasado'), 0)::numeric                                      AS overdue,
        COUNT(*) FILTER (WHERE s.status <> 'cancelado')::int                                                                  AS total_shifts,
        COALESCE(SUM(s.duration_hours) FILTER (WHERE s.status <> 'cancelado'), 0)::numeric                                    AS total_hours,
        CASE WHEN COUNT(*) FILTER (WHERE s.status <> 'cancelado') > 0
             THEN COALESCE(SUM(s.expected_value) FILTER (WHERE s.status <> 'cancelado'), 0) / COUNT(*) FILTER (WHERE s.status <> 'cancelado')
             ELSE 0 END::numeric                                                                                              AS avg_per_shift,
        CASE WHEN COALESCE(SUM(s.duration_hours) FILTER (WHERE s.status <> 'cancelado'), 0) > 0
             THEN COALESCE(SUM(s.expected_value) FILTER (WHERE s.status <> 'cancelado'), 0)
                  / SUM(s.duration_hours) FILTER (WHERE s.status <> 'cancelado')
             ELSE 0 END::numeric                                                                                              AS avg_per_hour
    FROM public.shifts s
    WHERE s.user_id = p_user_id
      AND to_char(s.date, 'YYYY-MM') = v_month_prefix;
END;
$$;


-- ============================================================================
-- >>> 0004_row_level_security.sql
-- ============================================================================
-- ============================================================================
-- Plantão Pro — Row Level Security (RLS)
-- ============================================================================
-- Crítico para multi-tenancy: cada usuário só enxerga/edita seus próprios
-- dados. Sem RLS, qualquer cliente autenticado poderia ler/escrever em
-- qualquer linha. O Supabase usa a função auth.uid() para identificar
-- o usuário autenticado via JWT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Habilita RLS em todas as tabelas
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workplaces              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurrence_rules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_batches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_history    ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- PROFILES — usuário só vê/edita o próprio profile
-- ----------------------------------------------------------------------------
CREATE POLICY "profiles_select_own"  ON public.profiles
    FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"  ON public.profiles
    FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- INSERT é feito pelo trigger handle_new_user (com SECURITY DEFINER), não por clientes.
-- DELETE bloqueado: usuário usa "delete account" que cascateia via auth.users.

-- ----------------------------------------------------------------------------
-- WORKPLACES
-- ----------------------------------------------------------------------------
CREATE POLICY "workplaces_select_own" ON public.workplaces
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "workplaces_insert_own" ON public.workplaces
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "workplaces_update_own" ON public.workplaces
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "workplaces_delete_own" ON public.workplaces
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- SHIFT_TEMPLATES
-- ----------------------------------------------------------------------------
CREATE POLICY "templates_select_own"  ON public.shift_templates
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "templates_insert_own"  ON public.shift_templates
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "templates_update_own"  ON public.shift_templates
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "templates_delete_own"  ON public.shift_templates
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- SHIFTS
-- ----------------------------------------------------------------------------
CREATE POLICY "shifts_select_own"     ON public.shifts
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "shifts_insert_own"     ON public.shifts
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "shifts_update_own"     ON public.shifts
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "shifts_delete_own"     ON public.shifts
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- RECURRENCE_RULES
-- ----------------------------------------------------------------------------
CREATE POLICY "recurrence_select_own" ON public.recurrence_rules
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "recurrence_insert_own" ON public.recurrence_rules
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "recurrence_update_own" ON public.recurrence_rules
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "recurrence_delete_own" ON public.recurrence_rules
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- PAYMENT_BATCHES
-- ----------------------------------------------------------------------------
CREATE POLICY "batches_select_own"    ON public.payment_batches
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "batches_insert_own"    ON public.payment_batches
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "batches_update_own"    ON public.payment_batches
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "batches_delete_own"    ON public.payment_batches
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- AUDIT_LOG — usuário só lê o próprio log; INSERT é feito por trigger SECURITY DEFINER
-- ----------------------------------------------------------------------------
CREATE POLICY "audit_select_own"      ON public.audit_log
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- SUBSCRIPTION_PLANS — catálogo é público (todos podem ler)
-- ----------------------------------------------------------------------------
CREATE POLICY "plans_select_all"      ON public.subscription_plans
    FOR SELECT TO authenticated, anon USING (is_active = true);

-- ----------------------------------------------------------------------------
-- USER_SUBSCRIPTIONS — usuário lê própria; UPDATE/INSERT só via backend (gateway webhook)
-- ----------------------------------------------------------------------------
CREATE POLICY "user_subs_select_own"  ON public.user_subscriptions
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- INSERT/UPDATE de assinaturas é feito por:
--   1) Trigger handle_new_user (SECURITY DEFINER) → bypass RLS
--   2) Edge Functions com service_role key (webhooks de gateway)

-- ----------------------------------------------------------------------------
-- SUBSCRIPTION_HISTORY — read-only para o usuário
-- ----------------------------------------------------------------------------
CREATE POLICY "sub_history_select_own" ON public.subscription_history
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- Storage — bucket "avatars" (preparado para uploads de foto de perfil)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Policy: usuário só faz upload em uma pasta com o próprio UUID
CREATE POLICY "avatars_own_upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_own_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_own_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_public_read" ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'avatars');


-- ============================================================================
-- >>> 0005_fiscal_fields.sql
-- ============================================================================
-- ============================================================================
-- Plantão Pro — Campos fiscais para o Relatório por Regime (Plano Max)
-- ============================================================================
-- Aditivo e não-destrutivo: todas as colunas são NULL-able, então não quebra
-- dados existentes. A natureza fiscal de um plantão, quando não definida
-- explicitamente, é derivada do payment_method do local (ver resolveFiscalNature
-- no frontend / pode-se replicar como função SQL futuramente).
-- ============================================================================

-- Forma de recebimento padrão por local (opcional)
ALTER TABLE public.workplaces
  ADD COLUMN IF NOT EXISTS fiscal_nature text
  CHECK (fiscal_nature IS NULL OR fiscal_nature IN ('PJ','AUTONOMO'));

-- Campos fiscais por plantão
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS fiscal_nature text
    CHECK (fiscal_nature IS NULL OR fiscal_nature IN ('PJ','AUTONOMO')),
  ADD COLUMN IF NOT EXISTS nf_number   text,
  ADD COLUMN IF NOT EXISTS iss_retido  numeric(10,2) CHECK (iss_retido  IS NULL OR iss_retido  >= 0),
  ADD COLUMN IF NOT EXISTS pis         numeric(10,2) CHECK (pis         IS NULL OR pis         >= 0),
  ADD COLUMN IF NOT EXISTS cofins      numeric(10,2) CHECK (cofins      IS NULL OR cofins      >= 0),
  ADD COLUMN IF NOT EXISTS inss_retido numeric(10,2) CHECK (inss_retido IS NULL OR inss_retido >= 0),
  ADD COLUMN IF NOT EXISTS irrf_retido numeric(10,2) CHECK (irrf_retido IS NULL OR irrf_retido >= 0),
  ADD COLUMN IF NOT EXISTS descontos   numeric(10,2) CHECK (descontos   IS NULL OR descontos   >= 0);

COMMENT ON COLUMN public.shifts.fiscal_nature IS 'PJ | AUTONOMO — forma de recebimento; sobrepõe a derivada do local';

-- Índice para acelerar a agregação do relatório por (usuário, mês, natureza)
CREATE INDEX IF NOT EXISTS idx_shifts_user_nature ON public.shifts(user_id, fiscal_nature);

