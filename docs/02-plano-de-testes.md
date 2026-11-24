# Plano, Especificação e Relatório de Testes

**Sistema de Ciclo de Vida do Colaborador — Grupo 2**
Estrutura baseada na **ISO/IEC/IEEE 29119-3:2021** (documentação de teste, sucessora da IEEE 829) e na área *Software Testing* (cap. 5) e *Software Quality* (cap. 12) do **SWEBOK v4**.

---

## 1. Plano de teste

### 1.1 Objetivo
Verificar que o sistema atende aos requisitos do DRS (RF, RNF, RN) e validar, com o usuário de RH, que os fluxos substituem as planilhas originais.

### 1.2 Itens de teste
| Item | Local |
|---|---|
| Regras de domínio (datas, prazos, checklist, férias, CPF, perfis) | `server/domain/*`, `server/infra.ts` |
| API REST + banco de dados | `server/routes/*`, `server/servicos.ts`, `server/schema.sql` |
| Interface web | `src/` |

### 1.3 Níveis e técnicas (SWEBOK cap. 5)

| Nível | Objetivo | Técnica | Ferramenta | Automação |
|---|---|---|---|---|
| Unidade | Regras de negócio isoladas | Partição de equivalência, análise de valor-limite, tabela de decisão | Vitest | Automático (`npm run test:unit`) |
| Integração | API + PostgreSQL real, incluindo restrições do banco | Teste baseado em requisitos e em cenários (fluxo completo) | Vitest + Supertest + PostgreSQL embutido | Automático (`npm run test:integration`) |
| Sistema / aceitação | Fluxos ponta a ponta pela interface | Casos de uso do DRS 3.1/3.2 e critérios de aceitação | Navegador | Manual (roteiro da seção 3) |
| Não funcional | Desempenho, segurança, responsividade | Medição de tempo, testes negativos de acesso, inspeção | Vitest / navegador | Misto |

### 1.4 Ambiente
- Testes automatizados: Node.js 20+, PostgreSQL embutido (`embedded-postgres`) criado e destruído a cada execução; **data de hoje fixada em 16/06/2025** (variável `HOJE`) para resultados reprodutíveis.
- Testes manuais: ambiente publicado na Vercel com dados de demonstração (`npm run demo -- <url>`).

### 1.5 Critérios
- **Entrada:** código compila sem erros (`npm run typecheck`).
- **Saída / aprovação:** 100 % dos testes automatizados aprovados; todos os casos de aceitação (CA) aprovados ou com desvio registrado e aceito pelo grupo; cobertura de linhas do domínio ≥ 90 %.
- **Suspensão:** falha no ambiente de banco ou na implantação.

### 1.6 Riscos de teste
| Risco | Mitigação |
|---|---|
| Resultados dependentes da data atual | Data fixada em teste (`HOJE`) |
| Diferenças de fuso horário (Vercel em UTC) | Datas tratadas como `AAAA-MM-DD` em UTC e "hoje" calculado em America/Sao_Paulo |
| Regras legais mudarem | Regras parametrizadas (RNF06) e cobertas por teste de configuração (CT-I36) |

### 1.7 Responsabilidades
| Papel | Responsável |
|---|---|
| Planejamento e revisão dos casos | *(preencher)* |
| Automação (unidade/integração) | *(preencher)* |
| Execução da aceitação com o roteiro | *(preencher)* |
| Registro de defeitos (Issues do GitHub) | *(preencher)* |

---

## 2. Especificação dos casos de teste automatizados

### 2.1 Unidade — `tests/unit/dominio.test.ts`

| ID | Requisito | Caso | Técnica | Resultado esperado |
|---|---|---|---|---|
| CT-U01 | RF32 | `addMonths` reproduz o `EDATE` (31/01 + 1 mês; 29/02 bissexto) | Valor-limite | 28/02; 28/02 |
| CT-U02 | RF27 | Data → dia da semana | Partição | 17/01/2022 = Segunda-feira |
| CT-U03 | RNF11 | Datas inválidas (29/02/2025, formato BR) | Valor-limite | Rejeitadas |
| CT-U04 | RF22, RN19 | Data limite = referência + dias (valores da planilha) | Oráculo: planilha | −35 → 13/12/2021 |
| CT-U05 | RF22 | Antecipação de fim de semana parametrizada | Tabela de decisão | Sábado/domingo → sexta |
| CT-U06 | RF26, RN20 | Situação: atrasada, concluída, vence em breve, no prazo | Partição | 4 situações corretas |
| CT-U07 | RF21 | Percentual conta "Não se aplica" como resolvido | Partição | 50 % |
| CT-U08 | RN37 | Pendências ignoram itens opcionais | Partição | Só itens obrigatórios |
| CT-U09 | RN09, RN10 | "Não se aplica" em item não condicional | Teste negativo | Erro RN10 |
| CT-U10 | DRS 2.5 | Vigência do PIS/PASEP (até 29/02/2024) | Valor-limite | 29/02 vigente; 01/03 não |
| CT-U11 | RF32, RN22 | Geração de períodos aquisitivos | Oráculo | 3 períodos corretos |
| CT-U12 | RF33 | Data limite = `EDATE + 335` (exemplo da planilha) | Oráculo: planilha | 01/12/2024 |
| CT-U13 | RN27 | Dias de direito × faltas (CLT art. 130) | Valor-limite (5/6, 14/15, 23/24, 32/33) | 30/24/18/12/0 |
| CT-U14 | RF33 | Situações: em aquisição, disponível, programada, em gozo, gozada, parcial, vencida | Partição | Todas corretas |
| CT-U15 | RF34 | 30 dias válidos | Caso válido | Sem erros |
| CT-U16 | RN25 | Início após o término | Negativo | Erro RN25 |
| CT-U17 | RN26, RF35 | Conflito de períodos; alteração não conflita consigo mesma | Negativo / regressão | Erro RN26 / sem erro |
| CT-U18 | RN24 | Período aquisitivo em curso | Negativo | Erro RN24 |
| CT-U19 | RN27 | < 5 dias; > direito; > 3 frações; sem fração de 14 | Valor-limite | Erros específicos |
| CT-U20 | RN27 | Início na sexta (art. 134 §3º), parâmetro ligado/desligado | Tabela de decisão | Erro / sem erro |
| CT-U21 | RN29 | Pessoa inativa | Negativo | Erro RN29 |
| CT-U22 | RF33 | Início após a data limite | Caso de aviso | Aviso "em dobro" |
| CT-U23 | RF37 | Distribuição de dias por mês no mapa | Oráculo | 11 + 19 = 30 |
| CT-U24 | RNF11 | CPF: dígitos, repetidos, formatação, máscara | Partição | Correto |
| CT-U25 | RNF04 | Matriz de permissões por perfil | Tabela de decisão | Conforme SDD 4.6 |

### 2.2 Integração — `tests/integration/api.test.ts`

| ID | Requisito(s) | Cenário | Resultado esperado |
|---|---|---|---|
| CT-I01 | RF52, RNF03 | Acesso sem login | 401 |
| CT-I02 | RF52 | Senha errada / correta | 401 / sessão válida |
| CT-I03 | RF53, RNF04, RNF01 | Gestor lista pessoas, tenta cadastrar, acessa usuários | CPF mascarado, salário oculto, 403 nas escritas |
| CT-I04 | RF01–RF05, RN05 | Cadastro completo com reservista vazio | 201, matrícula gerada, demissão vazia |
| CT-I05 | RN01, RN02 | CPF duplicado | 409 com "RN02" |
| CT-I06 | RNF11, RN04, RN06 | CPF inválido, nível e estado civil fora do padrão | 400 |
| CT-I07 | RF07, RF08 | Busca por nome; consulta rápida | 1 resultado; dados completos |
| CT-I08 | RNF01, RNF02 | CPF no banco | Cifrado + hash de 64 caracteres |
| CT-I09 | RF10 | Quadro por nível e faixa salarial | Agregações presentes |
| CT-I10 | RNF13 | Importação de 2 linhas da planilha (1 válida, 1 com CPF fictício) | 1 importada; erro na linha 7 |
| CT-I11 | RF30 | Inativar e reativar | Situação atualizada |
| CT-I12 | RN08 | Admissão sem pessoa cadastrada | 422 "RN08" |
| CT-I13 | RF11, RF12, RF22, RF23, RF27, RN17, RN20, DRS 2.5 | Admissão gera 4 grupos, ≥ 39 itens, PIS como N/A, eSocial D−1, etapas com dia da semana e atrasos | Valores conferidos |
| CT-I14 | RF13, RN10 | "Não se aplica" em CPF (não condicional) e em CNH | 422 / 200 |
| CT-I15 | RN21 | Alteração da data de referência | Prazos de itens e etapas recalculados |
| CT-I16 | RF25, RF26 | Lista de tarefas de vários processos filtrada por "atrasada" | Só atrasadas |
| CT-I17 | RF19, RF20 | Equipamento sem termo assinado | Pendência RF20 |
| CT-I18 | RF21, RNF12 | Concluir com pendências; resolver; concluir | 422 → 100 % → 200; pessoa ATIVA; processo bloqueado para edição |
| CT-I19 | RF17 | Termo LGPD | Nome e CPF preenchidos |
| CT-I20 | RNF09 | Tempo de carga do checklist (~40 itens) | < 2 s |
| CT-I21 | RF28 | Duplicar modelo de prazos | Mesma quantidade de etapas |
| CT-I22 | RF32, RF33 | Períodos aquisitivos e situação de pessoa admitida em 02/01/2023 | Vencida / disponível / em aquisição |
| CT-I23 | RF34, RF37, RN28 | Registrar 20 dias e consultar o mapa | 20 dias em julho |
| CT-I24 | RF35, RN26, RN27 | Conflito e excesso de dias | 422 com regras |
| CT-I25 | RN24 | Férias de período em aquisição | 422 "RN24" |
| CT-I26 | RF34, RF39 | Cancelar férias | Histórico mantido; saldo volta a 30 |
| CT-I27 | RF36, RF38 | Filtros por área e situação | Resultados filtrados |
| CT-I28 | RF40, RF41, RN39 | Abrir desligamento com equipamento entregue | Pendências RN31, RN32, RN39 |
| CT-I29 | RF42, RN31, RN32, RN33 | Modalidade sem justa causa → acordo | Itens 40 % trocados por 20 %; motivo reconfirmado; exame em D+10 |
| CT-I30 | RNF12, RN37 | Concluir com pendências | 422 "RN37" |
| CT-I31 | RF44, RN39 | Devolver equipamento | Pendência RN39 some |
| CT-I32 | RF43 | Valor de verba | Total conferido = 4.800,50 |
| CT-I33 | RF46, RF47, RN38, RN29 | Concluir desligamento e tentar férias depois | DESLIGADO + data de demissão; férias recusadas |
| CT-I34 | RF29, RF48 | Painel | Contadores e alertas de férias |
| CT-I35 | RF49, RF50, RNF05 | Auditoria | Ação CONCLUIR com usuário e data/hora |
| CT-I36 | RNF06, RF16 | Alterar parâmetro (válido/inválido) e item de modelo | 200 / 400; item criado e removido |
| CT-I37 | RNF17 | Backup | Sem senhas nem conteúdo de anexos |
| CT-I38 | RF18, RI08 | Anexar PDF, baixar, enviar tipo proibido | 201, `application/pdf`, 400 |

---

## 3. Roteiro de teste de aceitação (manual)

Executar no ambiente da Vercel após `npm run demo`. Registrar o resultado (Aprovado / Reprovado + observação) e a data.

| ID | Caso de uso / requisito | Passos | Critério de aceitação | Resultado |
|---|---|---|---|---|
| CA-01 | Login (RF52) | Entrar com usuário válido; sair; tentar abrir `/colaboradores` | Sem sessão, volta ao login | |
| CA-02 | Cadastro (RF01–RF08) | Cadastrar pessoa; buscar pelo nome; abrir consulta rápida | Dados pessoais e profissionais na mesma tela, somente leitura | |
| CA-03 | Importação (RNF13) | Importar `Cadastro de pessoas colaboradoras.xlsx` desmarcando a validação de dígitos | 4 pessoas importadas com área, nível e salário | |
| CA-04 | Admissão (RF11–RF21) | Iniciar admissão; marcar itens; anexar PDF; registrar equipamento e termo | Percentual e pendências atualizam a cada clique | |
| CA-05 | LGPD (RF17) | Botão "Termo LGPD" → imprimir/salvar PDF | Documento com nome, CPF e data | |
| CA-06 | Prazos (RF22–RF29) | Alterar o 1º dia da admissão | Todas as datas e dias da semana recalculados; atrasos no painel | |
| CA-07 | Férias (RF32–RF39) | Programar 30 dias iniciando numa sexta; depois numa segunda; cancelar | Sexta bloqueada; segunda aceita; mapa atualizado; cancelada permanece no histórico | |
| CA-08 | Desligamento (RF40–RF47) | Escolher modalidade, confirmar motivo, devolver bens, resolver itens, concluir | Botão só habilita sem pendências; pessoa vira "Desligado" | |
| CA-09 | Perfis (RNF04) | Entrar como `gestor@empresa.com` | CPF mascarado, sem botões de edição, acesso ao mapa de férias | |
| CA-10 | Responsividade (RNF08) | Abrir no celular | Menu recolhível, tabelas com rolagem horizontal | |
| CA-11 | Configuração (RNF06) | Incluir item no modelo de admissão; criar nova admissão | Novo item aparece só na nova admissão | |
| CA-12 | Exportação (RF51) | Exportar colaboradores, checklist e mapa para Excel; imprimir checklist em PDF | Arquivos abrem no Excel; PDF sem menu lateral | |

---

## 4. Relatório de execução (automatizado)

| Data | Ambiente | Unidade | Integração | Total | Situação |
|---|---|---|---|---|---|
| 23/11/2026 | Node 22, PostgreSQL 18 (embutido) | 26/26 | 38/38 | **64/64** | Aprovado |

Cobertura (`npm run test:coverage`):

| Camada | Linhas |
|---|---|
| `server/domain` (regras de negócio) | **97 %** |
| `server/servicos.ts` | 88 % |
| `server/routes` | 70 % |
| Total do servidor | 78 % |

O critério de saída (≥ 90 % no domínio) foi atendido. As linhas não cobertas nas rotas correspondem principalmente a caminhos de erro "não encontrado" e às telas de configuração de modalidades/etapas, cobertas pelo roteiro manual (CA-11).

### 4.1 Defeitos encontrados durante o desenvolvimento (exemplos para a apresentação)
| ID | Descrição | Detectado por | Correção |
|---|---|---|---|
| DEF-01 | Controle de férias exibia período vazio para pessoa com admissão futura | Teste exploratório na interface | Situação "Férias não disponíveis" com "Inicia em …" |
| DEF-02 | Dados de demonstração mostravam todas as pessoas com férias vencidas (sem histórico) | Revisão do painel | Script de demonstração registra férias gozadas dos períodos antigos |
| DEF-03 | Rotas com expressão regular não suportadas pelo Express 5 | Compilação/execução | Rotas separadas para admissão e desligamento |

---

## 5. Como executar
```bash
npm install
npm run typecheck          # verificação estática (entrada do teste)
npm test                   # unidade + integração (sobe um PostgreSQL temporário)
npm run test:coverage      # relatório de cobertura em coverage/index.html
```
