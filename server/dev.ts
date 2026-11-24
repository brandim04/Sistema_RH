// Servidor local de desenvolvimento (a Vercel não usa este arquivo).
import fs from 'node:fs';

if (fs.existsSync('.env')) process.loadEnvFile('.env');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const app = require('./app').default;

const porta = Number(process.env.PORT ?? 3001);
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5433/ciclovida';
  console.log('DATABASE_URL não definida; usando o banco local do "npm run db:local".');
}
app.listen(porta, () => console.log(`API em http://localhost:${porta}/api`));
