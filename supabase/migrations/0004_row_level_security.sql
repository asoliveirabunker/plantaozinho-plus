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
