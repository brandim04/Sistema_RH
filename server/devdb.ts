// Sobe um PostgreSQL local, sem Docker, para desenvolvimento: npm run db:local
// Os dados ficam na pasta .pgdata (ignorada pelo Git).
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const dir = path.resolve(process.env.PGDATA_DIR ?? '.pgdata');
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port: 5433, persistent: true, createPostgresUser: process.platform !== 'win32' && process.getuid?.() === 0 } as any);
  if (!fs.existsSync(path.join(dir, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  try { await pg.createDatabase('ciclovida'); } catch { /* já existe */ }
  console.log('PostgreSQL local em postgres://postgres:postgres@localhost:5433/ciclovida (Ctrl+C para parar)');
  const parar = async () => { await pg.stop(); process.exit(0); };
  process.on('SIGINT', parar);
  process.on('SIGTERM', parar);
}
main().catch((e) => { console.error(e); process.exit(1); });
