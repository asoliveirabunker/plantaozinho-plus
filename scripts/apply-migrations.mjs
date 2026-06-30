// Aplica supabase/_apply_all.sql no banco apontado por DATABASE_URL.
// Uso: DATABASE_URL="postgresql://..." node scripts/apply-migrations.mjs
// O segredo vem por variável de ambiente — nunca é gravado em disco.
import pg from 'pg';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/_apply_all.sql', import.meta.url), 'utf8');

// Aceita DATABASE_URL OU campos PG* separados (evita ter que URL-encodar senha
// com caracteres especiais como @ e #).
const hasParts = process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD;
if (!process.env.DATABASE_URL && !hasParts) {
  console.error('❌ Forneça DATABASE_URL ou PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE.');
  process.exit(1);
}

const client = process.env.DATABASE_URL
  ? new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : new pg.Client({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || 'postgres',
      ssl: { rejectUnauthorized: false },
    });

try {
  await client.connect();
  console.log('✅ Conectado ao banco. Aplicando _apply_all.sql ...');
  await client.query(sql);
  console.log('✅ Migrations aplicadas sem erros.');
  const { rows } = await client.query(
    "select table_name from information_schema.tables where table_schema='public' order by table_name"
  );
  console.log(`📋 Tabelas em public (${rows.length}):`, rows.map(r => r.table_name).join(', '));
} catch (e) {
  console.error('❌ Erro ao aplicar:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
