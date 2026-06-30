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
