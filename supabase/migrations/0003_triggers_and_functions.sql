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
