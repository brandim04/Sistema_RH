import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

/**
 * Ambiente de teste de integração: PostgreSQL real (embutido) + aplicação Express.
 * A data "de hoje" é fixada em 16/06/2025 (segunda-feira) para que os resultados sejam reprodutíveis.
 */
export const HOJE = '2025-06-16';

export async function subirAmbiente() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-pg-'));
  const port = 15432 + Math.floor(Math.random() * 1000);
  const pg = new EmbeddedPostgres({
    databaseDir: dir, user: 'postgres', password: 'postgres', port, persistent: false,
    createPostgresUser: process.platform !== 'win32' && process.getuid?.() === 0, onLog: () => undefined, onError: () => undefined,
  } as any);
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('teste');
  process.env.DATABASE_URL = `postgres://postgres:postgres@localhost:${port}/teste`;
  process.env.HOJE = HOJE;
  process.env.ADMIN_EMAIL = 'admin@empresa.com';
  process.env.ADMIN_PASSWORD = 'Admin@123';
  const { default: app } = await import('../../server/app');
  const db = await import('../../server/db');
  return {
    app,
    async login(email = 'admin@empresa.com', senha = 'Admin@123') {
      const agent = request.agent(app);
      const r = await agent.post('/api/auth/login').send({ email, senha });
      if (r.status !== 200) throw new Error(`login falhou: ${r.status} ${JSON.stringify(r.body)}`);
      return agent;
    },
    async derrubar() {
      await db.closePool();
      await pg.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** CPFs válidos para os testes. */
export const CPFS = ['529.982.247-25', '111.444.777-35', '390.533.447-05', '714.602.380-01', '048.307.520-50', '963.578.300-03', '275.484.389-23', '160.756.110-70'];
