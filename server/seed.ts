import type { PoolClient } from 'pg';
import bcrypt from 'bcryptjs';

/**
 * Dados iniciais obtidos por engenharia reversa das planilhas do Grupo 2
 * (DRS 1.1). Tudo aqui é configurável depois pela tela "Configurações" (RNF06).
 *
 *  - Checklist de admissão / desligamento  -> "MR_PLN Admissão e desligamento - Convenia"
 *  - Modalidades de rescisão e documentos -> aba "Documentos da rescisão e dicas"
 *  - Modelos de prazos                     -> "Planilha para Gerenciamento de Prazos na Admissão"
 *  - Áreas                                 -> "Cadastro de pessoas colaboradoras" / "Controle de férias"
 */

type ItemModelo = {
  categoria: string;
  descricao: string;
  orientacao?: string;
  obrigatorio?: boolean;
  condicional?: boolean;
  prazo_dias?: number;
  vigencia_fim?: string;
};

// [categoria, descrição, orientação, obrigatório, condicional, prazo]
export const CHECKLIST_ADMISSAO: ItemModelo[] = [
  { categoria: 'Documentação', descricao: 'CTPS Digital', orientacao: 'Desde 2019 é obrigatório utilizar a CTPS digital.' },
  { categoria: 'Documentação', descricao: 'RG (Registro Geral)', orientacao: 'Não é obrigatório para o eSocial.', obrigatorio: false },
  { categoria: 'Documentação', descricao: 'CPF (Cadastro de Pessoa Física)', orientacao: 'Obrigatório para o eSocial.' },
  { categoria: 'Documentação', descricao: 'Raça/etnia', orientacao: 'Obrigatório para o eSocial.' },
  { categoria: 'Documentação', descricao: 'Certidão de antecedentes criminais', orientacao: 'Obrigatória somente para instituições de ensino que trabalham com crianças e adolescentes; atualizar a cada 6 meses (RN12).', condicional: true },
  { categoria: 'Documentação', descricao: 'Título de eleitor', orientacao: 'Não é obrigatório para o eSocial.', obrigatorio: false },
  { categoria: 'Documentação', descricao: 'Certidão de nascimento/casamento', orientacao: 'Não é obrigatória para o eSocial.', obrigatorio: false },
  { categoria: 'Documentação', descricao: 'Alistamento militar/reservista', orientacao: 'Não é obrigatório para o eSocial, mas é recomendável solicitar (RN05).', obrigatorio: false, condicional: true },
  { categoria: 'Documentação', descricao: 'Comprovante de residência', orientacao: 'Obrigatório para o eSocial (contas de consumo, fatura de cartão, contrato de aluguel com firma reconhecida, declaração de residência).' },
  { categoria: 'Documentação', descricao: 'Comprovante de escolaridade' },
  { categoria: 'Documentação', descricao: 'Inscrição no PIS/PASEP', orientacao: 'Obrigatório somente para admissões até 02/2024 (regra com vigência configurável).', vigencia_fim: '2024-02-29' },
  { categoria: 'Documentação', descricao: 'Fotos', orientacao: 'Não é obrigatório para o eSocial.', obrigatorio: false },
  { categoria: 'Documentação', descricao: 'CNH', orientacao: 'Obrigatória somente para motoristas (RN13).', condicional: true },
  { categoria: 'Documentação', descricao: 'Certidão de nascimento dos(as) filhos(as)', orientacao: 'Para dependentes de salário-família (até 14 anos) e IRRF (até 21 anos) (RN14).', condicional: true },
  { categoria: 'Documentação', descricao: 'Declaração para abertura de conta bancária' },
  { categoria: 'Documentação', descricao: 'Contrato de trabalho (redação e assinaturas)' },
  { categoria: 'Documentação', descricao: 'Autorização para coleta de dados pessoais (LGPD)', orientacao: 'Dispensada se o contrato de trabalho já tiver cláusula de consentimento. Use o botão "Termo LGPD" para gerar o documento (RF17).', condicional: true },
  { categoria: 'Documentação', descricao: 'Carteira nacional de vacinação', orientacao: 'Se aplicável à área de atuação (RN15).', condicional: true },
  { categoria: 'Documentação', descricao: 'Certificados de cursos ou treinamentos obrigatórios', orientacao: 'Se aplicável. Exemplos: NR-35, NR-10, conforme a função (RN15).', condicional: true },
  { categoria: 'Exames', descricao: 'Marcar exame médico admissional', prazo_dias: -5 },
  { categoria: 'Exames', descricao: 'Atestado de saúde ocupacional (ASO) admissional', orientacao: 'Deve ser feito antes do início da prestação do serviço e custeado integralmente pela empresa (RN16).', prazo_dias: -1 },
  { categoria: 'Exames', descricao: 'Exame toxicológico', orientacao: 'Obrigatório para motoristas (RN13).', condicional: true, prazo_dias: -1 },
  { categoria: 'Cadastros/acessos', descricao: 'Sistema de RH/DP/Folha de pagamento' },
  { categoria: 'Cadastros/acessos', descricao: 'Controle de ponto', orientacao: 'Controle de jornada obrigatório somente para empresas com mais de 20 colaboradores(as).', condicional: true },
  { categoria: 'Cadastros/acessos', descricao: 'Cadastro no eSocial', orientacao: 'Enviar até 1 dia antes do início da prestação de serviço (RN17).', prazo_dias: -1 },
  { categoria: 'Cadastros/acessos', descricao: 'Liberar/informar acesso à portaria/prédio' },
  { categoria: 'Onboarding', descricao: 'Criar e-mail corporativo' },
  { categoria: 'Onboarding', descricao: 'Enviar manual da pessoa colaboradora', orientacao: 'Incluir orientação sobre a política de segurança da informação, quando aplicável.' },
  { categoria: 'Onboarding', descricao: 'Enviar equipamentos', orientacao: 'Registre os itens no inventário de equipamentos e colete a assinatura do termo de entrega (RF19/RF20, RN18).', condicional: true },
  { categoria: 'Onboarding', descricao: 'Entregar crachá de identificação' },
  { categoria: 'Onboarding', descricao: 'Disponibilizar login/senhas de acesso' },
  { categoria: 'Onboarding', descricao: 'Treinamento inicial obrigatório', orientacao: 'Segurança, conduta etc.' },
  { categoria: 'Onboarding', descricao: 'Assinatura do código de conduta/ética' },
  { categoria: 'Onboarding', descricao: 'Apresentação da empresa e seus valores' },
  { categoria: 'Onboarding', descricao: 'Fornecimento de uniforme e EPIs', condicional: true },
  { categoria: 'Onboarding', descricao: 'Formulário de adesão ao VA/VR', condicional: true },
  { categoria: 'Onboarding', descricao: 'Formulário de adesão ao VT (vale-transporte)', condicional: true },
  { categoria: 'Onboarding', descricao: 'Formulário de adesão ao plano de saúde', condicional: true },
  { categoria: 'Onboarding', descricao: 'Formulário de adesão ao plano odontológico', condicional: true },
];

export const CHECKLIST_DESLIGAMENTO: ItemModelo[] = [
  { categoria: 'Financeiro e legal', descricao: 'Checar modalidade de rescisão', orientacao: 'Pedido, sem justa causa, com justa causa etc. Confirme o motivo antes da conclusão (RN32).' },
  { categoria: 'Financeiro e legal', descricao: 'Checar cumprimento do aviso prévio', orientacao: 'Na dispensa sem justa causa, a pessoa tem direito a redução de 2 horas na jornada ou a sair 7 dias antes do fim do aviso.', condicional: true },
  { categoria: 'Financeiro e legal', descricao: 'Saldo de salário' },
  { categoria: 'Financeiro e legal', descricao: 'Férias vencidas/proporcionais' },
  { categoria: 'Financeiro e legal', descricao: 'Aviso prévio e dias excedentes do aviso', condicional: true },
  { categoria: 'Financeiro e legal', descricao: 'Adicionais (insalubridade, periculosidade etc.)', condicional: true },
  { categoria: 'Financeiro e legal', descricao: 'Impostos (INSS/IRRF)' },
  { categoria: 'Financeiro e legal', descricao: 'Faltas', condicional: true },
  { categoria: 'Financeiro e legal', descricao: 'Salário-família', condicional: true },
  { categoria: 'Financeiro e legal', descricao: 'Conferir médias salariais', condicional: true },
  { categoria: 'Financeiro e legal', descricao: '13º salário proporcional' },
  { categoria: 'Financeiro e legal', descricao: 'Confirmação da entrega de documentos pessoais', orientacao: 'Ex.: carteira de trabalho com baixa na página do contrato.' },
  { categoria: 'Exames', descricao: 'Marcar exame médico demissional', orientacao: 'Pode ser dispensado se o exame periódico estiver dentro do prazo (135 dias para graus de risco 1 e 2; 90 dias para graus 3 e 4) (RN33).', condicional: true, prazo_dias: 10 },
  { categoria: 'Exames', descricao: 'Atestado de saúde ocupacional (ASO) demissional', orientacao: 'Até 10 dias após o término do contrato (RN33).', condicional: true, prazo_dias: 10 },
  { categoria: 'Documentos', descricao: 'Comprovante de pagamento da rescisão', orientacao: 'Pagamento das verbas em até 10 dias do término do contrato (CLT art. 477 §6º).', prazo_dias: 10 },
  { categoria: 'Documentos', descricao: 'Ficha de registro do(a) colaborador(a)' },
  { categoria: 'Cadastros/acessos', descricao: 'Baixa no eSocial' },
  { categoria: 'Cadastros/acessos', descricao: 'Baixa no sistema de RH/DP/Folha' },
  { categoria: 'Cadastros/acessos', descricao: 'Baixa no controle de ponto', condicional: true },
  { categoria: 'Cadastros/acessos', descricao: 'Revogar acesso e informar portaria/prédio' },
  { categoria: 'Cadastros/acessos', descricao: 'Encerrar e-mail corporativo' },
  { categoria: 'Cadastros/acessos', descricao: 'Encerrar benefícios', orientacao: 'Passe orientações sobre direitos pós-desligamento, como manutenção do plano de saúde e por quanto tempo (RN36).' },
  { categoria: 'Devolução de bens', descricao: 'Devolução do crachá' },
  { categoria: 'Devolução de bens', descricao: 'Devolução de EPI/uniforme', condicional: true },
  { categoria: 'Devolução de bens', descricao: 'Devolução de equipamentos', orientacao: 'Confira usando o inventário assinado na admissão (aba Equipamentos) (RN39).', condicional: true },
  { categoria: 'Offboarding', descricao: 'Atualização de contatos para futuras comunicações', orientacao: 'Para homologação, envio de documentos etc.' },
  { categoria: 'Offboarding', descricao: 'Entrevista de desligamento', obrigatorio: false, condicional: true },
];

const DOC = 'Documentos da rescisão';
const HOMOLOG = { categoria: DOC, descricao: 'Termo de quitação ou de homologação', orientacao: 'Homologação somente se a rescisão for homologada no sindicato (RN34).' };
const TRCT = { categoria: DOC, descricao: 'Termo de rescisão do contrato de trabalho (TRCT)' };
const ESOCIAL = { categoria: DOC, descricao: 'Enviar a rescisão para o eSocial' };
const EXTRATO_RESC = { categoria: DOC, descricao: 'Extrato do FGTS para fins rescisórios', orientacao: 'Com pouco tempo de serviço, pode ser emitido o extrato simples. Solicite cerca de 15 dias antes do fim do aviso.' };
const EXTRATO_SIMPLES = { categoria: DOC, descricao: 'Extrato simples do FGTS' };

export const MODALIDADES: { codigo: string; nome: string; observacao?: string; itens: ItemModelo[] }[] = [
  {
    codigo: 'SEM_JUSTA_CAUSA', nome: 'Dispensa sem justa causa',
    itens: [
      { categoria: DOC, descricao: 'Aviso prévio assinado' }, EXTRATO_RESC, TRCT, HOMOLOG, ESOCIAL,
      { categoria: DOC, descricao: 'Calcular a multa rescisória de 40% no FGTS Digital' },
      { categoria: DOC, descricao: 'Emitir o demonstrativo da multa no FGTS Digital' },
      { categoria: DOC, descricao: 'Formulário do seguro-desemprego' },
    ],
  },
  {
    codigo: 'PEDIDO_DEMISSAO', nome: 'Pedido de demissão',
    observacao: 'Nesta modalidade o FGTS é recolhido na guia mensal.',
    itens: [
      { categoria: DOC, descricao: 'Pedido de demissão (preferencialmente de próprio punho)' },
      { categoria: DOC, descricao: 'Aviso prévio' }, EXTRATO_RESC, TRCT, HOMOLOG, ESOCIAL,
    ],
  },
  {
    codigo: 'ANTECIPADA_EMPREGADOR', nome: 'Rescisão antecipada do contrato de experiência pela empresa (art. 479 CLT)',
    itens: [
      { categoria: DOC, descricao: 'Comunicado de dispensa antecipada, com a indenização do art. 479 da CLT' },
      EXTRATO_SIMPLES, TRCT, { categoria: DOC, descricao: 'Termo de quitação do contrato' }, ESOCIAL,
      { categoria: DOC, descricao: 'Emissão da multa rescisória (40%) no FGTS Digital' },
      { categoria: DOC, descricao: 'Demonstrativo da multa emitido no FGTS Digital' },
      { categoria: DOC, descricao: 'Formulário do seguro-desemprego' },
    ],
  },
  {
    codigo: 'ANTECIPADA_EMPREGADO', nome: 'Rescisão antecipada do contrato de experiência pela pessoa colaboradora (art. 480 CLT)',
    observacao: 'Nesta modalidade o FGTS é recolhido na guia mensal.',
    itens: [
      { categoria: DOC, descricao: 'Pedido de desligamento com ciência sobre o art. 480 da CLT (desconto de prejuízos comprovados)' },
      EXTRATO_SIMPLES, TRCT, { categoria: DOC, descricao: 'Termo de quitação do contrato' }, ESOCIAL,
    ],
  },
  {
    codigo: 'TERMINO_CONTRATO', nome: 'Término do contrato (prazo determinado)',
    itens: [
      { categoria: DOC, descricao: 'Comunicado da parte que não deseja continuar o contrato' },
      EXTRATO_SIMPLES, TRCT, { categoria: DOC, descricao: 'Termo de quitação' }, ESOCIAL,
      { categoria: DOC, descricao: 'Emitir a guia rescisória do FGTS no FGTS Digital' },
      { categoria: DOC, descricao: 'Demonstrativo da guia rescisória emitido no FGTS Digital' },
    ],
  },
  {
    codigo: 'ACORDO', nome: 'Rescisão por acordo (art. 484-A CLT)',
    itens: [
      { categoria: DOC, descricao: 'Solicitação de acordo com ciência do saque de 80% do FGTS e sem direito ao seguro-desemprego' },
      EXTRATO_SIMPLES, TRCT, { categoria: DOC, descricao: 'Termo de quitação do contrato' }, ESOCIAL,
      { categoria: DOC, descricao: 'Multa rescisória do FGTS (20%)' },
      { categoria: DOC, descricao: 'Demonstrativo da multa emitido no FGTS Digital' },
    ],
  },
  {
    codigo: 'JUSTA_CAUSA', nome: 'Dispensa por justa causa',
    observacao: 'Nesta modalidade o FGTS é recolhido na guia mensal.',
    itens: [
      { categoria: DOC, descricao: 'Comunicado da empresa detalhando o motivo da justa causa' },
      EXTRATO_SIMPLES, TRCT, ESOCIAL,
    ],
  },
];

type Etapa = [etapa: string, dias: number, responsavel: string, responsavelFinal: string];

/** Aba "Modelo - copiar esta aba" + etapas de onboarding da aba "Calculadora". */
export const PRAZOS_PADRAO: Etapa[] = [
  ['Prazo para alinhamento de vagas HRBP <> Liderança', -42, 'HRBPs', 'Liderança: informar vagas p/ BPs'],
  ['Abertura de vaga na plataforma', -40, 'Recruiter', 'Recruiter'],
  ['Triagem pela pessoa gestora', -32, 'Recruiter', 'Liderança'],
  ['Entrevista/teste técnico + triagem', -29, 'Recruiter', 'Liderança'],
  ['Entrevista Recruiter', -28, 'Recruiter', 'Recruiter'],
  ['Entrevista pessoa gestora', -26, 'Recruiter', 'Recruiter: marca a entrevista'],
  ['Entrevista Diretoria', -21, 'Recruiter', 'Recruiter: marca a entrevista'],
  ['Entrevista com Comitê de Cultura', -18, 'Recruiter', 'Recruiter: marca a entrevista'],
  ['Validação da proposta internamente', -17, 'Recruiter', 'Liderança'],
  ['Realização da proposta', -16, 'Recruiter', 'Liderança'],
  ['Envio da carta oferta', -16, 'Recruiter', 'Recruiter'],
  ['Aceite da carta proposta', -15, 'Recruiter', 'Recruiter'],
  ['Movimentação para o sistema de admissão', -14, 'Recruiter', 'Recruiter'],
  ['Processo de admissão (DP)', -11, 'Departamento Pessoal', 'Departamento Pessoal'],
  ['Recebimento do kit de onboarding', -5, 'Facilities', 'Facilities'],
  ['E-mail da nova pessoa', -5, 'Departamento Pessoal', 'Departamento Pessoal'],
  ['Primeiro dia na empresa', 0, 'Gente & Gestão', 'Gente & Gestão'],
  ['Início do onboarding da empresa', 0, 'Gente & Gestão', 'BP da área'],
  ['Início do onboarding da área', 3, 'Liderança', 'BP da área'],
];

/** Aba "Calculadora Tech". */
export const PRAZOS_TECH: Etapa[] = [
  ['Prazo para as BPs informarem das vagas', -40, 'HRBPs', ''],
  ['Abertura de vaga', -35, 'Liderança', ''],
  ['Triagem', -27, 'Liderança', ''],
  ['Bate-papo Gente & Gestão', -22, 'Talent Acquisition', ''],
  ['Entrevista técnica | Teste técnico', -15, 'Liderança', ''],
  ['Entrevista Heads', -13, 'Heads', ''],
  ['Entrevista com Comitê de Cultura', -7, 'Talent Acquisition', ''],
  ['Validação da proposta internamente', -7, 'Talent Acquisition', ''],
  ['Realização da proposta', -7, 'Talent Acquisition', ''],
  ['Envio da carta oferta', -7, 'Talent Acquisition', ''],
  ['Preenchimento de dados pessoais no sistema de admissão', -6, 'Nova pessoa colaboradora', ''],
  ['Processo de admissão (DP)', -4, 'Departamento Pessoal', ''],
  ['Recebimento do kit de onboarding', 0, 'Facilities', ''],
  ['Primeiro dia na empresa', 0, 'Gente & Gestão e BP da área', ''],
  ['Início do onboarding da empresa', 0, 'Gente & Gestão e BP da área', ''],
  ['Início do onboarding da área', 6, 'Liderança + BP da área', ''],
];

export const PARAMETROS: [string, string, string][] = [
  ['empresa_nome', 'Empresa Exemplo Ltda.', 'Nome da empresa usado no termo LGPD.'],
  ['encarregado_email', 'dpo@empresa.com.br', 'E-mail do(a) encarregado(a) de dados (LGPD).'],
  ['alerta_dias', '3', 'Quantos dias antes do vencimento um prazo passa a gerar alerta (RF29).'],
  ['prazos_antecipar_fim_de_semana', 'true', 'Se a data limite cair no sábado/domingo, antecipa para sexta-feira (observação da planilha de prazos).'],
  ['ferias_alerta_limite_dias', '60', 'Alertar quando faltarem até N dias para a data limite de início das férias.'],
  ['ferias_bloquear_inicio_antes_dsr', 'true', 'Impede início das férias nos 2 dias que antecedem o repouso semanal (sexta e sábado) - CLT art. 134 §3º.'],
  ['ferias_dias_limite_apos_aquisitivo', '335', 'Dias após o fim do período aquisitivo para a data limite de início (planilha de férias: fim + 335).'],
  ['termo_lgpd', 'Eu, {nome}, CPF {cpf}, autorizo a {empresa} a tratar os dados pessoais que forneci na admissão e durante o contrato de trabalho. Esses dados serão usados para as finalidades relacionadas ao meu emprego, como pagamento, benefícios, comunicação e cumprimento de obrigações legais.\n\nEstou ciente de que meus dados serão armazenados com segurança e de que posso solicitar acesso, correção ou eliminação dessas informações, nos termos da LGPD, pelo e-mail do(a) encarregado(a): {encarregado}.\n\nLi e compreendi esta autorização e concordo com o tratamento dos meus dados.', 'Texto do termo de consentimento LGPD (RF17). Campos: {nome} {cpf} {empresa} {encarregado}.'],
];

export const AREAS = ['Vendas', 'Marketing', 'RH', 'Engenharia', 'Tecnologia', 'Financeiro', 'Operações'];

async function insertItens(c: PoolClient, tipo: string, itens: ItemModelo[], modalidadeId: number | null) {
  let ordem = 0;
  for (const it of itens) {
    ordem += 10;
    await c.query(
      `INSERT INTO modelo_checklist_itens
        (tipo, modalidade_id, categoria, descricao, orientacao, obrigatorio, condicional, prazo_dias, vigencia_fim, ordem)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [tipo, modalidadeId, it.categoria, it.descricao, it.orientacao ?? null, it.obrigatorio ?? true,
        it.condicional ?? false, it.prazo_dias ?? null, it.vigencia_fim ?? null, ordem],
    );
  }
}

export async function seed(c: PoolClient) {
  const jaTem = await c.query('SELECT count(*)::int AS n FROM modelo_checklist_itens');
  if (jaTem.rows[0].n > 0) return;

  for (const [chave, valor, descricao] of PARAMETROS) {
    await c.query('INSERT INTO parametros (chave, valor, descricao) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [chave, valor, descricao]);
  }
  for (const a of AREAS) await c.query('INSERT INTO areas (nome) VALUES ($1) ON CONFLICT DO NOTHING', [a]);

  await insertItens(c, 'ADMISSAO', CHECKLIST_ADMISSAO, null);
  await insertItens(c, 'DESLIGAMENTO', CHECKLIST_DESLIGAMENTO, null);
  for (const m of MODALIDADES) {
    const r = await c.query('INSERT INTO modalidades_rescisao (codigo, nome, observacao) VALUES ($1,$2,$3) RETURNING id', [m.codigo, m.nome, m.observacao ?? null]);
    await insertItens(c, 'DESLIGAMENTO', m.itens, r.rows[0].id);
  }

  for (const [nome, etapas, padrao] of [['Padrão (planilha de prazos)', PRAZOS_PADRAO, true], ['Tech (Calculadora Tech)', PRAZOS_TECH, false]] as const) {
    const r = await c.query('INSERT INTO modelos_prazo (nome, padrao) VALUES ($1,$2) RETURNING id', [nome, padrao]);
    let ordem = 0;
    for (const [etapa, dias, resp, respFinal] of etapas) {
      ordem += 10;
      await c.query(
        'INSERT INTO modelo_prazo_etapas (modelo_id, ordem, etapa, dias, responsavel, responsavel_final) VALUES ($1,$2,$3,$4,$5,$6)',
        [r.rows[0].id, ordem, etapa, dias, resp, respFinal || null],
      );
    }
  }

  const email = (process.env.ADMIN_EMAIL ?? 'admin@empresa.com').toLowerCase();
  const senha = process.env.ADMIN_PASSWORD ?? 'Admin@123';
  await c.query(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ('Administrador', $1, $2, 'ADMIN') ON CONFLICT (email) DO NOTHING`,
    [email, await bcrypt.hash(senha, 10)],
  );
}
