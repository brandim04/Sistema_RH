-- =====================================================================
-- Sistema de Ciclo de Vida do Colaborador - Grupo 2
-- Esquema relacional (PostgreSQL). Rastreabilidade: DRS seção 4.2.
-- As regras de negócio que podem ser garantidas pelo banco estão
-- anotadas com o identificador correspondente (RNxx / RNFxx).
-- =====================================================================

CREATE TABLE IF NOT EXISTS schema_meta (
  versao      INTEGER NOT NULL,
  aplicado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Segurança: usuários e perfis (RF52, RF53, RNF03, RNF04)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id          SERIAL PRIMARY KEY,
  nome        VARCHAR(120) NOT NULL,
  email       VARCHAR(160) NOT NULL UNIQUE,
  senha_hash  VARCHAR(100) NOT NULL,
  perfil      VARCHAR(20)  NOT NULL CHECK (perfil IN ('ADMIN','RH','DP','GESTOR','TI')),
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Parâmetros configuráveis (RNF06, DRS 2.5)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parametros (
  chave      VARCHAR(60) PRIMARY KEY,
  valor      TEXT NOT NULL,
  descricao  TEXT NOT NULL
);

-- ---------------------------------------------------------------------
-- Cadastro (RF01-RF10, RF31; RN01-RN06)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS areas (
  id    SERIAL PRIMARY KEY,
  nome  VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS colaboradores (
  id               SERIAL PRIMARY KEY,
  matricula        VARCHAR(20) NOT NULL UNIQUE,
  -- dados pessoais
  nome             VARCHAR(160) NOT NULL,
  rg               VARCHAR(30),
  cpf_hash         CHAR(64) NOT NULL UNIQUE,         -- RN01/RN02: CPF único (HMAC-SHA256)
  cpf_enc          TEXT NOT NULL,                    -- RNF01/RNF02: CPF cifrado (AES-256-GCM)
  cpf_final        CHAR(2) NOT NULL,                 -- exibição mascarada
  data_nascimento  DATE,
  nacionalidade    VARCHAR(60),
  estado           VARCHAR(40),
  cidade           VARCHAR(80),
  estado_civil     VARCHAR(20) CHECK (estado_civil IN
                     ('SOLTEIRO','CASADO','DIVORCIADO','VIUVO','SEPARADO','UNIAO_ESTAVEL')), -- RN06
  titulo_eleitor   VARCHAR(30),
  reservista       VARCHAR(30),                      -- RF03/RN05: opcional
  -- dados profissionais
  ctps             VARCHAR(30),
  pis_pasep        VARCHAR(30),
  data_admissao    DATE NOT NULL,
  data_demissao    DATE,
  area_id          INTEGER REFERENCES areas(id),
  cargo            VARCHAR(100) NOT NULL,
  nivel            VARCHAR(10) CHECK (nivel IN ('JUNIOR','PLENO','SENIOR')), -- RF06/RN04
  salario          NUMERIC(12,2) CHECK (salario IS NULL OR salario >= 0),
  status           VARCHAR(20) NOT NULL DEFAULT 'ATIVO'
                     CHECK (status IN ('EM_ADMISSAO','ATIVO','INATIVO','DESLIGADO')),
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- RN03 / RF05: data de demissão somente para quem foi desligado
  CONSTRAINT ck_demissao_somente_desligado CHECK (status = 'DESLIGADO' OR data_demissao IS NULL),
  CONSTRAINT ck_demissao_apos_admissao CHECK (data_demissao IS NULL OR data_demissao >= data_admissao)
);
CREATE INDEX IF NOT EXISTS ix_colaboradores_nome ON colaboradores (lower(nome));

-- ---------------------------------------------------------------------
-- Modelos configuráveis (RF16, RF28, RNF06)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS modalidades_rescisao (
  id          SERIAL PRIMARY KEY,
  codigo      VARCHAR(40) NOT NULL UNIQUE,
  nome        VARCHAR(120) NOT NULL,
  observacao  TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS modelo_checklist_itens (
  id               SERIAL PRIMARY KEY,
  tipo             VARCHAR(15) NOT NULL CHECK (tipo IN ('ADMISSAO','DESLIGAMENTO')),
  modalidade_id    INTEGER REFERENCES modalidades_rescisao(id) ON DELETE CASCADE,
  categoria        VARCHAR(60) NOT NULL,
  descricao        VARCHAR(200) NOT NULL,
  orientacao       TEXT,
  obrigatorio      BOOLEAN NOT NULL DEFAULT TRUE,
  condicional      BOOLEAN NOT NULL DEFAULT FALSE,  -- RN10: permite "Não se aplica"
  prazo_dias       INTEGER,                          -- RN16/RN17/RN33: prazo relativo à data do processo
  vigencia_inicio  DATE,                             -- DRS 2.5: vigência (ex.: PIS/PASEP)
  vigencia_fim     DATE,
  ordem            INTEGER NOT NULL DEFAULT 0,
  ativo            BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT ck_modalidade_apenas_deslig CHECK (modalidade_id IS NULL OR tipo = 'DESLIGAMENTO')
);

CREATE TABLE IF NOT EXISTS modelos_prazo (
  id      SERIAL PRIMARY KEY,
  nome    VARCHAR(100) NOT NULL UNIQUE,
  padrao  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS modelo_prazo_etapas (
  id                 SERIAL PRIMARY KEY,
  modelo_id          INTEGER NOT NULL REFERENCES modelos_prazo(id) ON DELETE CASCADE,
  ordem              INTEGER NOT NULL,
  etapa              VARCHAR(160) NOT NULL,
  dias               INTEGER NOT NULL,              -- dias em relação à data de referência (negativo = antes)
  responsavel        VARCHAR(100) NOT NULL,
  responsavel_final  VARCHAR(100)
);

-- ---------------------------------------------------------------------
-- Processos: admissão e desligamento (RF11-RF21, RF40-RF47)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admissoes (
  id                           SERIAL PRIMARY KEY,
  colaborador_id               INTEGER NOT NULL REFERENCES colaboradores(id), -- RN08
  data_referencia              DATE NOT NULL,     -- 1º dia de trabalho (RN19)
  cargo                        VARCHAR(100) NOT NULL,
  observacoes                  TEXT,
  modelo_prazo_id              INTEGER REFERENCES modelos_prazo(id),
  termo_equipamentos_assinado  BOOLEAN NOT NULL DEFAULT FALSE,  -- RF20
  termo_equipamentos_data      DATE,
  status                       VARCHAR(12) NOT NULL DEFAULT 'ABERTA'
                                 CHECK (status IN ('ABERTA','CONCLUIDA','CANCELADA')),
  criado_em                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em                 TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_admissao_aberta
  ON admissoes (colaborador_id) WHERE status = 'ABERTA';

CREATE TABLE IF NOT EXISTS desligamentos (
  id                     SERIAL PRIMARY KEY,
  colaborador_id         INTEGER NOT NULL REFERENCES colaboradores(id), -- RN30
  data_desligamento      DATE NOT NULL,
  cargo                  VARCHAR(100) NOT NULL,
  observacoes            TEXT,
  modalidade_id          INTEGER REFERENCES modalidades_rescisao(id),  -- RN31
  motivo_confirmado      BOOLEAN NOT NULL DEFAULT FALSE,               -- RN32
  aviso_previo           VARCHAR(12) NOT NULL DEFAULT 'NAO_DEFINIDO'
                           CHECK (aviso_previo IN ('NAO_DEFINIDO','TRABALHADO','INDENIZADO','DISPENSADO','NAO_APLICA')),
  homologacao_sindicato  BOOLEAN NOT NULL DEFAULT FALSE,               -- RN34
  convencao_consultada   BOOLEAN NOT NULL DEFAULT FALSE,               -- RN35
  orientacoes_pos        TEXT,                                         -- RN36
  status                 VARCHAR(12) NOT NULL DEFAULT 'ABERTO'
                           CHECK (status IN ('ABERTO','CONCLUIDO','CANCELADO')),
  criado_em              TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em           TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_desligamento_aberto
  ON desligamentos (colaborador_id) WHERE status = 'ABERTO';

CREATE TABLE IF NOT EXISTS checklist_itens (
  id               SERIAL PRIMARY KEY,
  admissao_id      INTEGER REFERENCES admissoes(id) ON DELETE CASCADE,
  desligamento_id  INTEGER REFERENCES desligamentos(id) ON DELETE CASCADE,
  origem           VARCHAR(12) NOT NULL DEFAULT 'GERAL' CHECK (origem IN ('GERAL','MODALIDADE','MANUAL')),
  categoria        VARCHAR(60) NOT NULL,
  descricao        VARCHAR(200) NOT NULL,
  orientacao       TEXT,                                               -- RF15
  obrigatorio      BOOLEAN NOT NULL DEFAULT TRUE,
  condicional      BOOLEAN NOT NULL DEFAULT FALSE,
  status           VARCHAR(10) NOT NULL DEFAULT 'NAO_FEITO'
                     CHECK (status IN ('FEITO','NAO_FEITO','NA')),     -- RF13/RN09
  observacao       TEXT,                                               -- RF14
  prazo_dias       INTEGER,                                            -- prazo relativo à data do processo
  data_limite      DATE,
  valor            NUMERIC(12,2),                                      -- RF43 (conferência de verbas)
  ordem            INTEGER NOT NULL DEFAULT 0,
  atualizado_por   INTEGER REFERENCES usuarios(id),
  atualizado_em    TIMESTAMPTZ,
  CONSTRAINT ck_item_um_processo CHECK ((admissao_id IS NULL) <> (desligamento_id IS NULL)),
  CONSTRAINT ck_na_somente_condicional CHECK (status <> 'NA' OR condicional)           -- RN10
);
CREATE INDEX IF NOT EXISTS ix_itens_adm ON checklist_itens (admissao_id);
CREATE INDEX IF NOT EXISTS ix_itens_desl ON checklist_itens (desligamento_id);

-- Prazos e tarefas (RF22-RF29; RN19-RN21)
CREATE TABLE IF NOT EXISTS tarefas (
  id                 SERIAL PRIMARY KEY,
  admissao_id        INTEGER NOT NULL REFERENCES admissoes(id) ON DELETE CASCADE,
  ordem              INTEGER NOT NULL,
  etapa              VARCHAR(160) NOT NULL,
  dias               INTEGER NOT NULL,
  data_limite        DATE NOT NULL,
  responsavel        VARCHAR(100) NOT NULL,
  responsavel_final  VARCHAR(100),
  concluida          BOOLEAN NOT NULL DEFAULT FALSE,
  concluida_em       TIMESTAMPTZ,
  observacao         TEXT
);
CREATE INDEX IF NOT EXISTS ix_tarefas_adm ON tarefas (admissao_id);

-- Equipamentos (RF19, RF20, RF44; RN18, RN39)
CREATE TABLE IF NOT EXISTS equipamentos (
  id              SERIAL PRIMARY KEY,
  colaborador_id  INTEGER NOT NULL REFERENCES colaboradores(id),
  admissao_id     INTEGER REFERENCES admissoes(id) ON DELETE SET NULL,
  descricao       VARCHAR(120) NOT NULL,
  patrimonio      VARCHAR(60),
  data_entrega    DATE NOT NULL,
  status          VARCHAR(12) NOT NULL DEFAULT 'ENTREGUE' CHECK (status IN ('ENTREGUE','DEVOLVIDO','EXTRAVIADO')),
  data_devolucao  DATE,
  observacao      TEXT,
  CONSTRAINT ck_devolucao CHECK (status = 'ENTREGUE' OR data_devolucao IS NOT NULL)
);

-- Documentos anexados (RF18, RI08)
CREATE TABLE IF NOT EXISTS documentos (
  id                 SERIAL PRIMARY KEY,
  colaborador_id     INTEGER NOT NULL REFERENCES colaboradores(id),
  checklist_item_id  INTEGER REFERENCES checklist_itens(id) ON DELETE SET NULL,
  nome_arquivo       VARCHAR(200) NOT NULL,
  mime               VARCHAR(100) NOT NULL,
  tamanho            INTEGER NOT NULL CHECK (tamanho > 0 AND tamanho <= 2097152),
  conteudo           BYTEA NOT NULL,
  enviado_por        INTEGER REFERENCES usuarios(id),
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Férias (RF30-RF39; RN22-RN29)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS periodos_aquisitivos (
  id              SERIAL PRIMARY KEY,
  colaborador_id  INTEGER NOT NULL REFERENCES colaboradores(id),
  numero          INTEGER NOT NULL,
  inicio          DATE NOT NULL,
  fim             DATE NOT NULL,
  faltas          INTEGER NOT NULL DEFAULT 0 CHECK (faltas >= 0),
  UNIQUE (colaborador_id, numero),
  CHECK (fim > inicio)
);

CREATE TABLE IF NOT EXISTS ferias (
  id                     SERIAL PRIMARY KEY,
  colaborador_id         INTEGER NOT NULL REFERENCES colaboradores(id),
  periodo_aquisitivo_id  INTEGER NOT NULL REFERENCES periodos_aquisitivos(id), -- RN23
  inicio                 DATE NOT NULL,
  fim                    DATE NOT NULL,
  dias                   INTEGER NOT NULL CHECK (dias > 0),
  status                 VARCHAR(12) NOT NULL DEFAULT 'PROGRAMADA' CHECK (status IN ('PROGRAMADA','CANCELADA')),
  motivo_cancelamento    TEXT,
  criado_por             INTEGER REFERENCES usuarios(id),
  criado_em              TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelado_em           TIMESTAMPTZ,
  CONSTRAINT ck_ferias_datas CHECK (inicio <= fim)                               -- RN25
);
CREATE INDEX IF NOT EXISTS ix_ferias_colab ON ferias (colaborador_id);

-- ---------------------------------------------------------------------
-- Auditoria (RF49, RF50, RNF05)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria (
  id             BIGSERIAL PRIMARY KEY,
  usuario_id     INTEGER,
  usuario_email  VARCHAR(160),
  acao           VARCHAR(40) NOT NULL,
  entidade       VARCHAR(40) NOT NULL,
  entidade_id    INTEGER,
  detalhes       JSONB,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_auditoria_entidade ON auditoria (entidade, entidade_id);
CREATE INDEX IF NOT EXISTS ix_auditoria_data ON auditoria (criado_em DESC);
