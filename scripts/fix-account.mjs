// Confirma o e-mail e eleva uma conta a um plano. Uso:
//   ACCOUNT_EMAIL="x@y.com" ACCOUNT_PLAN="max" PGHOST=... PGUSER=... PGPASSWORD=... node scripts/fix-account.mjs
import pg from 'pg';

const email = process.env.ACCOUNT_EMAIL;
const plan = process.env.ACCOUNT_PLAN || 'max';
if (!email) { console.error('❌ ACCOUNT_EMAIL ausente'); process.exit(1); }

const client = new pg.Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'postgres',
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  // 1) Confirma o e-mail (permite login mesmo com "Confirm email" ligado)
  await client.query(
    "update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where email = $1",
    [email],
  );
  // 2) Plano no cache do profile (fonte que o app lê)
  await client.query("update public.profiles set subscription_plan = $2 where email = $1", [email, plan]);
  // 3) Plano na assinatura (consistência)
  await client.query(
    "update public.user_subscriptions set plan_id = $2, status = 'active' where user_id = (select id from auth.users where email = $1)",
    [email, plan],
  );
  const { rows } = await client.query(
    "select p.email, p.subscription_plan, (u.email_confirmed_at is not null) as confirmed from public.profiles p join auth.users u on u.id = p.id where p.email = $1",
    [email],
  );
  console.log('✅ Conta atualizada:', rows);
} catch (e) {
  console.error('❌ Erro:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
