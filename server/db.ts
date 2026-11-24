import { Pool, PoolClient, QueryResultRow, types } from 'pg';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';
import { seed } from './seed';

// DATE (oid 1082) é devolvido como string 'YYYY-MM-DD' para evitar problemas de fuso horário.
types.setTypeParser(1082, (v) => v);
// NUMERIC (oid 1700) é convertido para number (valores monetários com 2 casas).
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// BIGINT (oid 20) usado em COUNT(*)
types.setTypeParser(20, (v) => Number(v));

export type Db = Pick<PoolClient, 'query'>;

declare global {
  // eslint-disable-next-line no-var
  var __cvPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __cvReady: Promise<void> | undefined;
}

export function getPool(): Pool {
  if (!global.__cvPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL não configurada');
    const local = /localhost|127\.0\.0\.1/.test(url);
    global.__cvPool = new Pool({
      connectionString: url,
      // Em produção (Neon/Vercel Postgres) a conexão exige TLS (RNF02 - criptografia em trânsito).
      ssl: local ? undefined : { rejectUnauthorized: false },
      max: Number(process.env.DB_POOL_MAX ?? 5),
    });
  }
  return global.__cvPool;
}

export async function query<T extends QueryResultRow = any>(sql: string, params: unknown[] = [], db?: Db) {
  const r = await (db ?? getPool()).query<T>(sql, params);
  return r.rows;
}

export async function one<T extends QueryResultRow = any>(sql: string, params: unknown[] = [], db?: Db) {
  const rows = await query<T>(sql, params, db);
  return rows[0] as T | undefined;
}

/** Executa a função dentro de uma transação (BEGIN/COMMIT/ROLLBACK). */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Garante que o esquema exista e que os dados iniciais (modelos extraídos das
 * planilhas, parâmetros e usuário administrador) estejam carregados.
 * Executado uma vez por instância (cold start); idempotente.
 */
export function ensureReady(): Promise<void> {
  if (!global.__cvReady) {
    global.__cvReady = (async () => {
      const pool = getPool();
      const exists = await pool.query(`SELECT to_regclass('public.schema_meta') AS t`);
      if (exists.rows[0].t) {
        const v = await pool.query('SELECT max(versao) AS v FROM schema_meta');
        if (v.rows[0].v >= SCHEMA_VERSION) return;
      }
      await tx(async (c) => {
        await c.query('SELECT pg_advisory_xact_lock(424242)');
        const again = await c.query(`SELECT to_regclass('public.schema_meta') AS t`);
        if (again.rows[0].t) {
          const v = await c.query('SELECT max(versao) AS v FROM schema_meta');
          if (v.rows[0].v >= SCHEMA_VERSION) return;
        }
        await c.query(SCHEMA_SQL);
        await seed(c);
        await c.query('INSERT INTO schema_meta (versao) VALUES ($1)', [SCHEMA_VERSION]);
      });
    })().catch((e) => {
      global.__cvReady = undefined;
      throw e;
    });
  }
  return global.__cvReady;
}

export async function closePool() {
  if (global.__cvPool) {
    await global.__cvPool.end();
    global.__cvPool = undefined;
    global.__cvReady = undefined;
  }
}
