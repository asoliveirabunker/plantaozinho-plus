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
