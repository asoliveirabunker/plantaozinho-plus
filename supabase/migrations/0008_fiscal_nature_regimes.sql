-- ============================================================================
-- Plantão Pro — Formas de recebimento congruentes com os regimes contábeis
-- ============================================================================
-- Expande fiscal_nature para incluir os regimes de PJ das Configurações
-- Contábeis (MEI, Simples Nacional, Lucro Presumido), mantendo 'PJ' (genérico/
-- legado) e 'AUTONOMO' (PF / RPA). Valores existentes permanecem válidos.
-- ============================================================================

ALTER TABLE public.workplaces
  DROP CONSTRAINT IF EXISTS workplaces_fiscal_nature_check;
ALTER TABLE public.workplaces
  ADD CONSTRAINT workplaces_fiscal_nature_check
  CHECK (fiscal_nature IS NULL OR fiscal_nature IN ('MEI','SIMPLES','LUCRO_PRESUMIDO','PJ','AUTONOMO'));

ALTER TABLE public.shifts
  DROP CONSTRAINT IF EXISTS shifts_fiscal_nature_check;
ALTER TABLE public.shifts
  ADD CONSTRAINT shifts_fiscal_nature_check
  CHECK (fiscal_nature IS NULL OR fiscal_nature IN ('MEI','SIMPLES','LUCRO_PRESUMIDO','PJ','AUTONOMO'));

COMMENT ON COLUMN public.shifts.fiscal_nature IS 'MEI | SIMPLES | LUCRO_PRESUMIDO | PJ | AUTONOMO — forma de recebimento; sobrepõe a derivada do local';
