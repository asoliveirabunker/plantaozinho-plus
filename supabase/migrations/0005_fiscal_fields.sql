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
