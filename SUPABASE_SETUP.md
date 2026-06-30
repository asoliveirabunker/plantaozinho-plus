# Setup do Supabase — Plantão Pro

Guia passo a passo para colocar o banco de dados em produção.

## 1. Criar o projeto Supabase

1. Acesse https://supabase.com → **New project**
2. Escolha um nome (`plantao-pro`), senha do banco (guarde!) e região (`São Paulo` ou `US East`)
3. Aguarde ~2 minutos a provisão concluir

## 2. Rodar as migrations

### Opção A — via Dashboard (mais simples)

1. No painel do projeto, vá em **SQL Editor** → **New query**
2. Cole o conteúdo de cada arquivo na ordem:
   - `supabase/migrations/0001_initial_schema.sql`
   - `supabase/migrations/0002_subscriptions.sql`
   - `supabase/migrations/0003_triggers_and_functions.sql`
   - `supabase/migrations/0004_row_level_security.sql`
3. Clique **RUN** após cada um
4. Verifique no **Table Editor** que as tabelas aparecem

### Opção B — via Supabase CLI (recomendado para times)

```bash
# Instalar CLI (uma vez)
npm install -g supabase

# Login
supabase login

# Linkar ao projeto remoto (pegue o project-ref no Dashboard → Settings → General)
cd "PLANTÃOZINHO PLUS"
supabase link --project-ref YOUR_PROJECT_REF

# Aplicar migrations
supabase db push
```

## 3. Configurar variáveis de ambiente

1. No Dashboard: **Settings → API**, copie:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`
2. Na raiz do projeto, copie `.env.example` para `.env`:
   ```bash
   cp .env.example .env
   ```
3. Preencha os valores no `.env`

## 4. Configurar Auth

No Dashboard, vá em **Authentication → Providers**:

- **Email**: já ativado por padrão. Para evitar e-mails de confirmação no desenvolvimento, em **Authentication → URL Configuration** habilite `Auto Confirm` (depois desabilite em produção)
- **Site URL**: `http://localhost:5173` (dev) ou seu domínio (produção)
- **Redirect URLs**: adicione `http://localhost:5173/**` e seu domínio
- **Templates de e-mail** (Authentication → Email Templates): personalize para português brasileiro

## 5. Testar conexão

```bash
npm run dev
```

Abra o console do navegador. Se não aparecer o warning `[Supabase] Variáveis VITE_SUPABASE_URL...`, está OK.

Teste cadastro/login: as funções estão em `src/lib/supabaseAuth.ts`.

## 6. Migração do localStorage

A aplicação atual usa `src/lib/db.ts` com localStorage. O arquivo `src/lib/supabaseDb.ts` espelha as mesmas funções, agora assíncronas. Migre por tela:

```diff
- import { getShifts } from '../lib/db';
+ import { getShifts } from '../lib/supabaseDb';

- const shifts = getShifts(user.id);
+ const shifts = await getShifts();   // ← agora é Promise
```

Como as funções viraram async, transforme as chamadas em `useEffect` + `useState` ou em queries com TanStack Query.

## 7. Cron diário (opcional — para marcar plantões atrasados automaticamente)

Crie uma **Edge Function** no Supabase ou use o `pg_cron` extension:

```sql
-- Habilita pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Agenda: todo dia às 03h UTC marca plantões vencidos
SELECT cron.schedule(
  'mark-overdue-shifts',
  '0 3 * * *',
  $$SELECT public.auto_mark_overdue_shifts();$$
);
```

## 8. Backup automático

O Supabase faz **Point-in-Time Recovery (PITR)** automaticamente em planos pagos (Pro+). No plano Free, são feitos backups diários. Para configurar export manual de CSV/SQL: **Database → Backups**.

## Estrutura do banco

```
auth.users (Supabase Auth)
   └── profiles (1:1)
         ├── workplaces (1:N)
         │     ├── shift_templates (1:N)
         │     └── shifts (1:N) ← entidade principal
         ├── recurrence_rules (1:N) → gera shifts
         ├── payment_batches (1:N) ← fechamentos mensais
         ├── user_subscriptions (1:1 ativo) → subscription_plans
         ├── subscription_history (1:N) ← imutável
         └── audit_log (1:N) ← trilha de auditoria
```

## Comandos úteis

```bash
# Resetar banco local (Supabase CLI)
supabase db reset

# Ver SQL diff entre local e remote
supabase db diff

# Gerar tipos TypeScript a partir do banco real
npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts

# Aplicar migration nova
supabase migration new nome_da_migration
# edite o arquivo gerado em supabase/migrations/
supabase db push
```

## Segurança

- ✅ **RLS habilitado** em todas as tabelas — usuários só veem dados próprios
- ✅ **anon key** segura no frontend (impedida pelas policies)
- ✅ **service_role key** NUNCA exposta no cliente (use só em Edge Functions)
- ✅ **Auth** com JWT auto-renovado
- ✅ **Audit log** registra mudanças sensíveis
- ⚠️ Em produção: ativar **e-mail confirmation** e **MFA opcional**

## Custos estimados

- **Free tier Supabase**: até 500MB de banco, 1GB de Storage, 50k usuários ativos/mês, 2GB de bandwidth — suficiente para começar
- **Pro ($25/mês)**: 8GB de banco, 100GB Storage, PITR de 7 dias, sem pausa por inatividade
- O custo escala linearmente conforme o uso
