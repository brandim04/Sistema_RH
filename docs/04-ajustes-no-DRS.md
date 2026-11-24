# Ajustes sugeridos no DRS (para a versão final)

O DRS v2 do grupo está bem fundamentado (53 RF, 18 RNF, 40 RN, 8 RI, casos de uso, arquitetura e modelo conceitual). Comparando-o com a estrutura exigida no enunciado (IEEE 830 / ISO/IEC/IEEE 29148), seguem as lacunas e um texto pronto para cada uma.

## 1. Seções exigidas × situação atual

| Seção exigida | No DRS v2 | Ação |
|---|---|---|
| 1.1 Propósito do documento | Parcial (em "Visão geral") | Criar subseção — texto em §2.1 abaixo |
| 1.2 Escopo do sistema | Parcial | Explicitar o que está fora do escopo — §2.2 |
| 1.3 Definições, acrônimos e abreviações | Ausente | Glossário — §2.3 |
| 1.4 Referências | Presente (seção 5) | Mover para 1.4 e acrescentar normas — §2.4 |
| 1.5 Visão geral do documento | Ausente | §2.5 |
| 2.1 Perspectiva do produto | Parcial | §2.6 |
| 2.2 Funções do produto | Presente (2.6 Organização dos módulos) | Mover |
| 2.3 Características dos usuários | Presente (1.2 Stakeholders) | Mover e incluir nível técnico |
| 2.4 Restrições | Ausente | §2.7 |
| 2.5 Premissas e dependências | Parcial (2.5 Observações legais) | §2.8 |
| 3.1–3.3 RF, RNF, RN | Presente | Ajustes de redação em §3 |
| 3.4 Requisitos de interface (usuário, hardware, software, comunicação) | Só interface de usuário | §2.9 |
| 4.1 Casos de uso | Presente | Ok |
| 4.2 Modelo de dados | Presente (conceitual) | Acrescentar o diagrama ER lógico do `01-SDD-arquitetura.md` §4.3 |
| 4.3 Arquitetura | Presente | Atualizar 4.1.1: NestJS → Express (ADR-02) |
| 5. Matriz de rastreabilidade | Ausente | Usar `03-matriz-rastreabilidade.md` |
| 6. Critérios de aceitação | Ausente | §4 abaixo |
| 7. Anexos | Ausente | Planilhas, glossário, prints do sistema |

## 2. Textos prontos

### 2.1 Propósito
Este documento especifica os requisitos do Sistema de Ciclo de Vida do Colaborador, desenvolvido pelo Grupo 2 a partir de quatro planilhas de RH. Destina-se à equipe de desenvolvimento, ao professor avaliador e às partes interessadas de RH, servindo de base para projeto, construção, testes e aceitação, conforme a ISO/IEC/IEEE 29148 e o SWEBOK v4.

### 2.2 Escopo
O sistema, acessível pela web, substitui as planilhas de cadastro, férias, checklist de admissão/desligamento e prazos de admissão, compartilhando um cadastro único. Fora do escopo desta versão: integração automática com eSocial e FGTS Digital (apenas orientações), cálculo da folha e das verbas rescisórias (apenas conferência de valores), portal de autoatendimento da pessoa colaboradora e assinatura eletrônica com validade jurídica.

### 2.3 Definições, acrônimos e abreviações
| Termo | Definição |
|---|---|
| ASO | Atestado de Saúde Ocupacional |
| CLT | Consolidação das Leis do Trabalho |
| CTPS | Carteira de Trabalho e Previdência Social |
| DP | Departamento Pessoal |
| DRS | Documento de Requisitos de Software |
| DSR | Descanso semanal remunerado |
| eSocial | Sistema do governo para escrituração de obrigações trabalhistas |
| FGTS | Fundo de Garantia do Tempo de Serviço |
| LGPD | Lei Geral de Proteção de Dados (Lei 13.709/2018) |
| N/A | "Não se aplica" — estado de item condicional |
| Período aquisitivo | 12 meses de vínculo que geram direito a férias |
| Período concessivo | 12 meses seguintes ao aquisitivo, em que as férias devem ser concedidas |
| RF / RNF / RN / RI | Requisito funcional / não funcional / regra de negócio / requisito de interface |
| TRCT | Termo de Rescisão do Contrato de Trabalho |
| Data de referência | Primeiro dia de trabalho, base do cálculo dos prazos da admissão |

### 2.4 Referências (acrescentar)
- ISO/IEC/IEEE 29148:2018 — Requirements engineering.
- ISO/IEC/IEEE 42010:2022 — Architecture description.
- IEEE 1016-2009 — Software Design Descriptions.
- ISO/IEC/IEEE 29119-3:2021 — Test documentation.
- ISO/IEC 25010:2023 — Product quality model.
- Brasil. Decreto-Lei 5.452/1943 (CLT), arts. 130, 134, 137, 477, 479, 480, 484-A.
- Brasil. Lei 13.709/2018 (LGPD).

### 2.5 Visão geral do documento
A seção 2 descreve o produto, seus usuários, restrições e premissas; a seção 3 detalha os requisitos funcionais (por módulo), não funcionais, regras de negócio e interfaces; a seção 4 apresenta os modelos (casos de uso, dados e arquitetura); a seção 5 traz a matriz de rastreabilidade; a seção 6, os critérios de aceitação; e a seção 7, os anexos.

### 2.6 Perspectiva do produto
Sistema novo e independente que substitui planilhas isoladas. Funciona como aplicação web (SPA) com API REST e banco PostgreSQL, hospedada na Vercel. Não depende de outros sistemas da empresa; importa dados das planilhas originais e exporta para Excel/PDF.

### 2.7 Restrições
- Implantação obrigatória na Vercel (exigência da disciplina), com execução da API em funções serverless.
- Uso de banco gerenciado compatível com a Vercel (Neon/PostgreSQL), no plano gratuito.
- Anexos limitados a 2 MB por arquivo (limite de corpo de requisição da função).
- Tratamento de dados pessoais conforme a LGPD.
- Prazo de desenvolvimento: cronograma de 9 semanas da disciplina.

### 2.8 Premissas e dependências
- As regras legais levantadas refletem a legislação vigente em 2025/2026 e são parametrizáveis (DRS 2.5).
- Os usuários usam navegador moderno e têm acesso à internet.
- O repouso semanal é aos domingos (base da regra de início de férias, parametrizável).
- Disponibilidade da Vercel e do Neon conforme os planos utilizados.

### 2.9 Requisitos de interface complementares
- RI09 – Hardware: não há interface com hardware específico; funciona em computador ou celular com navegador.
- RI10 – Software: banco PostgreSQL 15+; importação de arquivos .xlsx no formato da planilha "Cadastro de pessoas colaboradoras"; exportação .xlsx compatível com Excel/LibreOffice/Google Planilhas.
- RI11 – Comunicação: HTTPS entre navegador e servidor; TLS entre servidor e banco; API REST com JSON.

## 3. Ajustes de redação (qualidade de requisito — ISO/IEC/IEEE 29148 §5.2.5)

Um requisito deve ser necessário, singular, não ambíguo, verificável e viável.

| Req. | Problema | Sugestão |
|---|---|---|
| RF01 × RF02 | Redundantes (RF02 detalha RF01) | Manter RF02 e transformar RF01 em título do grupo, ou fundir |
| RF29 | "alertas" não diz quando | "O sistema deve exibir no painel alertas de etapas e itens que vencem em até N dias (parâmetro, padrão 3) e de férias cujo início-limite ocorre em até 60 dias." |
| RNF07 | "simples e intuitiva" não é verificável | "Marcar a situação de um item do checklist deve exigir no máximo 1 clique a partir da tela do processo." |
| RNF10 | Vago | "O sistema deve estar acessível pela URL pública da Vercel durante o período de avaliação, salvo indisponibilidade do provedor." |
| RNF14 | "navegadores modernos" | "Versões atuais de Chrome, Edge, Firefox e Safari." |
| RN12, RN15 | "quando aplicável" sem critério | Indicar que o item é condicional e que o usuário registra "Não se aplica" com observação |
| RN27 | "quantidade de dias permitida pela legislação" | Explicitar: até 30 dias conforme faltas (art. 130); até 3 períodos, um ≥ 14 dias, demais ≥ 5 dias (art. 134 §1º) |
| RN11 | "conforme a regra definida no processo" | "A CTPS Digital é item obrigatório do checklist de admissão." |

## 4. Critérios de aceitação (seção 6 do DRS)

Formato Dado / Quando / Então (critérios verificáveis). Cada critério tem teste automatizado ou manual correspondente (ver `02-plano-de-testes.md`).

| Req. | Critério de aceitação |
|---|---|
| RF02 / RN02 | Dado uma pessoa com CPF 529.982.247-25 cadastrada, quando tento cadastrar outra com o mesmo CPF, então o sistema recusa e informa que já existe uma pessoa cadastrada com esse CPF. |
| RF06 / RN04 | Quando informo um nível diferente de Júnior, Pleno ou Sênior, então o cadastro é recusado. |
| RF08 | Quando abro uma pessoa, então vejo dados pessoais e profissionais na mesma tela, sem campos editáveis. |
| RF12 | Quando crio uma admissão, então o checklist é gerado com as etapas Documentação, Exames, Cadastros/acessos e Onboarding. |
| RF13 / RN10 | Dado o item CPF (não condicional), quando tento marcar "Não se aplica", então o sistema recusa; para CNH (condicional) aceita. |
| RF17 | Quando clico em "Termo LGPD", então é exibido o termo com nome e CPF da pessoa, pronto para imprimir/salvar em PDF. |
| RF21 | Dado 4 itens com 1 feito e 1 N/A, então o percentual exibido é 50 %. |
| RF22 / RN19 | Dado 1º dia 17/01/2022, então a etapa com −35 dias tem data limite 13/12/2021 (segunda-feira). |
| RN20 | Dado uma etapa com data limite anterior a hoje e não concluída, então ela aparece como "Atrasada" no painel. |
| RN21 | Quando altero o 1º dia, então todas as datas limite do processo são recalculadas. |
| RF32 / RF33 | Dado admissão em 01/01/2023, então o 1º período aquisitivo vai de 01/01/2023 a 31/12/2023 e o limite para início das férias é 01/12/2024. |
| RF35 / RN26 | Dado férias de 07/07 a 21/07, quando registro férias de 14/07 a 28/07 para a mesma pessoa, então o sistema recusa por conflito. |
| RN27 | Quando registro férias de 3 dias, então o sistema recusa (mínimo de 5 dias). |
| RF37 / RN28 | Quando registro ou cancelo férias, então o mapa de férias reflete a mudança sem ação adicional. |
| RF39 | Quando cancelo férias, então elas permanecem no histórico com o motivo e o saldo é restabelecido. |
| RF42 / RN31 | Quando seleciono a modalidade "Rescisão por acordo", então o checklist inclui "Multa rescisória do FGTS (20%)" e não inclui os itens de outras modalidades. |
| RF44 / RN39 | Dado um equipamento entregue na admissão e não devolvido, então o desligamento não pode ser concluído. |
| RNF12 / RN37 | Dado um item obrigatório pendente, então o botão "Concluir" fica desabilitado e a API recusa a conclusão. |
| RF47 / RN38 | Quando concluo o desligamento, então a pessoa passa a "Desligado" com a data de demissão igual à data do desligamento. |
| RF50 | Quando altero qualquer item, então a auditoria registra usuário, ação e data/hora. |
| RF53 / RNF04 | Dado um usuário Gestor, então ele não vê CPF completo nem salário e não consegue cadastrar ou alterar processos. |
| RNF09 | Quando abro um processo com cerca de 40 itens, então a tela carrega em menos de 2 segundos. |
