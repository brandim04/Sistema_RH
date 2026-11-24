import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db';
import { validarStatusItem } from '../domain/checklist';
import { formatarCpf } from '../domain/cpf';
import { hoje } from '../domain/datas';
import { calcularDataLimite } from '../domain/prazos';
import { auditar, decifrar, exigir, HttpError, idParam, naoEncontrado, parametros, pode, validar } from '../infra';
import {
  enriquecerItem, enriquecerTarefa, gerarItens, gerarTarefas, pendenciasAdmissao, pendenciasDesligamento, recalcularPrazos,
} from '../servicos';
import { dataISO, dataOpcional, idOpcional, textoOpcional } from './comum';

export const r = Router();

// =====================================================================
// ADMISSÃO (RF11-RF21)
// =====================================================================
r.get('/admissoes', exigir('processo:ler'), async (req, res) => {
  const status = String(req.query.status ?? '');
  const rows = await query(
    `SELECT a.*, c.nome AS colaborador, c.matricula,
            count(i.*)::int AS total, count(i.*) FILTER (WHERE i.status<>'NAO_FEITO')::int AS resolvidos
       FROM admissoes a JOIN colaboradores c ON c.id=a.colaborador_id LEFT JOIN checklist_itens i ON i.admissao_id=a.id
      ${status ? 'WHERE a.status=$1' : ''} GROUP BY a.id, c.id ORDER BY a.data_referencia DESC`,
    status ? [status] : [],
  );
  res.json(rows.map((x: any) => ({ ...x, percentual: x.total ? Math.round((x.resolvidos / x.total) * 100) : 0 })));
});

r.post('/admissoes', exigir('processo:escrever'), async (req, res) => {
  const d = validar(z.object({
    colaborador_id: z.coerce.number().int().positive(),
    data_referencia: dataISO,
    cargo: textoOpcional(100),
    observacoes: textoOpcional(2000),
    modelo_prazo_id: idOpcional,
  }), req.body);
  const p = await parametros();
  const ad = await tx(async (db) => {
    const c = await one('SELECT * FROM colaboradores WHERE id=$1 FOR UPDATE', [d.colaborador_id], db);
    if (!c) throw new HttpError(422, 'A admissão deve estar associada a uma pessoa colaboradora cadastrada.');
    if (c.status === 'DESLIGADO') throw new HttpError(422, 'Pessoa desligada: atualize o cadastro antes de readmitir.');
    const modelo = d.modelo_prazo_id
      ?? (await one('SELECT id FROM modelos_prazo ORDER BY padrao DESC, id LIMIT 1', [], db))?.id ?? null;
    const novo = await one(
      `INSERT INTO admissoes (colaborador_id, data_referencia, cargo, observacoes, modelo_prazo_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [c.id, d.data_referencia, d.cargo ?? c.cargo, d.observacoes, modelo], db,
    );
    await gerarItens(db, { admissao_id: novo.id }, 'ADMISSAO', null, d.data_referencia, p.anteciparFimDeSemana);
    if (modelo) await gerarTarefas(db, novo.id, modelo, d.data_referencia, p.anteciparFimDeSemana);
    if (c.status === 'ATIVO' && c.data_admissao > hoje()) {
      await query("UPDATE colaboradores SET status='EM_ADMISSAO' WHERE id=$1", [c.id], db);
    }
    await auditar(db, req.usuario, 'CRIAR', 'admissao', novo.id, { colaborador: c.nome, data_referencia: d.data_referencia });
    return novo;
  });
  res.status(201).json(ad);
});

r.get('/admissoes/:id', exigir('processo:ler'), async (req, res) => {
  const id = idParam(req);
  const ad = await one(
    `SELECT a.*, c.nome AS colaborador, c.matricula, c.status AS colaborador_status, mp.nome AS modelo_prazo
       FROM admissoes a JOIN colaboradores c ON c.id=a.colaborador_id LEFT JOIN modelos_prazo mp ON mp.id=a.modelo_prazo_id
      WHERE a.id=$1`, [id]);
  if (!ad) throw naoEncontrado('Admissão');
  const p = await parametros();
  const h = hoje();
  const [itens, tarefas, equipamentos, documentos, pend] = await Promise.all([
    query('SELECT * FROM checklist_itens WHERE admissao_id=$1 ORDER BY ordem, id', [id]),
    query('SELECT * FROM tarefas WHERE admissao_id=$1 ORDER BY ordem, id', [id]),
    query('SELECT * FROM equipamentos WHERE colaborador_id=$1 ORDER BY id', [ad.colaborador_id]),
    query('SELECT id, checklist_item_id, nome_arquivo, mime, tamanho, criado_em FROM documentos WHERE colaborador_id=$1 ORDER BY id DESC', [ad.colaborador_id]),
    pendenciasAdmissao(undefined, id),
  ]);
  res.json({
    ...ad,
    itens: itens.map((i) => enriquecerItem(i, h, p.alertaDias)),
    tarefas: tarefas.map((t) => enriquecerTarefa(t, h, p.alertaDias)),
    equipamentos, documentos,
    progresso: pend.progresso, pendencias: pend.lista,
  });
});

r.put('/admissoes/:id', exigir('processo:escrever'), async (req, res) => {
  const id = idParam(req);
  const d = validar(z.object({
    data_referencia: dataISO.optional(),
    cargo: z.string().trim().min(2).max(100).optional(),
    observacoes: textoOpcional(2000),
    termo_equipamentos_assinado: z.boolean().optional(),
    termo_equipamentos_data: dataOpcional,
  }), req.body);
  const p = await parametros();
  const out = await tx(async (db) => {
    const atual = await one('SELECT * FROM admissoes WHERE id=$1 FOR UPDATE', [id], db);
    if (!atual) throw naoEncontrado('Admissão');
    if (atual.status !== 'ABERTA') throw new HttpError(422, 'Processo encerrado não pode ser alterado.');
    const assinado = d.termo_equipamentos_assinado ?? atual.termo_equipamentos_assinado;
    const novo = await one(
      `UPDATE admissoes SET data_referencia=$2, cargo=$3, observacoes=$4, termo_equipamentos_assinado=$5, termo_equipamentos_data=$6
        WHERE id=$1 RETURNING *`,
      [id, d.data_referencia ?? atual.data_referencia, d.cargo ?? atual.cargo,
        d.observacoes !== undefined ? d.observacoes : atual.observacoes, assinado,
        assinado ? (d.termo_equipamentos_data ?? atual.termo_equipamentos_data ?? hoje()) : null], db,
    );
    if (d.data_referencia && d.data_referencia !== atual.data_referencia) {
      await recalcularPrazos(db, { admissao_id: id }, d.data_referencia, p.anteciparFimDeSemana); // RN21
    }
    await auditar(db, req.usuario, 'ALTERAR', 'admissao', id, d);
    return novo;
  });
  res.json(out);
});

r.post('/admissoes/:id/concluir', exigir('processo:escrever'), async (req, res) => {
  const id = idParam(req);
  const out = await tx(async (db) => {
    const ad = await one('SELECT * FROM admissoes WHERE id=$1 FOR UPDATE', [id], db);
    if (!ad) throw naoEncontrado('Admissão');
    if (ad.status !== 'ABERTA') throw new HttpError(422, 'Processo já encerrado.');
    const pend = await pendenciasAdmissao(db, id);
    if (pend.lista.length) throw new HttpError(422, 'Existem pendências obrigatórias na admissão.', pend.lista);
    await query("UPDATE admissoes SET status='CONCLUIDA', concluido_em=now() WHERE id=$1", [id], db);
    await query(
      "UPDATE colaboradores SET status='ATIVO', data_admissao=$2, cargo=$3, atualizado_em=now() WHERE id=$1 AND status IN ('EM_ADMISSAO','ATIVO')",
      [ad.colaborador_id, ad.data_referencia, ad.cargo], db,
    );
    await auditar(db, req.usuario, 'CONCLUIR', 'admissao', id);
    return { ok: true };
  });
  res.json(out);
});

r.post('/admissoes/:id/cancelar', exigir('processo:escrever'), async (req, res) => {
  const id = idParam(req);
  const { motivo } = validar(z.object({ motivo: z.string().trim().min(3, 'Informe o motivo.') }), req.body);
  await tx(async (db) => {
    const ad = await one('SELECT * FROM admissoes WHERE id=$1 FOR UPDATE', [id], db);
    if (!ad) throw naoEncontrado('Admissão');
    if (ad.status !== 'ABERTA') throw new HttpError(422, 'Processo já encerrado.');
    await query("UPDATE admissoes SET status='CANCELADA', concluido_em=now() WHERE id=$1", [id], db);
    await query("UPDATE colaboradores SET status='INATIVO' WHERE id=$1 AND status='EM_ADMISSAO'", [ad.colaborador_id], db);
    await auditar(db, req.usuario, 'CANCELAR', 'admissao', id, { motivo });
  });
  res.json({ ok: true });
});

// RF17: dados para o termo de consentimento LGPD
r.get('/admissoes/:id/lgpd', exigir('processo:ler', 'colaborador:sensivel'), async (req, res) => {
  const ad = await one('SELECT a.*, c.nome, c.cpf_enc FROM admissoes a JOIN colaboradores c ON c.id=a.colaborador_id WHERE a.id=$1', [idParam(req)]);
  if (!ad) throw naoEncontrado('Admissão');
  const p = await parametros();
  const texto = (p.raw.termo_lgpd ?? '')
    .replaceAll('{nome}', ad.nome)
    .replaceAll('{cpf}', formatarCpf(decifrar(ad.cpf_enc)))
    .replaceAll('{empresa}', p.raw.empresa_nome ?? '')
    .replaceAll('{encarregado}', p.raw.encarregado_email ?? '');
  await auditar(undefined, req.usuario, 'GERAR_TERMO_LGPD', 'admissao', ad.id);
  res.json({ titulo: 'Autorização para uso dos meus dados pessoais', texto, empresa: p.raw.empresa_nome, nome: ad.nome, data: hoje() });
});

// =====================================================================
// ITENS DE CHECKLIST (RF13, RF14, RF16 manual, RF43)
// =====================================================================
async function processoDoItem(db: any, itemId: number) {
  const i = await one(
    `SELECT i.*, COALESCE(a.status, d.status) AS processo_status FROM checklist_itens i
       LEFT JOIN admissoes a ON a.id=i.admissao_id LEFT JOIN desligamentos d ON d.id=i.desligamento_id WHERE i.id=$1 FOR UPDATE OF i`,
    [itemId], db,
  );
  if (!i) throw naoEncontrado('Item');
  if (!['ABERTA', 'ABERTO'].includes(i.processo_status)) throw new HttpError(422, 'Processo encerrado não pode ser alterado.');
  return i;
}

r.patch('/itens/:id', exigir('checklist:marcar'), async (req, res) => {
  const id = idParam(req);
  const d = validar(z.object({
    status: z.enum(['FEITO', 'NAO_FEITO', 'NA']).optional(),
    observacao: textoOpcional(1000),
    valor: z.union([z.coerce.number(), z.null(), z.literal('')]).optional().transform((v) => (v === '' ? null : v)),
  }), req.body);
  const out = await tx(async (db) => {
    const i = await processoDoItem(db, id);
    if (d.status) validarStatusItem(i, d.status);
    const novo = await one(
      `UPDATE checklist_itens SET status=$2, observacao=$3, valor=$4, atualizado_por=$5, atualizado_em=now() WHERE id=$1 RETURNING *`,
      [id, d.status ?? i.status, d.observacao !== undefined ? d.observacao : i.observacao,
        d.valor !== undefined ? d.valor : i.valor, req.usuario!.id], db,
    );
    await auditar(db, req.usuario, 'ALTERAR', 'item', id, { descricao: i.descricao, de: i.status, para: novo.status, observacao: d.observacao, valor: d.valor });
    return novo;
  });
  res.json(out);
});

const schemaItemManual = z.object({
  categoria: z.string().trim().min(2).max(60),
  descricao: z.string().trim().min(2).max(200),
  orientacao: textoOpcional(1000),
  obrigatorio: z.boolean().default(false),
  condicional: z.boolean().default(true),
  data_limite: dataOpcional,
});

const adicionarItem = (adm: boolean) => async (req: Request, res: Response) => {
  const id = idParam(req);
  const d = validar(schemaItemManual, req.body);
  const out = await tx(async (db) => {
    const proc = await one(`SELECT status FROM ${adm ? 'admissoes' : 'desligamentos'} WHERE id=$1`, [id], db);
    if (!proc) throw naoEncontrado('Processo');
    if (!['ABERTA', 'ABERTO'].includes(proc.status)) throw new HttpError(422, 'Processo encerrado não pode ser alterado.');
    const novo = await one(
      `INSERT INTO checklist_itens (admissao_id, desligamento_id, origem, categoria, descricao, orientacao, obrigatorio, condicional, data_limite, ordem)
       VALUES ($1,$2,'MANUAL',$3,$4,$5,$6,$7,$8,9000) RETURNING *`,
      [adm ? id : null, adm ? null : id, d.categoria, d.descricao, d.orientacao, d.obrigatorio, d.condicional, d.data_limite], db,
    );
    await auditar(db, req.usuario, 'CRIAR', 'item', novo.id, { descricao: d.descricao });
    return novo;
  });
  res.status(201).json(out);
};
r.post('/admissoes/:id/itens', exigir('processo:escrever'), adicionarItem(true));
r.post('/desligamentos/:id/itens', exigir('processo:escrever'), adicionarItem(false));

r.delete('/itens/:id', exigir('processo:escrever'), async (req, res) => {
  const id = idParam(req);
  await tx(async (db) => {
    const i = await processoDoItem(db, id);
    if (i.origem !== 'MANUAL') throw new HttpError(422, 'Somente itens adicionados manualmente podem ser removidos. Use "Não se aplica" nos itens do modelo.');
    await query('DELETE FROM checklist_itens WHERE id=$1', [id], db);
    await auditar(db, req.usuario, 'EXCLUIR', 'item', id, { descricao: i.descricao });
  });
  res.status(204).end();
});

// =====================================================================
// PRAZOS E TAREFAS (RF22-RF29)
// =====================================================================
r.get('/tarefas', exigir('processo:ler'), async (req, res) => {
  const p = await parametros();
  const h = hoje();
  const resp = String(req.query.responsavel ?? '').trim();
  const params: unknown[] = [];
  let filtro = "a.status='ABERTA'";
  if (resp) { params.push(`%${resp.toLowerCase()}%`); filtro += ` AND (lower(t.responsavel) LIKE $1 OR lower(COALESCE(t.responsavel_final,'')) LIKE $1)`; }
  const rows = await query(
    `SELECT t.*, c.nome AS colaborador, a.data_referencia FROM tarefas t
       JOIN admissoes a ON a.id=t.admissao_id JOIN colaboradores c ON c.id=a.colaborador_id
      WHERE ${filtro} ORDER BY t.data_limite, t.ordem`, params,
  );
  let lista = rows.map((t) => enriquecerTarefa(t, h, p.alertaDias));
  const sit = String(req.query.situacao ?? '');
  if (sit) lista = lista.filter((t) => t.situacao === sit);
  res.json(lista);
});

r.patch('/tarefas/:id', exigir('processo:escrever'), async (req, res) => {
  const id = idParam(req);
  const d = validar(z.object({ concluida: z.boolean().optional(), observacao: textoOpcional(1000), responsavel: z.string().trim().min(2).max(100).optional() }), req.body);
  const out = await tx(async (db) => {
    const t = await one("SELECT t.*, a.status AS st FROM tarefas t JOIN admissoes a ON a.id=t.admissao_id WHERE t.id=$1 FOR UPDATE OF t", [id], db);
    if (!t) throw naoEncontrado('Tarefa');
    if (t.st !== 'ABERTA') throw new HttpError(422, 'Processo encerrado não pode ser alterado.');
    const concl = d.concluida ?? t.concluida;
    const novo = await one(
      'UPDATE tarefas SET concluida=$2, concluida_em=$3, observacao=$4, responsavel=$5 WHERE id=$1 RETURNING *',
      [id, concl, concl ? (t.concluida_em ?? new Date()) : null, d.observacao !== undefined ? d.observacao : t.observacao, d.responsavel ?? t.responsavel], db,
    );
    await auditar(db, req.usuario, 'ALTERAR', 'tarefa', id, { etapa: t.etapa, ...d });
    return novo;
  });
  res.json(out);
});

r.post('/admissoes/:id/tarefas', exigir('processo:escrever'), async (req, res) => {
  const id = idParam(req);
  const d = validar(z.object({
    etapa: z.string().trim().min(2).max(160), dias: z.coerce.number().int().min(-365).max(365),
    responsavel: z.string().trim().min(2).max(100), responsavel_final: textoOpcional(100),
  }), req.body);
  const p = await parametros();
  const out = await tx(async (db) => {
    const ad = await one('SELECT * FROM admissoes WHERE id=$1', [id], db);
    if (!ad) throw naoEncontrado('Admissão');
    const ordem = (await one('SELECT COALESCE(max(ordem),0)+10 AS o FROM tarefas WHERE admissao_id=$1', [id], db)).o;
    const t = await one(
      'INSERT INTO tarefas (admissao_id, ordem, etapa, dias, data_limite, responsavel, responsavel_final) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [id, ordem, d.etapa, d.dias, calcularDataLimite(ad.data_referencia, d.dias, p.anteciparFimDeSemana), d.responsavel, d.responsavel_final], db,
    );
    await auditar(db, req.usuario, 'CRIAR', 'tarefa', t.id, d);
    return t;
  });
  res.status(201).json(out);
});

r.delete('/tarefas/:id', exigir('processo:escrever'), async (req, res) => {
  const id = idParam(req);
  await tx(async (db) => {
    const t = await one('SELECT * FROM tarefas WHERE id=$1', [id], db);
    if (!t) throw naoEncontrado('Tarefa');
    await query('DELETE FROM tarefas WHERE id=$1', [id], db);
    await auditar(db, req.usuario, 'EXCLUIR', 'tarefa', id, { etapa: t.etapa });
  });
  res.status(204).end();
});

// =====================================================================
// EQUIPAMENTOS (RF19, RF20, RF44)
// =====================================================================
r.post('/equipamentos', exigir('equipamento:escrever'), async (req, res) => {
  const d = validar(z.object({
    colaborador_id: z.coerce.number().int().positive(), admissao_id: idOpcional,
    descricao: z.string().trim().min(2).max(120), patrimonio: textoOpcional(60), data_entrega: dataISO, observacao: textoOpcional(500),
  }), req.body);
  const out = await tx(async (db) => {
    const e = await one(
      'INSERT INTO equipamentos (colaborador_id, admissao_id, descricao, patrimonio, data_entrega, observacao) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [d.colaborador_id, d.admissao_id, d.descricao, d.patrimonio, d.data_entrega, d.observacao], db,
    );
    if (d.admissao_id) await query('UPDATE admissoes SET termo_equipamentos_assinado=false, termo_equipamentos_data=null WHERE id=$1', [d.admissao_id], db);
    await auditar(db, req.usuario, 'CRIAR', 'equipamento', e.id, { descricao: d.descricao, patrimonio: d.patrimonio });
    return e;
  });
  res.status(201).json(out);
});

r.patch('/equipamentos/:id', exigir('equipamento:escrever'), async (req, res) => {
  const id = idParam(req);
  const d = validar(z.object({ status: z.enum(['ENTREGUE', 'DEVOLVIDO', 'EXTRAVIADO']), data_devolucao: dataOpcional, observacao: textoOpcional(500) }), req.body);
  const out = await tx(async (db) => {
    const e = await one('SELECT * FROM equipamentos WHERE id=$1 FOR UPDATE', [id], db);
    if (!e) throw naoEncontrado('Equipamento');
    if (d.status === 'EXTRAVIADO' && !d.observacao) throw new HttpError(400, 'Descreva a ocorrência do equipamento extraviado.');
    const novo = await one('UPDATE equipamentos SET status=$2, data_devolucao=$3, observacao=COALESCE($4, observacao) WHERE id=$1 RETURNING *',
      [id, d.status, d.status === 'ENTREGUE' ? null : (d.data_devolucao ?? hoje()), d.observacao], db);
    await auditar(db, req.usuario, 'ALTERAR', 'equipamento', id, { descricao: e.descricao, de: e.status, para: d.status });
    return novo;
  });
  res.json(out);
});

r.delete('/equipamentos/:id', exigir('equipamento:escrever'), async (req, res) => {
  const id = idParam(req);
  await tx(async (db) => {
    const e = await one('SELECT * FROM equipamentos WHERE id=$1', [id], db);
    if (!e) throw naoEncontrado('Equipamento');
    await query('DELETE FROM equipamentos WHERE id=$1', [id], db);
    await auditar(db, req.usuario, 'EXCLUIR', 'equipamento', id, { descricao: e.descricao });
  });
  res.status(204).end();
});

// =====================================================================
// DOCUMENTOS ANEXADOS (RF18, RI08)
// =====================================================================
const MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
r.post('/documentos', exigir('processo:escrever'), async (req, res) => {
  const d = validar(z.object({
    colaborador_id: z.coerce.number().int().positive(), checklist_item_id: idOpcional,
    nome_arquivo: z.string().trim().min(1).max(200), mime: z.string().refine((m) => MIMES.includes(m), 'Envie PDF, PNG, JPG ou WEBP.'),
    conteudo_base64: z.string().min(4),
  }), req.body);
  const buf = Buffer.from(d.conteudo_base64, 'base64');
  if (buf.length > 2 * 1024 * 1024) throw new HttpError(413, 'Arquivo acima de 2 MB.');
  const out = await tx(async (db) => {
    const doc = await one(
      `INSERT INTO documentos (colaborador_id, checklist_item_id, nome_arquivo, mime, tamanho, conteudo, enviado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, colaborador_id, checklist_item_id, nome_arquivo, mime, tamanho, criado_em`,
      [d.colaborador_id, d.checklist_item_id, d.nome_arquivo, d.mime, buf.length, buf, req.usuario!.id], db,
    );
    await auditar(db, req.usuario, 'ANEXAR', 'documento', doc.id, { arquivo: d.nome_arquivo, item: d.checklist_item_id });
    return doc;
  });
  res.status(201).json(out);
});

r.get('/colaboradores/:id/documentos', exigir('processo:ler'), async (req, res) => {
  res.json(await query('SELECT id, checklist_item_id, nome_arquivo, mime, tamanho, criado_em FROM documentos WHERE colaborador_id=$1 ORDER BY id DESC', [idParam(req)]));
});

r.get('/documentos/:id/download', exigir('processo:ler'), async (req, res) => {
  if (!pode(req.usuario, 'colaborador:sensivel')) throw new HttpError(403, 'Seu perfil não pode abrir documentos pessoais.');
  const doc = await one('SELECT * FROM documentos WHERE id=$1', [idParam(req)]);
  if (!doc) throw naoEncontrado('Documento');
  res.setHeader('Content-Type', doc.mime);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.nome_arquivo)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(doc.conteudo);
});

r.delete('/documentos/:id', exigir('processo:escrever'), async (req, res) => {
  const id = idParam(req);
  await tx(async (db) => {
    const doc = await one('SELECT nome_arquivo FROM documentos WHERE id=$1', [id], db);
    if (!doc) throw naoEncontrado('Documento');
    await query('DELETE FROM documentos WHERE id=$1', [id], db);
    await auditar(db, req.usuario, 'EXCLUIR', 'documento', id, { arquivo: doc.nome_arquivo });
  });
  res.status(204).end();
});

r.get('/colaboradores/:id/equipamentos', exigir('processo:ler'), async (req, res) => {
  res.json(await query('SELECT * FROM equipamentos WHERE colaborador_id=$1 ORDER BY id', [idParam(req)]));
});

// =====================================================================
// DESLIGAMENTO (RF40-RF47)
// =====================================================================
r.get('/modalidades', exigir('processo:ler'), async (_req, res) => {
  const mods = await query('SELECT * FROM modalidades_rescisao WHERE ativo ORDER BY id');
  const itens = await query('SELECT modalidade_id, descricao, orientacao FROM modelo_checklist_itens WHERE modalidade_id IS NOT NULL AND ativo ORDER BY ordem');
  res.json(mods.map((m) => ({ ...m, documentos: itens.filter((i) => i.modalidade_id === m.id) })));
});

r.get('/desligamentos', exigir('processo:ler'), async (req, res) => {
  const status = String(req.query.status ?? '');
  const rows = await query(
    `SELECT d.*, c.nome AS colaborador, c.matricula, m.nome AS modalidade,
            count(i.*)::int AS total, count(i.*) FILTER (WHERE i.status<>'NAO_FEITO')::int AS resolvidos
       FROM desligamentos d JOIN colaboradores c ON c.id=d.colaborador_id
       LEFT JOIN modalidades_rescisao m ON m.id=d.modalidade_id LEFT JOIN checklist_itens i ON i.desligamento_id=d.id
      ${status ? 'WHERE d.status=$1' : ''} GROUP BY d.id, c.id, m.nome ORDER BY d.data_desligamento DESC`,
    status ? [status] : [],
  );
  res.json(rows.map((x: any) => ({ ...x, percentual: x.total ? Math.round((x.resolvidos / x.total) * 100) : 0 })));
});

r.post('/desligamentos', exigir('processo:escrever'), async (req, res) => {
  const d = validar(z.object({
    colaborador_id: z.coerce.number().int().positive(),
    data_desligamento: dataISO,
    cargo: textoOpcional(100),
    observacoes: textoOpcional(2000),
    modalidade_id: idOpcional,
  }), req.body);
  const p = await parametros();
  const out = await tx(async (db) => {
    const c = await one('SELECT * FROM colaboradores WHERE id=$1 FOR UPDATE', [d.colaborador_id], db);
    if (!c) throw new HttpError(422, 'O desligamento deve estar associado a uma pessoa colaboradora existente.');
    if (c.status === 'DESLIGADO') throw new HttpError(422, 'Esta pessoa já está desligada.');
    if (d.data_desligamento < c.data_admissao) throw new HttpError(422, 'A data de desligamento não pode ser anterior à admissão.');
    const novo = await one(
      'INSERT INTO desligamentos (colaborador_id, data_desligamento, cargo, observacoes, modalidade_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [c.id, d.data_desligamento, d.cargo ?? c.cargo, d.observacoes, d.modalidade_id], db,
    );
    await gerarItens(db, { desligamento_id: novo.id }, 'DESLIGAMENTO', null, d.data_desligamento, p.anteciparFimDeSemana);
    if (d.modalidade_id) await gerarItens(db, { desligamento_id: novo.id }, 'DESLIGAMENTO', d.modalidade_id, d.data_desligamento, p.anteciparFimDeSemana);
    await auditar(db, req.usuario, 'CRIAR', 'desligamento', novo.id, { colaborador: c.nome, data: d.data_desligamento });
    return novo;
  });
  res.status(201).json(out);
});

r.get('/desligamentos/:id', exigir('processo:ler'), async (req, res) => {
  const id = idParam(req);
  const d = await one(
    `SELECT d.*, c.nome AS colaborador, c.matricula, c.status AS colaborador_status, c.data_admissao, m.nome AS modalidade, m.observacao AS modalidade_observacao
       FROM desligamentos d JOIN colaboradores c ON c.id=d.colaborador_id LEFT JOIN modalidades_rescisao m ON m.id=d.modalidade_id WHERE d.id=$1`, [id]);
  if (!d) throw naoEncontrado('Desligamento');
  const p = await parametros();
  const h = hoje();
  const [itens, equipamentos, documentos, pend] = await Promise.all([
    query('SELECT * FROM checklist_itens WHERE desligamento_id=$1 ORDER BY ordem, id', [id]),
    query('SELECT * FROM equipamentos WHERE colaborador_id=$1 ORDER BY id', [d.colaborador_id]),
    query('SELECT id, checklist_item_id, nome_arquivo, mime, tamanho, criado_em FROM documentos WHERE colaborador_id=$1 ORDER BY id DESC', [d.colaborador_id]),
    pendenciasDesligamento(undefined, id),
  ]);
  const verbas = itens.filter((i) => i.categoria === 'Financeiro e legal' && i.valor !== null).reduce((s, i) => s + Number(i.valor), 0);
  res.json({ ...d, itens: itens.map((i) => enriquecerItem(i, h, p.alertaDias)), equipamentos, documentos, progresso: pend.progresso, pendencias: pend.lista, total_verbas: verbas });
});

r.put('/desligamentos/:id', exigir('processo:escrever'), async (req, res) => {
  const id = idParam(req);
  const d = validar(z.object({
    data_desligamento: dataISO.optional(),
    observacoes: textoOpcional(2000),
    modalidade_id: idOpcional,
    motivo_confirmado: z.boolean().optional(),
    aviso_previo: z.enum(['NAO_DEFINIDO', 'TRABALHADO', 'INDENIZADO', 'DISPENSADO', 'NAO_APLICA']).optional(),
    homologacao_sindicato: z.boolean().optional(),
    convencao_consultada: z.boolean().optional(),
    orientacoes_pos: textoOpcional(2000),
  }), req.body);
  const p = await parametros();
  const out = await tx(async (db) => {
    const at = await one('SELECT * FROM desligamentos WHERE id=$1 FOR UPDATE', [id], db);
    if (!at) throw naoEncontrado('Desligamento');
    if (at.status !== 'ABERTO') throw new HttpError(422, 'Processo encerrado não pode ser alterado.');
    const data = d.data_desligamento ?? at.data_desligamento;
    const modalidade = req.body.modalidade_id !== undefined ? d.modalidade_id : at.modalidade_id;
    const mudouModalidade = modalidade !== at.modalidade_id;
    const novo = await one(
      `UPDATE desligamentos SET data_desligamento=$2, observacoes=$3, modalidade_id=$4, motivo_confirmado=$5, aviso_previo=$6,
          homologacao_sindicato=$7, convencao_consultada=$8, orientacoes_pos=$9 WHERE id=$1 RETURNING *`,
      [id, data, d.observacoes !== undefined ? d.observacoes : at.observacoes, modalidade,
        // RN32: ao trocar a modalidade, o motivo precisa ser reconfirmado
        mudouModalidade ? (d.motivo_confirmado ?? false) : (d.motivo_confirmado ?? at.motivo_confirmado),
        d.aviso_previo ?? at.aviso_previo, d.homologacao_sindicato ?? at.homologacao_sindicato,
        d.convencao_consultada ?? at.convencao_consultada, d.orientacoes_pos !== undefined ? d.orientacoes_pos : at.orientacoes_pos], db,
    );
    if (mudouModalidade) {
      // RN31: a modalidade determina os documentos e etapas aplicáveis
      await query("DELETE FROM checklist_itens WHERE desligamento_id=$1 AND origem='MODALIDADE'", [id], db);
      if (modalidade) await gerarItens(db, { desligamento_id: id }, 'DESLIGAMENTO', modalidade, data, p.anteciparFimDeSemana);
    }
    if (data !== at.data_desligamento) await recalcularPrazos(db, { desligamento_id: id }, data, p.anteciparFimDeSemana);
    await auditar(db, req.usuario, 'ALTERAR', 'desligamento', id, d);
    return novo;
  });
  res.json(out);
});

r.post('/desligamentos/:id/concluir', exigir('processo:escrever'), async (req, res) => {
  const id = idParam(req);
  const out = await tx(async (db) => {
    const d = await one('SELECT * FROM desligamentos WHERE id=$1 FOR UPDATE', [id], db);
    if (!d) throw naoEncontrado('Desligamento');
    if (d.status !== 'ABERTO') throw new HttpError(422, 'Processo já encerrado.');
    const pend = await pendenciasDesligamento(db, id);
    if (pend.lista.length) throw new HttpError(422, 'O desligamento possui pendências obrigatórias.', pend.lista);
    await query("UPDATE desligamentos SET status='CONCLUIDO', concluido_em=now() WHERE id=$1", [id], db);
    // RF47 / RN38: atualiza o status do colaborador para desligado
    await query("UPDATE colaboradores SET status='DESLIGADO', data_demissao=$2, atualizado_em=now() WHERE id=$1", [d.colaborador_id, d.data_desligamento], db);
    // Férias programadas após o desligamento são canceladas, mantendo o histórico (RN39 de férias)
    const canceladas = await query(
      `UPDATE ferias SET status='CANCELADA', cancelado_em=now(), motivo_cancelamento='Cancelada automaticamente: desligamento concluído.'
        WHERE colaborador_id=$1 AND status='PROGRAMADA' AND inicio > $2 RETURNING id`, [d.colaborador_id, d.data_desligamento], db);
    await auditar(db, req.usuario, 'CONCLUIR', 'desligamento', id, { ferias_canceladas: canceladas.map((f) => f.id) });
    await auditar(db, req.usuario, 'DESLIGAR', 'colaborador', d.colaborador_id, { data_demissao: d.data_desligamento });
    return { ok: true };
  });
  res.json(out);
});

r.post('/desligamentos/:id/cancelar', exigir('processo:escrever'), async (req, res) => {
  const id = idParam(req);
  const { motivo } = validar(z.object({ motivo: z.string().trim().min(3, 'Informe o motivo.') }), req.body);
  await tx(async (db) => {
    const d = await one('SELECT status FROM desligamentos WHERE id=$1 FOR UPDATE', [id], db);
    if (!d) throw naoEncontrado('Desligamento');
    if (d.status !== 'ABERTO') throw new HttpError(422, 'Processo já encerrado.');
    await query("UPDATE desligamentos SET status='CANCELADO', concluido_em=now() WHERE id=$1", [id], db);
    await auditar(db, req.usuario, 'CANCELAR', 'desligamento', id, { motivo });
  });
  res.json({ ok: true });
});
