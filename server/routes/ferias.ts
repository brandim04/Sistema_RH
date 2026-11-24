import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db';
import { one, query, tx } from '../db';
import { diffDays, hoje } from '../domain/datas';
import { diasPorMes, gerarPeriodosAquisitivos, situacaoPeriodo, validarFerias } from '../domain/ferias';
import { auditar, exigir, HttpError, idParam, naoEncontrado, parametros, validar } from '../infra';
import { dataISO, textoOpcional } from './comum';

export const r = Router();

/** RF32: garante que todos os períodos aquisitivos até hoje existam no banco. */
export async function sincronizarPeriodos(db: Db | undefined, c: { id: number; data_admissao: string; data_demissao: string | null }) {
  const ate = c.data_demissao && c.data_demissao < hoje() ? c.data_demissao : hoje();
  const periodos = gerarPeriodosAquisitivos(c.data_admissao, ate);
  for (const p of periodos) {
    await query(
      `INSERT INTO periodos_aquisitivos (colaborador_id, numero, inicio, fim) VALUES ($1,$2,$3,$4)
       ON CONFLICT (colaborador_id, numero) DO UPDATE SET inicio=EXCLUDED.inicio, fim=EXCLUDED.fim`,
      [c.id, p.numero, p.inicio, p.fim], db,
    );
  }
  await query('DELETE FROM periodos_aquisitivos WHERE colaborador_id=$1 AND numero > $2 AND id NOT IN (SELECT periodo_aquisitivo_id FROM ferias)', [c.id, periodos.length], db);
  return query('SELECT * FROM periodos_aquisitivos WHERE colaborador_id=$1 ORDER BY numero', [c.id], db);
}

/** Resumo de férias de todos os colaboradores (equivale à aba "Controle de férias" da planilha). */
export async function resumoFerias(filtros: { area_id?: number; status?: string } = {}) {
  const p = await parametros();
  const h = hoje();
  const params: unknown[] = [];
  const where = [filtros.status ? `c.status = $${params.push(filtros.status)}` : `c.status IN ('ATIVO','INATIVO','EM_ADMISSAO')`];
  if (filtros.area_id) where.push(`c.area_id = $${params.push(filtros.area_id)}`);
  const colabs = await query(
    `SELECT c.id, c.nome, c.matricula, c.status, c.data_admissao, c.data_demissao, a.nome AS area
       FROM colaboradores c LEFT JOIN areas a ON a.id=c.area_id WHERE ${where.join(' AND ')} ORDER BY c.nome`, params);
  if (!colabs.length) return [];
  const ids = colabs.map((c) => c.id);
  const [pas, ferias] = await Promise.all([
    query('SELECT * FROM periodos_aquisitivos WHERE colaborador_id = ANY($1)', [ids]),
    query("SELECT f.*, pa.numero FROM ferias f JOIN periodos_aquisitivos pa ON pa.id=f.periodo_aquisitivo_id WHERE f.colaborador_id = ANY($1) AND f.status='PROGRAMADA'", [ids]),
  ]);
  return colabs.map((c) => {
    const periodos = gerarPeriodosAquisitivos(c.data_admissao, h).map((pr) => {
      const db = pas.find((x) => x.colaborador_id === c.id && x.numero === pr.numero);
      const fs = ferias.filter((f) => f.colaborador_id === c.id && f.numero === pr.numero);
      return { ...pr, faltas: db?.faltas ?? 0, ferias: fs, ...situacaoPeriodo({ ...pr, faltas: db?.faltas ?? 0 }, fs, h, p.feriasDiasLimite) };
    });
    // Período de referência: o mais antigo com saldo pendente; senão, o período em aquisição
    const ref = periodos.find((x) => ['VENCIDAS', 'DISPONIVEIS', 'PARCIAL'].includes(x.situacao))
      ?? periodos.find((x) => ['PROGRAMADAS', 'EM_GOZO'].includes(x.situacao) && x.ferias.some((f: any) => f.fim >= h))
      ?? periodos[periodos.length - 1];
    const proximas = ferias.filter((f) => f.colaborador_id === c.id && f.fim >= h).sort((a, b) => (a.inicio < b.inicio ? -1 : 1))[0];
    if (!ref) {
      // Admissão futura: o primeiro período aquisitivo ainda não começou
      return {
        colaborador_id: c.id, nome: c.nome, matricula: c.matricula, area: c.area, status: c.status,
        periodo_numero: 1, inicio_aquisitivo: c.data_admissao, fim_aquisitivo: null, dias_desde_aquisicao: null,
        limite_inicio: null, saldo: 0, situacao: 'EM_AQUISICAO' as const, rotulo: 'Férias não disponíveis',
        dias_para_limite: null, proximas_ferias: null, periodos_vencidos: 0,
      };
    }
    return {
      colaborador_id: c.id, nome: c.nome, matricula: c.matricula, area: c.area, status: c.status,
      periodo_numero: ref?.numero, inicio_aquisitivo: ref?.inicio, fim_aquisitivo: ref?.fim,
      dias_desde_aquisicao: ref?.diasDesdeAquisicao, limite_inicio: ref?.limite, saldo: ref?.saldo,
      situacao: ref?.situacao, rotulo: ref?.rotulo,
      dias_para_limite: ref ? diffDays(h, ref.limite) : null,
      proximas_ferias: proximas ? { inicio: proximas.inicio, fim: proximas.fim } : null,
      periodos_vencidos: periodos.filter((x) => x.situacao === 'VENCIDAS').length,
    };
  });
}

r.get('/colaboradores', exigir('ferias:ler'), async (req, res) => {
  const lista = await resumoFerias({ area_id: Number(req.query.area_id) || undefined, status: String(req.query.status ?? '') || undefined });
  const sit = String(req.query.situacao ?? '');
  res.json(sit ? lista.filter((x) => x.situacao === sit) : lista);
});

// Detalhe por colaborador: períodos aquisitivos + férias (inclui histórico de canceladas - RF39)
r.get('/colaboradores/:id', exigir('ferias:ler'), async (req, res) => {
  const c = await one('SELECT c.*, a.nome AS area FROM colaboradores c LEFT JOIN areas a ON a.id=c.area_id WHERE c.id=$1', [idParam(req)]);
  if (!c) throw naoEncontrado('Pessoa colaboradora');
  const p = await parametros();
  const h = hoje();
  const pas = await sincronizarPeriodos(undefined, c);
  const ferias = await query('SELECT f.*, u.nome AS criado_por_nome FROM ferias f LEFT JOIN usuarios u ON u.id=f.criado_por WHERE colaborador_id=$1 ORDER BY inicio DESC', [c.id]);
  res.json({
    colaborador: { id: c.id, nome: c.nome, matricula: c.matricula, area: c.area, status: c.status, data_admissao: c.data_admissao },
    periodos: pas.map((pa) => {
      const fs = ferias.filter((f) => f.periodo_aquisitivo_id === pa.id);
      return { ...pa, ...situacaoPeriodo(pa, fs, h, p.feriasDiasLimite), ferias: fs };
    }).reverse(),
  });
});

r.put('/periodos/:id', exigir('ferias:escrever'), async (req, res) => {
  const id = idParam(req);
  const { faltas } = validar(z.object({ faltas: z.coerce.number().int().min(0).max(366) }), req.body);
  const out = await tx(async (db) => {
    const pa = await one('SELECT * FROM periodos_aquisitivos WHERE id=$1 FOR UPDATE', [id], db);
    if (!pa) throw naoEncontrado('Período aquisitivo');
    const novo = await one('UPDATE periodos_aquisitivos SET faltas=$2 WHERE id=$1 RETURNING *', [id, faltas], db);
    await auditar(db, req.usuario, 'ALTERAR', 'periodo_aquisitivo', id, { faltas_de: pa.faltas, faltas_para: faltas });
    return novo;
  });
  res.json(out);
});

const schemaFerias = z.object({
  colaborador_id: z.coerce.number().int().positive(),
  periodo_aquisitivo_id: z.coerce.number().int().positive(),
  inicio: dataISO,
  fim: dataISO,
});

async function validarNoBanco(db: Db, d: z.infer<typeof schemaFerias>, ignorarId?: number) {
  const p = await parametros(db);
  const c = await one('SELECT * FROM colaboradores WHERE id=$1 FOR UPDATE', [d.colaborador_id], db);
  if (!c) throw naoEncontrado('Pessoa colaboradora');
  const pa = await one('SELECT * FROM periodos_aquisitivos WHERE id=$1 AND colaborador_id=$2', [d.periodo_aquisitivo_id, c.id], db);
  if (!pa) throw new HttpError(422, 'RN23: período aquisitivo não pertence a esta pessoa colaboradora.');
  const existentes = await query("SELECT * FROM ferias WHERE colaborador_id=$1 AND status='PROGRAMADA'", [c.id], db);
  const v = validarFerias({
    colaboradorStatus: c.status, periodo: pa, existentes, novo: d, hoje: hoje(),
    bloquearInicioAntesDsr: p.feriasBloquearDsr, diasAposAquisitivo: p.feriasDiasLimite, ignorarId,
  });
  return v;
}

// RF34: "validar" (simulação sem gravar)
r.post('/validar', exigir('ferias:ler'), async (req, res) => {
  const d = validar(schemaFerias.extend({ ignorar_id: z.coerce.number().int().optional() }), req.body);
  const v = await tx((db) => validarNoBanco(db, d, d.ignorar_id));
  res.json(v);
});

// RF34: registrar
r.post('/', exigir('ferias:escrever'), async (req, res) => {
  const d = validar(schemaFerias, req.body);
  const out = await tx(async (db) => {
    const v = await validarNoBanco(db, d);
    if (v.erros.length) throw new HttpError(422, 'Período de férias inválido.', v.erros);
    const f = await one(
      'INSERT INTO ferias (colaborador_id, periodo_aquisitivo_id, inicio, fim, dias, criado_por) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [d.colaborador_id, d.periodo_aquisitivo_id, d.inicio, d.fim, v.dias, req.usuario!.id], db,
    );
    await auditar(db, req.usuario, 'CRIAR', 'ferias', f.id, { inicio: d.inicio, fim: d.fim, dias: v.dias });
    return { ...f, avisos: v.avisos };
  });
  res.status(201).json(out);
});

// RF34: alterar
r.put('/:id', exigir('ferias:escrever'), async (req, res) => {
  const id = idParam(req);
  const d = validar(z.object({ inicio: dataISO, fim: dataISO }), req.body);
  const out = await tx(async (db) => {
    const f = await one('SELECT * FROM ferias WHERE id=$1 FOR UPDATE', [id], db);
    if (!f) throw naoEncontrado('Férias');
    if (f.status === 'CANCELADA') throw new HttpError(422, 'Férias canceladas não podem ser alteradas.');
    const v = await validarNoBanco(db, { colaborador_id: f.colaborador_id, periodo_aquisitivo_id: f.periodo_aquisitivo_id, ...d }, id);
    if (v.erros.length) throw new HttpError(422, 'Período de férias inválido.', v.erros);
    const novo = await one('UPDATE ferias SET inicio=$2, fim=$3, dias=$4 WHERE id=$1 RETURNING *', [id, d.inicio, d.fim, v.dias], db);
    await auditar(db, req.usuario, 'ALTERAR', 'ferias', id, { de: { inicio: f.inicio, fim: f.fim }, para: d });
    return { ...novo, avisos: v.avisos };
  });
  res.json(out);
});

// RF34 / RF39: cancelar mantendo histórico
r.post('/:id/cancelar', exigir('ferias:escrever'), async (req, res) => {
  const id = idParam(req);
  const { motivo } = validar(z.object({ motivo: z.string().trim().min(3, 'Informe o motivo do cancelamento.') }), req.body);
  const out = await tx(async (db) => {
    const f = await one('SELECT * FROM ferias WHERE id=$1 FOR UPDATE', [id], db);
    if (!f) throw naoEncontrado('Férias');
    if (f.status === 'CANCELADA') throw new HttpError(422, 'Estas férias já foram canceladas.');
    const novo = await one("UPDATE ferias SET status='CANCELADA', motivo_cancelamento=$2, cancelado_em=now() WHERE id=$1 RETURNING *", [id, motivo], db);
    await auditar(db, req.usuario, 'CANCELAR', 'ferias', id, { motivo });
    return novo;
  });
  res.json(out);
});

// RF36: consulta por colaborador, período e área
r.get('/', exigir('ferias:ler'), async (req, res) => {
  const params: unknown[] = [];
  const where: string[] = [];
  if (req.query.colaborador_id) where.push(`f.colaborador_id = $${params.push(Number(req.query.colaborador_id))}`);
  if (req.query.area_id) where.push(`c.area_id = $${params.push(Number(req.query.area_id))}`);
  if (req.query.de) where.push(`f.fim >= $${params.push(String(req.query.de))}`);
  if (req.query.ate) where.push(`f.inicio <= $${params.push(String(req.query.ate))}`);
  if (req.query.incluir_canceladas !== 'true') where.push("f.status='PROGRAMADA'");
  const rows = await query(
    `SELECT f.*, c.nome, c.matricula, a.nome AS area, pa.numero AS periodo_numero, pa.inicio AS aquisitivo_inicio, pa.fim AS aquisitivo_fim
       FROM ferias f JOIN colaboradores c ON c.id=f.colaborador_id LEFT JOIN areas a ON a.id=c.area_id
       JOIN periodos_aquisitivos pa ON pa.id=f.periodo_aquisitivo_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY f.inicio`, params);
  res.json(rows);
});

// RF37 / RF38: mapa de férias (filtrável por ano, área e nome)
r.get('/mapa', exigir('ferias:ler'), async (req, res) => {
  const ano = Number(req.query.ano) || Number(hoje().slice(0, 4));
  const params: unknown[] = [`${ano}-01-01`, `${ano}-12-31`];
  const where = ["f.status='PROGRAMADA'", 'f.fim >= $1', 'f.inicio <= $2'];
  if (req.query.area_id) where.push(`c.area_id = $${params.push(Number(req.query.area_id))}`);
  if (req.query.busca) where.push(`lower(c.nome) LIKE $${params.push(`%${String(req.query.busca).toLowerCase()}%`)}`);
  const rows = await query(
    `SELECT f.colaborador_id, f.inicio, f.fim, c.nome, a.nome AS area FROM ferias f
       JOIN colaboradores c ON c.id=f.colaborador_id LEFT JOIN areas a ON a.id=c.area_id
      WHERE ${where.join(' AND ')} ORDER BY c.nome, f.inicio`, params);
  const porColab = new Map<number, any>();
  for (const f of rows) {
    if (!porColab.has(f.colaborador_id)) porColab.set(f.colaborador_id, { colaborador_id: f.colaborador_id, nome: f.nome, area: f.area, periodos: [] });
    porColab.get(f.colaborador_id).periodos.push({ inicio: f.inicio, fim: f.fim });
  }
  const linhas = [...porColab.values()].map((l) => ({ ...l, meses: diasPorMes(l.periodos, ano) }));
  const totalMes = new Array(12).fill(0).map((_, m) => linhas.filter((l) => l.meses[m] > 0).length);
  res.json({ ano, linhas, pessoas_por_mes: totalMes });
});

r.post('/periodos/:colaborador_id/sincronizar', exigir('ferias:escrever'), async (req, res) => {
  const c = await one('SELECT * FROM colaboradores WHERE id=$1', [idParam(req, 'colaborador_id')]);
  if (!c) throw naoEncontrado('Pessoa colaboradora');
  res.json(await sincronizarPeriodos(undefined, c));
});

