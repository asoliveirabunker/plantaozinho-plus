-- ============================================================================
-- Plantão Pro — Realtime (sincronização multi-dispositivo)
-- ============================================================================
-- Publica as tabelas de dados no canal de realtime e habilita REPLICA IDENTITY
-- FULL para que eventos DELETE tragam a linha antiga inteira (incl. user_id),
-- permitindo filtrar por usuário e aplicar RLS também em exclusões.
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workplaces;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_templates;

ALTER TABLE public.shifts          REPLICA IDENTITY FULL;
ALTER TABLE public.workplaces      REPLICA IDENTITY FULL;
ALTER TABLE public.shift_templates REPLICA IDENTITY FULL;
