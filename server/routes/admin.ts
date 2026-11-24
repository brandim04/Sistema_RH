import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db';
import { hoje } from '../domain/datas';
import {
  auditar, autenticar, emitirSessao, encerrarSessao, exigir, HttpError, idParam, naoEncontrado, PERMISSOES, Perfil, validar,
} from '../infra';
import { painel } from '../servicos';
import { idOpcional, textoOpcional } from './comum';
import { resumoFerias } from './ferias';

// =====================================================================
// AUTENTICAÇÃO (RF52)
// =====================================================================
export const auth = Router();

const tentativas = new Map<string, { n: number; ate: number }>();

auth.post('/login', async (req, res) => {
  const { email, senha } = validar(z.object({ email: z.string().trim().toLowerCase().email('E-mail inválido.'), senha: z.string().min(1) }), req.body);
  const t = tentativas.get(email);
  if (t && t.n >= 5 && t.ate > Date.now()) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
  const u = await one('SELECT * FROM usuarios WHERE email=$1 AND ativo', [email]);
  if (!u || !(await bcrypt.compare(senha, u.senha_hash))) {
    tentativas.set(email, { n: (t?.n ?? 0) + 1, ate: Date.now() + 5 * 60_000 });
    await auditar(undefined, undefined, 'LOGIN_FALHOU', 'usuario', u?.id ?? null, { email });
    throw new HttpError(401, 'E-mail ou senha incorretos.');
  }
  tentativas.delete(email);
  const usuario = { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil as Perfil };
  emitirSessao(res, usuario);
  await auditar(undefined, usuario, 'LOGIN', 'usuario', u.id);
  res.json({ ...usuario, permissoes: PERMISSOES[usuario.perfil] });
});

auth.post('/logout', (_req, res) => {
  encerrarSessao(res);
  res.json({ ok: true });
});

auth.get('/me', autenticar, (req, res) => {
  res.json({ ...req.usuario, permissoes: PERMISSOES[req.usuario!.perfil] });
});

auth.post('/senha', autenticar, async (req, res) => {
  const { atual, nova } = validar(z.object({
    atual: z.string().min(1),
    nova: z.string().min(8, 'A nova senha deve ter ao menos 8 caracteres.').regex(/[A-Za-z]/, 'Use letras.').regex(/\d/, 'Use números.'),
  }), req.body);
  const u = await one('SELECT * FROM usuarios WHERE id=$1', [req.usuario!.id]);
  if (!u || !(await bcrypt.compare(atual, u.senha_hash))) throw new HttpError(400, 'Senha atual incorreta.');
  await query('UPDATE usuarios SET senha_hash=$2 WHERE id=$1', [u.id, await bcrypt.hash(nova, 10)]);
  await auditar(undefined, req.usuario, 'ALTERAR_SENHA', 'usuario', u.id);
  res.json({ ok: true });
});

// =====================================================================
// DEMAIS ROTAS ADMINISTRATIVAS (todas exigem autenticação)
// =====================================================================
export const r = Router();

// RF48 / RF29: painel de pendências e alertas
r.get('/painel', exigir('processo:ler'), async (_req, res) => {
  const [p, ferias] = await Promise.all([painel(), resumoFerias()]);
  const cfg = await one("SELECT valor FROM parametros WHERE chave='ferias_alerta_limite_dias'");
  const lim = Number(cfg?.valor ?? 60);
  const alertasFerias = ferias
    .filter((f) => f.status === 'ATIVO' && (f.situacao === 'VENCIDAS' || (['DISPONIVEIS', 'PARCIAL'].includes(f.situacao!) && (f.dias_para_limite ?? 999) <= lim)))
    .map((f) => ({
      tipo: 'FERIAS', severidade: f.situacao === 'VENCIDAS' ? 'alta' : 'media', data: f.limite_inicio,
      mensagem: f.situacao === 'VENCIDAS' ? `Férias vencidas — ${f.nome}` : `Férias devem iniciar até ${f.limite_inicio} — ${f.nome}`,
      link: `/ferias/${f.colaborador_id}`, situacao: f.situacao,
    }));
  res.json({
    ...p,
    contadores: { ...p.contadores, ferias_vencidas: ferias.filter((f) => f.situacao === 'VENCIDAS').length, ferias_em_gozo: ferias.filter((f) => f.situacao === 'EM_GOZO').length },
    alertas: [...p.alertas, ...alertasFerias].sort((a, b) => (a.data < b.data ? -1 : 1)),
  });
});

// Áreas (RF31)
r.get('/areas', async (_req, res) => {
  res.json(await query('SELECT a.*, (SELECT count(*)::int FROM colaboradores c WHERE c.area_id=a.id) AS colaboradores FROM areas a ORDER BY nome'));
});
r.post('/areas', exigir('colaborador:escrever'), async (req, res) => {
  const { nome } = validar(z.object({ nome: z.string().trim().min(2).max(80) }), req.body);
  const a = await one('INSERT INTO areas (nome) VALUES ($1) RETURNING *', [nome]);
  await auditar(undefined, req.usuario, 'CRIAR', 'area', a.id, { nome });
  res.status(201).json(a);
});
r.put('/areas/:id', exigir('config:escrever'), async (req, res) => {
  const { nome } = validar(z.object({ nome: z.string().trim().min(2).max(80) }), req.body);
  const a = await one('UPDATE areas SET nome=$2 WHERE id=$1 RETURNING *', [idParam(req), nome]);
  if (!a) throw naoEncontrado('Área');
  await auditar(undefined, req.usuario, 'ALTERAR', 'area', a.id, { nome });
  res.json(a);
});

// Usuários e perfis (RF53, RNF04)
r.get('/usuarios', exigir('usuario:admin'), async (_req, res) => {
  res.json(await query('SELECT id, nome, email, perfil, ativo, criado_em FROM usuarios ORDER BY nome'));
});
const schemaUsuario = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  perfil: z.enum(['ADMIN', 'RH', 'DP', 'GESTOR', 'TI']),
  ativo: z.boolean().default(true),
  senha: z.string().min(8, 'Senha com ao menos 8 caracteres.').optional().or(z.literal('')),
});
r.post('/usuarios', exigir('usuario:admin'), async (req, res) => {
  const d = validar(schemaUsuario, req.body);
  if (!d.senha) throw new HttpError(400, 'Informe a senha inicial.');
  const u = await one('INSERT INTO usuarios (nome, email, perfil, ativo, senha_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id, nome, email, perfil, ativo',
    [d.nome, d.email, d.perfil, d.ativo, await bcrypt.hash(d.senha, 10)]);
  await auditar(undefined, req.usuario, 'CRIAR', 'usuario', u.id, { email: d.email, perfil: d.perfil });
  res.status(201).json(u);
});
r.put('/usuarios/:id', exigir('usuario:admin'), async (req, res) => {
  const id = idParam(req);
  const d = validar(schemaUsuario, req.body);
  if (id === req.usuario!.id && (!d.ativo || d.perfil !== 'ADMIN')) throw new HttpError(422, 'Você não pode remover seu próprio acesso de administrador.');
  const u = await one(
    `UPDATE usuarios SET nome=$2, email=$3, perfil=$4, ativo=$5, senha_hash=COALESCE($6, senha_hash) WHERE id=$1 RETURNING id, nome, email, perfil, ativo`,
    [id, d.nome, d.email, d.perfil, d.ativo, d.senha ? await bcrypt.hash(d.senha, 10) : null]);
  if (!u) throw naoEncontrado('Usuário');
  await auditar(undefined, req.usuario, 'ALTERAR', 'usuario', id, { perfil: d.perfil, ativo: d.ativo, senha_redefinida: !!d.senha });
  res.json(u);
});

// Auditoria (RF49, RF50)
r.get('/auditoria', exigir('auditoria:ler'), async (req, res) => {
  const params: unknown[] = [];
  const where: string[] = [];
  if (req.query.entidade) where.push(`entidade = $${params.push(String(req.query.entidade))}`);
  if (req.query.entidade_id) where.push(`entidade_id = $${params.push(Number(req.query.entidade_id))}`);
  if (req.query.usuario) where.push(`usuario_email ILIKE $${params.push(`%${String(req.query.usuario)}%`)}`);
  const lim = Math.min(Number(req.query.limite) || 200, 1000);
  res.json(await query(`SELECT * FROM auditoria ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY criado_em DESC, id DESC LIMIT ${lim}`, params));
});

// =====================================================================
// CONFIGURAÇÕES (RF16, RF28, RNF06)
// =====================================================================
r.get('/config/parametros', async (_req, res) => {
  res.json(await query('SELECT * FROM parametros ORDER BY chave'));
});
r.put('/config/parametros/:chave', exigir('config:escrever'), async (req, res) => {
  const { valor } = validar(z.object({ valor: z.string().max(5000) }), req.body);
  const atual = await one('SELECT * FROM parametros WHERE chave=$1', [req.params.chave]);
  if (!atual) throw naoEncontrado('Parâmetro');
  const numericos = ['alerta_dias', 'ferias_alerta_limite_dias', 'ferias_dias_limite_apos_aquisitivo'];
  if (numericos.includes(atual.chave) && !/^\d+$/.test(valor)) throw new HttpError(400, 'Informe um número inteiro.');
  if (atual.chave.startsWith('prazos_') || atual.chave.startsWith('ferias_bloquear')) {
    if (!['true', 'false'].includes(valor)) throw new HttpError(400, 'Use true ou false.');
  }
  await query('UPDATE parametros SET valor=$2 WHERE chave=$1', [atual.chave, valor]);
  await auditar(undefined, req.usuario, 'ALTERAR', 'parametro', null, { chave: atual.chave, de: atual.valor, para: valor });
  res.json({ ...atual, valor });
});

r.get('/config/modelo-itens', async (req, res) => {
  const tipo = String(req.query.tipo ?? 'ADMISSAO');
  const mod = Number(req.query.modalidade_id) || null;
  res.json(await query(
    `SELECT * FROM modelo_checklist_itens WHERE tipo=$1 AND ${mod ? 'modalidade_id=$2' : 'modalidade_id IS NULL'} ORDER BY ordem, id`,
    mod ? [tipo, mod] : [tipo]));
});
const schemaModeloItem = z.object({
  tipo: z.enum(['ADMISSAO', 'DESLIGAMENTO']),
  modalidade_id: idOpcional,
  categoria: z.string().trim().min(2).max(60),
  descricao: z.string().trim().min(2).max(200),
  orientacao: textoOpcional(1000),
  obrigatorio: z.boolean(),
  condicional: z.boolean(),
  prazo_dias: z.union([z.coerce.number().int().min(-365).max(365), z.null(), z.literal('')]).optional().transform((v) => (v === '' || v === undefined ? null : v)),
  vigencia_inicio: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).optional().transform((v) => v || null),
  vigencia_fim: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).optional().transform((v) => v || null),
  ordem: z.coerce.number().int().default(0),
  ativo: z.boolean().default(true),
});
r.post('/config/modelo-itens', exigir('config:escrever'), async (req, res) => {
  const d = validar(schemaModeloItem, req.body);
  const ordem = d.ordem || (await one(`SELECT COALESCE(max(ordem),0)+10 AS o FROM modelo_checklist_itens WHERE tipo=$1`, [d.tipo])).o;
  const it = await one(
    `INSERT INTO modelo_checklist_itens (tipo, modalidade_id, categoria, descricao, orientacao, obrigatorio, condicional, prazo_dias, vigencia_inicio, vigencia_fim, ordem, ativo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [d.tipo, d.modalidade_id, d.categoria, d.descricao, d.orientacao, d.obrigatorio, d.condicional, d.prazo_dias, d.vigencia_inicio, d.vigencia_fim, ordem, d.ativo]);
  await auditar(undefined, req.usuario, 'CRIAR', 'modelo_item', it.id, { descricao: d.descricao });
  res.status(201).json(it);
});
r.put('/config/modelo-itens/:id', exigir('config:escrever'), async (req, res) => {
  const d = validar(schemaModeloItem, req.body);
  const it = await one(
    `UPDATE modelo_checklist_itens SET categoria=$2, descricao=$3, orientacao=$4, obrigatorio=$5, condicional=$6, prazo_dias=$7,
       vigencia_inicio=$8, vigencia_fim=$9, ordem=$10, ativo=$11 WHERE id=$1 RETURNING *`,
    [idParam(req), d.categoria, d.descricao, d.orientacao, d.obrigatorio, d.condicional, d.prazo_dias, d.vigencia_inicio, d.vigencia_fim, d.ordem, d.ativo]);
  if (!it) throw naoEncontrado('Item do modelo');
  await auditar(undefined, req.usuario, 'ALTERAR', 'modelo_item', it.id, d);
  res.json(it);
});
r.delete('/config/modelo-itens/:id', exigir('config:escrever'), async (req, res) => {
  const it = await one('DELETE FROM modelo_checklist_itens WHERE id=$1 RETURNING descricao', [idParam(req)]);
  if (!it) throw naoEncontrado('Item do modelo');
  await auditar(undefined, req.usuario, 'EXCLUIR', 'modelo_item', idParam(req), it);
  res.status(204).end();
});

// Modalidades de rescisão (RNF06, RN31)
r.post('/config/modalidades', exigir('config:escrever'), async (req, res) => {
  const d = validar(z.object({ codigo: z.string().trim().toUpperCase().regex(/^[A-Z_]{3,40}$/, 'Use letras maiúsculas e _'), nome: z.string().trim().min(3).max(120), observacao: textoOpcional(500) }), req.body);
  const m = await one('INSERT INTO modalidades_rescisao (codigo, nome, observacao) VALUES ($1,$2,$3) RETURNING *', [d.codigo, d.nome, d.observacao]);
  await auditar(undefined, req.usuario, 'CRIAR', 'modalidade', m.id, d);
  res.status(201).json(m);
});
r.put('/config/modalidades/:id', exigir('config:escrever'), async (req, res) => {
  const d = validar(z.object({ nome: z.string().trim().min(3).max(120), observacao: textoOpcional(500), ativo: z.boolean() }), req.body);
  const m = await one('UPDATE modalidades_rescisao SET nome=$2, observacao=$3, ativo=$4 WHERE id=$1 RETURNING *', [idParam(req), d.nome, d.observacao, d.ativo]);
  if (!m) throw naoEncontrado('Modalidade');
  await auditar(undefined, req.usuario, 'ALTERAR', 'modalidade', m.id, d);
  res.json(m);
});

// Modelos de prazos (RF22, RF23, RF28)
r.get('/config/modelos-prazo', async (_req, res) => {
  const ms = await query('SELECT * FROM modelos_prazo ORDER BY padrao DESC, nome');
  const es = await query('SELECT * FROM modelo_prazo_etapas ORDER BY ordem, id');
  res.json(ms.map((m) => ({ ...m, etapas: es.filter((e) => e.modelo_id === m.id) })));
});
r.post('/config/modelos-prazo', exigir('config:escrever'), async (req, res) => {
  const { nome } = validar(z.object({ nome: z.string().trim().min(3).max(100) }), req.body);
  const m = await one('INSERT INTO modelos_prazo (nome) VALUES ($1) RETURNING *', [nome]);
  await auditar(undefined, req.usuario, 'CRIAR', 'modelo_prazo', m.id, { nome });
  res.status(201).json({ ...m, etapas: [] });
});
r.put('/config/modelos-prazo/:id', exigir('config:escrever'), async (req, res) => {
  const id = idParam(req);
  const d = validar(z.object({ nome: z.string().trim().min(3).max(100), padrao: z.boolean() }), req.body);
  const m = await tx(async (db) => {
    if (d.padrao) await query('UPDATE modelos_prazo SET padrao=false', [], db);
    return one('UPDATE modelos_prazo SET nome=$2, padrao=$3 WHERE id=$1 RETURNING *', [id, d.nome, d.padrao], db);
  });
  if (!m) throw naoEncontrado('Modelo');
  await auditar(undefined, req.usuario, 'ALTERAR', 'modelo_prazo', id, d);
  res.json(m);
});
// RF28: replicar estrutura de tarefas
r.post('/config/modelos-prazo/:id/duplicar', exigir('config:escrever'), async (req, res) => {
  const id = idParam(req);
  const { nome } = validar(z.object({ nome: z.string().trim().min(3).max(100) }), req.body);
  const m = await tx(async (db) => {
    const orig = await one('SELECT * FROM modelos_prazo WHERE id=$1', [id], db);
    if (!orig) throw naoEncontrado('Modelo');
    const novo = await one('INSERT INTO modelos_prazo (nome) VALUES ($1) RETURNING *', [nome], db);
    await query(`INSERT INTO modelo_prazo_etapas (modelo_id, ordem, etapa, dias, responsavel, responsavel_final)
                 SELECT $2, ordem, etapa, dias, responsavel, responsavel_final FROM modelo_prazo_etapas WHERE modelo_id=$1`, [id, novo.id], db);
    await auditar(db, req.usuario, 'DUPLICAR', 'modelo_prazo', novo.id, { origem: orig.nome });
    return novo;
  });
  res.status(201).json(m);
});
r.delete('/config/modelos-prazo/:id', exigir('config:escrever'), async (req, res) => {
  const id = idParam(req);
  const uso = await one('SELECT count(*)::int AS n FROM admissoes WHERE modelo_prazo_id=$1', [id]);
  if (uso!.n > 0) throw new HttpError(422, 'Modelo já utilizado em admissões; renomeie-o em vez de excluir.');
  await query('DELETE FROM modelos_prazo WHERE id=$1', [id]);
  await auditar(undefined, req.usuario, 'EXCLUIR', 'modelo_prazo', id);
  res.status(204).end();
});
const schemaEtapa = z.object({
  etapa: z.string().trim().min(2).max(160), dias: z.coerce.number().int().min(-365).max(365),
  responsavel: z.string().trim().min(2).max(100), responsavel_final: textoOpcional(100), ordem: z.coerce.number().int().default(0),
});
r.post('/config/modelos-prazo/:id/etapas', exigir('config:escrever'), async (req, res) => {
  const id = idParam(req);
  const d = validar(schemaEtapa, req.body);
  const ordem = d.ordem || (await one('SELECT COALESCE(max(ordem),0)+10 AS o FROM modelo_prazo_etapas WHERE modelo_id=$1', [id])).o;
  const e = await one('INSERT INTO modelo_prazo_etapas (modelo_id, ordem, etapa, dias, responsavel, responsavel_final) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [id, ordem, d.etapa, d.dias, d.responsavel, d.responsavel_final]);
  await auditar(undefined, req.usuario, 'CRIAR', 'etapa_prazo', e.id, d);
  res.status(201).json(e);
});
r.put('/config/etapas/:id', exigir('config:escrever'), async (req, res) => {
  const d = validar(schemaEtapa, req.body);
  const e = await one('UPDATE modelo_prazo_etapas SET etapa=$2, dias=$3, responsavel=$4, responsavel_final=$5, ordem=$6 WHERE id=$1 RETURNING *',
    [idParam(req), d.etapa, d.dias, d.responsavel, d.responsavel_final, d.ordem]);
  if (!e) throw naoEncontrado('Etapa');
  await auditar(undefined, req.usuario, 'ALTERAR', 'etapa_prazo', e.id, d);
  res.json(e);
});
r.delete('/config/etapas/:id', exigir('config:escrever'), async (req, res) => {
  await query('DELETE FROM modelo_prazo_etapas WHERE id=$1', [idParam(req)]);
  await auditar(undefined, req.usuario, 'EXCLUIR', 'etapa_prazo', idParam(req));
  res.status(204).end();
});

// RF45: orientações para o FGTS Digital (conteúdo da aba "Passo a passo - FGTS digital")
r.get('/fgts-digital', async (_req, res) => {
  res.json({
    fonte: 'Planilha "Checklist de admissão e desligamento" — aba "Passo a passo - FGTS digital" e "Documentos da rescisão e dicas".',
    aviso: 'Os passos podem mudar conforme o FGTS Digital é atualizado. Confira sempre o manual oficial no portal do FGTS Digital (gov.br).',
    guias: [
      { titulo: 'Guia mensal', quando: 'Pedido de demissão, término antecipado pelo colaborador e justa causa (o FGTS do mês é recolhido na guia mensal).',
        passos: ['Acessar o FGTS Digital com o certificado/gov.br da empresa.', 'Abrir o menu de gestão de guias e escolher a emissão de guia mensal.', 'Conferir as competências e os valores trazidos do eSocial.', 'Emitir a guia (pagamento via PIX) e anexar o comprovante ao processo.'] },
      { titulo: 'Multa rescisória (40% ou 20%)', quando: 'Dispensa sem justa causa, término antecipado pelo empregador (40%) e acordo (20%).',
        passos: ['Confirmar que o evento de desligamento foi enviado ao eSocial.', 'No FGTS Digital, acessar a emissão de guia rescisória para o trabalhador.', 'Verificar o cálculo da multa e emitir a guia.', 'Emitir o demonstrativo da multa e anexá-lo ao checklist.'] },
      { titulo: 'Guia rescisória — término de contrato', quando: 'Término do contrato por prazo determinado.',
        passos: ['Enviar a rescisão ao eSocial.', 'No FGTS Digital, emitir a guia rescisória das verbas.', 'Emitir o demonstrativo da guia rescisória.'] },
      { titulo: 'Recálculo de guia mensal ou multa', quando: 'Quando houver alteração de valores após a emissão.',
        passos: ['Retificar a informação no eSocial, se necessário.', 'Acessar a guia no FGTS Digital e solicitar o recálculo.', 'Emitir a nova guia e registrar a observação no item do checklist.'] },
    ],
    dicas: [
      'Solicite o extrato do FGTS para fins rescisórios cerca de 15 dias antes do fim do aviso prévio, para corrigir competências faltantes a tempo.',
      'Confirme o real motivo do desligamento antes do fim do aviso prévio — a modalidade pode mudar (RN32).',
      'Consulte a convenção coletiva: algumas preveem estabilidade (pré-aposentadoria, retorno de férias) (RN35).',
      'Oriente a pessoa a solicitar o seguro-desemprego pela CTPS Digital e o saque do FGTS pelo aplicativo do FGTS.',
    ],
  });
});

// RNF17: cópia de segurança lógica (JSON) — complementa o backup automático do provedor do banco
r.get('/admin/backup', exigir('usuario:admin'), async (req, res) => {
  const tabelas = ['areas', 'colaboradores', 'admissoes', 'desligamentos', 'checklist_itens', 'tarefas', 'equipamentos',
    'periodos_aquisitivos', 'ferias', 'modalidades_rescisao', 'modelo_checklist_itens', 'modelos_prazo', 'modelo_prazo_etapas', 'parametros', 'auditoria'];
  const out: Record<string, unknown> = { gerado_em: new Date().toISOString(), versao: 1 };
  for (const t of tabelas) out[t] = await query(`SELECT * FROM ${t} ORDER BY 1`);
  out.usuarios = await query('SELECT id, nome, email, perfil, ativo, criado_em FROM usuarios ORDER BY id');
  out.documentos = await query('SELECT id, colaborador_id, checklist_item_id, nome_arquivo, mime, tamanho, criado_em FROM documentos ORDER BY id');
  await auditar(undefined, req.usuario, 'BACKUP', 'sistema', null);
  res.setHeader('Content-Disposition', `attachment; filename="backup-ciclo-vida-${hoje()}.json"`);
  res.json(out);
});
