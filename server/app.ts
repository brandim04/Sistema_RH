import cookieParser from 'cookie-parser';
import express from 'express';
import { ensureReady } from './db';
import { autenticar, errorHandler } from './infra';
import { auth, r as admin } from './routes/admin';
import { r as colaboradores } from './routes/colaboradores';
import { r as ferias } from './routes/ferias';
import { r as processos } from './routes/processos';

/**
 * Aplicação HTTP (camada de API da arquitetura - DRS 4.1).
 * Em produção roda como função serverless da Vercel (api/index.ts);
 * em desenvolvimento, via server/dev.ts.
 */
export function criarApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  // Limite acomoda anexos de até 2 MB em base64 (RF18)
  app.use(express.json({ limit: '3mb' }));
  app.use(cookieParser());

  // Cabeçalhos de segurança básicos (RNF01)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/saude', (_req, res) => res.json({ ok: true }));

  // Inicializa o banco (esquema + dados das planilhas) no primeiro acesso
  app.use('/api', async (_req, _res, next) => {
    try { await ensureReady(); next(); } catch (e) { next(e); }
  });

  app.use('/api/auth', auth);
  app.use('/api', autenticar);
  app.use('/api/colaboradores', colaboradores);
  app.use('/api/ferias', ferias);
  app.use('/api', processos);
  app.use('/api', admin);
  app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
  app.use(errorHandler);
  return app;
}

const app = criarApp();
export default app;
