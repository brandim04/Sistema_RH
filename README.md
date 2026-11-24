# Sistema de Ciclo de Vida do Colaborador — Grupo 2

Sistema web full-stack que transforma as planilhas de RH do Grupo 2 (Cadastro de Pessoas Colaboradoras, Controle de Férias, Checklist de Admissão e Desligamento e Gerenciamento de Prazos na Admissão) em uma aplicação única, com cadastro compartilhado entre os módulos.

| Camada | Tecnologia |
|---|---|
| Frontend | Vue 3 + TypeScript + Vite (SPA responsiva) |
| API | Node.js + Express 5 + TypeScript (função serverless na Vercel) |
| Banco | PostgreSQL (Neon, integrado à Vercel) |
| Testes | Vitest + Supertest + PostgreSQL embutido |

## Funcionalidades

- Cadastro: dados pessoais e profissionais, busca por nome, consulta rápida, quadro de pessoal (área, nível, cargo, faixa salarial), importação da planilha original (.xlsx) e exportação para Excel.
- Admissão: checklist gerado a partir do modelo da planilha (Documentação, Exames, Cadastros/acessos, Onboarding), com feito / não feito / não se aplica, observações, orientações, anexos, percentual de conclusão, termo LGPD imprimível, inventário de equipamentos e termo de entrega.
- Prazos: etapas calculadas a partir do 1º dia (mesmos offsets da planilha), dia da semana, responsável, situação (no prazo, vence em breve, atrasada), recálculo automático, modelos duplicáveis e alertas no painel.
- Férias: períodos aquisitivos, data limite (fórmula da planilha), situação, programação com validação da CLT (conflitos, fracionamento, faltas, início antes do DSR), cancelamento com histórico e mapa de férias filtrável.
- Desligamento: modalidade de rescisão com documentos específicos, confirmação do motivo, aviso prévio, conferência de verbas, devolução de bens com base no inventário da admissão, guia FGTS Digital, bloqueio de conclusão com pendências e atualização automática para "Desligado".
- Geral: login, 5 perfis de acesso (Administrador, RH, DP, Gestor, TI), auditoria de todas as alterações, configurações sem alterar código, CPF cifrado, exportação Excel/PDF e cópia de segurança.

## Documentação de engenharia (SWEBOK v4 / IEEE)

| Documento | Norma de referência | Área SWEBOK |
|---|---|---|
| DRS do grupo (PDF) | ISO/IEC/IEEE 29148 | Software Requirements |
| [`docs/01-SDD-arquitetura.md`](docs/01-SDD-arquitetura.md) | IEEE 1016, ISO/IEC/IEEE 42010, ISO/IEC 25010 | Architecture, Design, Security |
| [`docs/02-plano-de-testes.md`](docs/02-plano-de-testes.md) | ISO/IEC/IEEE 29119-3 | Software Testing, Software Quality |
| [`docs/03-matriz-rastreabilidade.md`](docs/03-matriz-rastreabilidade.md) | ISO/IEC/IEEE 29148 §5.2.8 | Software Requirements |
| [`docs/04-ajustes-no-DRS.md`](docs/04-ajustes-no-DRS.md) | IEEE 830 / 29148 | Software Requirements |
| `server/schema.sql` | — | Software Design (modelo de dados) |

## Rodando localmente

Pré-requisito: Node.js 20 ou superior.

```bash
npm install
npm run db:local        # terminal 1: sobe um PostgreSQL local (sem Docker) na porta 5433
npm run dev             # terminal 2: API em :3001 e interface em http://localhost:5173
npm run demo            # (opcional) terminal 3: popula dados de demonstração
```

Acesso inicial: admin@empresa.com / Admin@123. Após `npm run demo` também existem `rh@empresa.com`, `gestor@empresa.com` e `ti@empresa.com` (senha `Senha@123`).

Testes:
```bash
npm run typecheck
npm test                # 64 testes (unidade + integração com PostgreSQL real)
npm run test:coverage
```

## Publicando na Vercel (passo a passo)

1. Suba o código para o GitHub (repositório do grupo).
2. Em [vercel.com](https://vercel.com), clique em Add New → Project e importe o repositório. A Vercel detecta o `vercel.json` (framework Vite, saída `dist`, função `api/index.ts`). Ainda não clique em Deploy, ou aceite que o primeiro deploy falhe sem banco.
3. Crie o banco: no projeto, aba Storage → Create Database → Neon (Postgres) → conecte ao projeto. Isso cria a variável `DATABASE_URL` automaticamente.
4. Em Settings → Environment Variables, adicione:
   - `JWT_SECRET` — valor aleatório longo
   - `DATA_KEY` — outro valor aleatório longo (**não altere depois**: ele cifra os CPFs)
   - `ADMIN_EMAIL` e `ADMIN_PASSWORD` — usuário administrador inicial

   Para gerar valores: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
5. Deploy (ou Redeploy). No primeiro acesso a API cria as tabelas e carrega os modelos extraídos das planilhas.
6. (Opcional) Popule a demonstração apontando para a URL publicada:
   ```bash
   npx tsx scripts/demo.ts https://SEU-PROJETO.vercel.app admin@empresa.com SUA_SENHA
   ```
7. Troque a senha do administrador em Alterar senha.

Cada push na `main` gera um novo deploy; cada pull request gera uma URL de preview para revisão.

## Estrutura do projeto

```
api/index.ts              Função serverless da Vercel (entrada da API)
server/
  app.ts                  Montagem do Express (middlewares e rotas)
  db.ts                   Conexão, transações e inicialização do banco
  schema.sql / schema.ts  Esquema relacional (fonte: schema.sql → npm run db:schema)
  seed.ts                 Modelos extraídos das planilhas (checklists, modalidades, prazos)
  infra.ts                Erros, criptografia, autenticação, perfis, auditoria, parâmetros
  servicos.ts             Geração de checklists/tarefas, pendências, painel
  domain/                 Regras de negócio puras (datas, prazos, checklist, férias, CPF)
  routes/                 Rotas por módulo do DRS
src/
  views/                  Telas (uma por funcionalidade)
  components/             Checklist compartilhado, gráfico de barras
  servicos.ts             Cliente da API, sessão, formatação
  excel.ts                Importação/exportação .xlsx
tests/unit, tests/integration
docs/                     Documentação de engenharia
scripts/demo.ts           Dados de demonstração
```

## Limitações conhecidas
- Não há integração automática com eSocial e FGTS Digital (apenas orientações), conforme o escopo do DRS.
- Verbas rescisórias são conferidas (valores informados), não calculadas.
- Feriados não são considerados na regra de início de férias (apenas o repouso semanal).
- Anexos limitados a 2 MB por arquivo.
