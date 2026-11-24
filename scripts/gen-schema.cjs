// Regera server/schema.ts a partir de server/schema.sql
const fs = require('fs');
const path = require('path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'server', 'schema.sql'), 'utf8');
const ver = (fs.readFileSync(path.join(__dirname, '..', 'server', 'schema.ts'), 'utf8').match(/SCHEMA_VERSION = (\d+)/) || [, '1'])[1];
fs.writeFileSync(path.join(__dirname, '..', 'server', 'schema.ts'),
  '// Gerado a partir de schema.sql (mantido como string para empacotamento na Vercel).\n' +
  '// Para alterar o esquema, edite schema.sql e rode: npm run db:schema\n' +
  `export const SCHEMA_VERSION = ${ver};\nexport const SCHEMA_SQL = \`\n${sql}\`;\n`);
console.log('server/schema.ts atualizado');
