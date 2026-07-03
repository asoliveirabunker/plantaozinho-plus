-- ============================================================================
-- Plantão Pro — Semeia os planos Pro e Max (e alinha o Free ao app)
-- ============================================================================
-- A migration 0002 só inseria o plano 'free'. Sem 'pro'/'max' na tabela, a FK
-- de user_subscriptions.plan_id impede registrar upgrades. Os limites aqui são
-- a referência do servidor; o gating do cliente vive em src/lib/plans.ts.
-- ============================================================================

INSERT INTO public.subscription_plans
  (id,   name,   description,                                   price_monthly_brl, max_workplaces, max_shifts_per_month, can_export_pdf, can_export_csv, has_priority_support, display_order)
VALUES
  ('free', 'Free', 'Gratuito — recursos essenciais para começar',            NULL,              1,             10,               false,          true,           false,                0),
  ('pro',  'Pro',  'Para o plantonista no controle total',                  14.90,           NULL,           NULL,               true,           true,           false,                1),
  ('max',  'Max',  'Gestão completa para alta performance',                 29.90,           NULL,           NULL,               true,           true,           true,                 2)
ON CONFLICT (id) DO UPDATE SET
  name                 = EXCLUDED.name,
  description          = EXCLUDED.description,
  price_monthly_brl    = EXCLUDED.price_monthly_brl,
  max_workplaces       = EXCLUDED.max_workplaces,
  max_shifts_per_month = EXCLUDED.max_shifts_per_month,
  can_export_pdf       = EXCLUDED.can_export_pdf,
  can_export_csv       = EXCLUDED.can_export_csv,
  has_priority_support = EXCLUDED.has_priority_support,
  display_order        = EXCLUDED.display_order,
  is_active            = true;
