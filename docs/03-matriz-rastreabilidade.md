# Matriz de Rastreabilidade

Requisito ↔ funcionalidade da planilha original ↔ componente do sistema ↔ teste.
Conforme ISO/IEC/IEEE 29148 (§5.2.8 rastreabilidade bidirecional) e SWEBOK v4 cap. 1 (Requirements Traceability).

Planilhas de origem:
- CAD: Cadastro de Pessoas Colaboradoras (abas 1-Dados pessoais, 2-Dados profissionais, 3-Consulta rápida, 4-Painel de controle)
- FER: Controle de Férias de Funcionários (abas 2-Controle de férias, 3-Mapa de férias)
- CHK: Checklist de Admissão e Desligamento (abas Checklist de admissão, Modelo para LGPD, Checklist de desligamento, Documentos da rescisão e dicas, Passo a passo FGTS Digital)
- PRZ: Gerenciamento de Prazos na Admissão (abas Calculadora, Calculadora Tech, Modelo - copiar esta aba, abas mensais)
- NOVO: requisito sem equivalente nas planilhas (levantado pelo grupo)

Componentes: API = `server/routes/…`; DOM = `server/domain/…`; BD = `server/schema.sql`; UI = `src/views/…`

## 1. Requisitos funcionais

| Req. | Planilha / funcionalidade original | Componente(s) | Teste |
|---|---|---|---|
| RF01 | CAD 1 — linha por pessoa | API colaboradores `POST /`; UI ColaboradorForm | CT-I04 |
| RF02 | CAD 1 — colunas Nome…Nº Reservista | BD `colaboradores`; UI ColaboradorForm (Dados pessoais) | CT-I04 |
| RF03 | CAD 1 — reservista em branco | BD coluna `reservista` anulável | CT-I04 |
| RF04 | CAD 2 — CTPS, PIS, Admissão, Demissão, Área, Cargo, Nível, Salário | BD `colaboradores`; UI ColaboradorForm (Dados profissionais) | CT-I04 |
| RF05 | CAD 2 — Demissão vazia | BD `ck_demissao_somente_desligado` | CT-I04, CT-I33 |
| RF06 | CAD 2 — lista Júnior/Pleno/Sênior | BD `CHECK nivel`; Zod `NIVEIS` | CT-I06 |
| RF07 | CAD 3 — filtro por nome | API `GET /colaboradores?busca=`; UI Colaboradores | CT-I07 |
| RF08 | CAD 3 — PROCV das duas abas | API `GET /colaboradores/:id`; UI ColaboradorDetalhe | CT-I07 |
| RF09 | CAD 3 — consulta só leitura | UI ColaboradorDetalhe (aba Consulta rápida) | CA-02 |
| RF10 | CAD 4 — gráficos | API `GET /colaboradores/quadro`; UI Quadro, GraficoBarras | CT-I09 |
| RF11 | CHK admissão — cabeçalho (nome, data, cargo, observações) | API `POST /admissoes`; UI Admissoes | CT-I12, CT-I13 |
| RF12 | CHK admissão — etapas Documentação/Exames/Cadastros/Onboarding | BD `modelo_checklist_itens`; `servicos.gerarItens`; seed `CHECKLIST_ADMISSAO` | CT-I13 |
| RF13 | CHK — "Feito/entregue (sim/não)" + N/A | API `PATCH /itens/:id`; UI Checklist | CT-I14 |
| RF14 | CHK — coluna Observações | `checklist_itens.observacao`; UI Checklist | CT-I14 |
| RF15 | CHK — orientações por item | `checklist_itens.orientacao`; UI Checklist | CT-I13 |
| RF16 | CHK — "planilha personalizável" | API `/config/modelo-itens`; UI Configuracoes; itens avulsos | CT-I36, CA-11 |
| RF17 | CHK — aba Modelo para LGPD | API `GET /admissoes/:id/lgpd`; UI TermoLgpd; parâmetro `termo_lgpd` | CT-I19, CA-05 |
| RF18 | NOVO | BD `documentos`; API `/documentos`; UI Checklist (Anexar) | CT-I38 |
| RF19 | CHK — "Enviar equipamentos" (checklist assinado) | BD `equipamentos`; API `/equipamentos`; UI aba Equipamentos | CT-I17 |
| RF20 | CHK — "peça para a pessoa assinar" | `admissoes.termo_equipamentos_assinado`; pendência em `servicos.pendenciasAdmissao` | CT-I17, CT-I18 |
| RF21 | NOVO (percentual) | DOM `checklist.progresso`; UI barra de progresso | CT-U07, CT-I18 |
| RF22 | PRZ — `=$D$17+C3` | DOM `prazos.calcularDataLimite`; `servicos.gerarTarefas` | CT-U04, CT-U05, CT-I13 |
| RF23 | PRZ — etapas ordenadas | BD `modelo_prazo_etapas.ordem`, `tarefas.ordem` | CT-I13 |
| RF24 | PRZ — colunas Responsável e Responsável final | `tarefas.responsavel`, `responsavel_final` | CT-I13 |
| RF25 | PRZ — colunas Admissão 1, Admissão 2… e abas mensais | API `GET /tarefas`; UI Tarefas | CT-I16 |
| RF26 | NOVO (status) | DOM `prazos.situacaoPrazo` | CT-U06, CT-I16 |
| RF27 | PRZ — `VLOOKUP(WEEKDAY())` | DOM `datas.diaDaSemana` | CT-U02, CT-I13 |
| RF28 | PRZ — "Modelo - copiar esta aba" | API `POST /config/modelos-prazo/:id/duplicar` | CT-I21 |
| RF29 | NOVO (alertas) | `servicos.painel`; API `/painel`; UI Painel | CT-I34 |
| RF30 | FER — linhas de colaboradores | API `POST /colaboradores/:id/status` | CT-I11 |
| RF31 | FER/CAD — coluna Área | BD `areas`; API `/areas`; UI Configuracoes (Áreas) | CT-I27 |
| RF32 | FER — Início/Fim do período aquisitivo (`EDATE`) | DOM `ferias.gerarPeriodosAquisitivos`; BD `periodos_aquisitivos` | CT-U11, CT-I22 |
| RF33 | FER — "Limite para início" (+335) e "Situação" | DOM `ferias.dataLimiteInicio`, `situacaoPeriodo` | CT-U12, CT-U14, CT-I22 |
| RF34 | FER — Início/Fim das férias | API `POST/PUT /ferias`, `/ferias/validar`, `/cancelar`; UI FeriasColaborador | CT-U15, CT-I23, CT-I26 |
| RF35 | NOVO | DOM `ferias.validarFerias` (sobreposição) | CT-U17, CT-I24 |
| RF36 | FER — filtros | API `GET /ferias`, `/ferias/colaboradores`; UI Ferias | CT-I27 |
| RF37 | FER 3 — Mapa de férias | DOM `ferias.diasPorMes`; API `/ferias/mapa`; UI MapaFerias | CT-U23, CT-I23 |
| RF38 | FER 3 — filtro | API `/ferias/mapa?area_id=&busca=&ano=` | CT-I27 |
| RF39 | NOVO | `ferias.status = CANCELADA` + motivo | CT-I26 |
| RF40 | CHK desligamento — cabeçalho | API `POST /desligamentos`; UI Desligamentos | CT-I28 |
| RF41 | CHK desligamento — etapas | seed `CHECKLIST_DESLIGAMENTO`; UI Checklist | CT-I28 |
| RF42 | CHK — Documentos da rescisão por modalidade | BD `modalidades_rescisao` + itens; API `PUT /desligamentos/:id` | CT-I29 |
| RF43 | CHK — itens Financeiro e legal | `checklist_itens.valor`; total de verbas | CT-I32 |
| RF44 | CHK — "conferência usando o checklist assinado na admissão" | UI aba Devolução de bens; API `PATCH /equipamentos/:id` | CT-I31 |
| RF45 | CHK — Passo a passo FGTS Digital e dicas | API `/fgts-digital`; UI FgtsDigital | CA-08 |
| RF46 | CHK desligamento — Feito/entregue | API `PATCH /itens/:id` | CT-I33 |
| RF47 | CAD 2 — coluna Demissão | API `POST /desligamentos/:id/concluir` | CT-I33 |
| RF48 | NOVO | `servicos.painel` (processos) | CT-I34 |
| RF49 | NOVO | BD `auditoria`; API `/colaboradores/:id/historico` | CT-I35 |
| RF50 | NOVO | `infra.auditar` (usuário + data/hora) | CT-I35 |
| RF51 | Planilhas (formato Excel) | `src/excel.ts` (Excel); impressão em PDF (`@media print`) | CA-12 |
| RF52 | NOVO | API `/auth/*`; `infra.autenticar` | CT-I01, CT-I02 |
| RF53 | NOVO | `infra.PERMISSOES`, `exigir()` | CT-U25, CT-I03 |

## 2. Requisitos não funcionais

| Req. | Componente / decisão | Teste |
|---|---|---|
| RNF01 | ADR-06; `apresentar()` oculta dados sensíveis | CT-I03, CT-I08 |
| RNF02 | AES-256-GCM (`infra.cifrar`), TLS no banco, HTTPS Vercel | CT-I08 |
| RNF03 | `autenticar` em todas as rotas `/api` | CT-I01 |
| RNF04 | Perfis ADMIN, RH, DP, GESTOR, TI | CT-U25, CT-I03, CA-09 |
| RNF05 | Tabela `auditoria` | CT-I35 |
| RNF06 | ADR-05; tela Configurações | CT-I36, CA-11 |
| RNF07 | Marcação de item com 1 clique (segmentado Feito/Não feito/N/A) | CA-04 |
| RNF08 | CSS responsivo (`@media`) | CA-10 |
| RNF09 | Checklist em uma única requisição | CT-I20 |
| RNF10 | Vercel + Neon | Implantação |
| RNF11 | Zod + restrições `CHECK/UNIQUE` | CT-I05, CT-I06, CT-U24 |
| RNF12 | `pendenciasAdmissao/Desligamento` | CT-I18, CT-I30 |
| RNF13 | `src/excel.ts lerPlanilhaCadastro`; API `/colaboradores/importar` | CT-I10, CA-03 |
| RNF14 | Vue 3 / ES2022 | CA-10 |
| RNF15 | Transações + recarga após alteração | CT-I15 |
| RNF16 | `estilo.css` único; componente `Checklist.vue` compartilhado | CA-04, CA-08 |
| RNF17 | Neon PITR + `GET /api/admin/backup` | CT-I37 |
| RNF18 | Camadas e módulos (SDD §4.2) | Revisão |

## 3. Regras de negócio

| Regra | Implementação | Teste |
|---|---|---|
| RN01, RN02 | `colaboradores.cpf_hash UNIQUE` | CT-I05 |
| RN03 | `ck_demissao_somente_desligado` | CT-I04, CT-I33 |
| RN04 | `CHECK nivel` | CT-I06 |
| RN05 | `reservista` opcional | CT-I04 |
| RN06 | `CHECK estado_civil` | CT-I06 |
| RN07 | FKs de processos/férias → `colaboradores` | CT-I13, CT-I28 |
| RN08 | `POST /admissoes` valida pessoa | CT-I12 |
| RN09 | `CHECK status IN (FEITO, NAO_FEITO, NA)` | CT-U09 |
| RN10 | `ck_na_somente_condicional` + `validarStatusItem` | CT-U09, CT-I14 |
| RN11–RN15 | Itens condicionais do seed (CTPS Digital, antecedentes, CNH/toxicológico, certidão filhos, vacinação/NR) | CT-I13 |
| RN16 | ASO com `prazo_dias = -1` | CT-I13 |
| RN17 | eSocial com `prazo_dias = -1` | CT-I13 |
| RN18 | Tabela `equipamentos` ligada à admissão | CT-I17 |
| RN19 | `calcularDataLimite(referência, dias)` | CT-U04 |
| RN20 | `situacaoPrazo = ATRASADA` | CT-U06, CT-I16 |
| RN21 | `recalcularPrazos` | CT-I15 |
| RN22 | `gerarPeriodosAquisitivos` | CT-U11 |
| RN23 | `ferias.periodo_aquisitivo_id` (FK) | CT-I23 |
| RN24 | `validarFerias` | CT-U18, CT-I25 |
| RN25 | `ck_ferias_datas` + `validarFerias` | CT-U16 |
| RN26 | `validarFerias` (sobreposição) | CT-U17, CT-I24 |
| RN27 | `diasDeDireito`, fracionamento, DSR | CT-U13, CT-U19, CT-U20 |
| RN28 | Mapa calculado a partir das férias vigentes | CT-I23 |
| RN29 | `validarFerias` (status ATIVO) | CT-U21, CT-I33 |
| RN30 | `POST /desligamentos` valida pessoa | CT-I28 |
| RN31 | Itens por modalidade (`origem = MODALIDADE`) | CT-I29 |
| RN32 | `motivo_confirmado` (reset ao trocar modalidade) | CT-I29 |
| RN33 | Exame demissional `prazo_dias = 10` | CT-I29 |
| RN34 | `homologacao_sindicato` | CA-08 |
| RN35 | `convencao_consultada` | CA-08 |
| RN36 | `orientacoes_pos` | CA-08 |
| RN37 | `pendenciasDesligamento` | CT-I30 |
| RN38 | Conclusão atualiza status | CT-I33 |
| RN39 | Pendência de equipamento não devolvido | CT-I28, CT-I31 |
| RN40 | `exigir()` por permissão | CT-I03 |

## 4. Requisitos de interface

| Req. | Tela |
|---|---|
| RI01, RI02 | Colaboradores, ColaboradorForm, ColaboradorDetalhe |
| RI03 | AdmissaoDetalhe (Checklist, Prazos, Equipamentos, Dados) |
| RI04 | Tarefas; aba Prazos da admissão |
| RI05 | Ferias, FeriasColaborador, MapaFerias |
| RI06 | DesligamentoDetalhe |
| RI07 | Painel |
| RI08 | Anexos no Checklist; aba Documentos; botões Excel/PDF |
