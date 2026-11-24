import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db';
import { cpfValido, formatarCpf, mascararCpf, normalizarCpf } from '../domain/cpf';
import { hoje } from '../domain/datas';
import { auditar, cifrar, decifrar, exigir, hashCpf, HttpError, idParam, naoEncontrado, pode, validar } from '../infra';
import { dataISO, dataOpcional, idOpcional, textoOpcional } from './comum';

export const r = Router();

export const ESTADOS_CIVIS = ['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'SEPARADO', 'UNIAO_ESTAVEL'] as const;
export const NIVEIS = ['JUNIOR', 'PLENO', 'SENIOR'] as const;

const base = {
  nome: z.string().trim().min(3, 'Informe o nome completo.').max(160),
  rg: textoOpcional(30),
  cpf: z.string().refine((v) => normalizarCpf(v).length === 11, 'CPF deve ter 11 dígitos.'),
  data_nascimento: dataOpcional,
  nacionalidade: textoOpcional(60),
  estado: textoOpcional(40),
  cidade: textoOpcional(80),
  estado_civil: z.union([z.enum(ESTADOS_CIVIS), z.literal(''), z.null()]).optional().transform((v) => v || null),
  titulo_eleitor: textoOpcional(30),
  reservista: textoOpcional(30), // RF03 / RN05
  ctps: textoOpcional(30),
  pis_pasep: textoOpcional(30),
  data_admissao: dataISO,
  area_id: idOpcional,
  cargo: z.string().trim().min(2, 'Informe o cargo.').max(100),
  nivel: z.union([z.enum(NIVEIS), z.literal(''), z.null()]).optional().transform((v) => v || null), // RF06 / RN04
  salario: z.union([z.coerce.number().min(0), z.null(), z.literal('')]).optional().transform((v) => (v === '' || v === undefined ? null : v)),
  matricula: textoOpcional(20),
};
const schemaCriar = z.object({
  ...base,
  status: z.enum(['EM_ADMISSAO', 'ATIVO']).default('ATIVO'),
});
const schemaEditar = z.object(base);

/** Formata a linha do banco para a API, ocultando dados sensíveis conforme o perfil (RNF01). */
export function apresentar(c: any, sensivel: boolean) {
  const { cpf_hash, cpf_enc, cpf_final, ...resto } = c;
  return {
    ...resto,
    cpf: sensivel ? formatarCpf(decifrar(cpf_enc)) : mascararCpf(cpf_final),
    salario: sensivel ? c.salario : null,
    rg: sensivel ? c.rg : null,
    titulo_eleitor: sensivel ? c.titulo_eleitor : null,
    reservista: sensivel ? c.reservista : null,
    ctps: sensivel ? c.ctps : null,
    pis_pasep: sensivel ? c.pis_pasep : null,
  };
}

async function proximaMatricula(db: any) {
  const row = await one<{ m: number }>(`SELECT COALESCE(max(NULLIF(regexp_replace(matricula,'\\D','','g'),'')::int),0)+1 AS m FROM colaboradores`, [], db);
  return String(row!.m).padStart(4, '0');
}

export async function inserirColaborador(db: any, d: z.infer<typeof schemaCriar>, validarDigitos = true) {
  const cpf = normalizarCpf(d.cpf);
  if (validarDigitos && !cpfValido(cpf)) throw new HttpError(400, 'CPF inválido (dígitos verificadores não conferem).');
  const matricula = d.matricula || (await proximaMatricula(db));
  return one(
    `INSERT INTO colaboradores
      (matricula, nome, rg, cpf_hash, cpf_enc, cpf_final, data_nascimento, nacionalidade, estado, cidade, estado_civil,
       titulo_eleitor, reservista, ctps, pis_pasep, data_admissao, area_id, cargo, nivel, salario, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
    [matricula, d.nome, d.rg, hashCpf(cpf), cifrar(cpf), cpf.slice(-2), d.data_nascimento, d.nacionalidade, d.estado,
      d.cidade, d.estado_civil, d.titulo_eleitor, d.reservista, d.ctps, d.pis_pasep, d.data_admissao, d.area_id, d.cargo,
      d.nivel, d.salario, d.status],
    db,
  );
}

const SELECT = `SELECT c.*, a.nome AS area_nome FROM colaboradores c LEFT JOIN areas a ON a.id = c.area_id`;

// RF07: consulta por nome (e filtros auxiliares)
r.get('/', exigir('colaborador:ler'), async (req, res) => {
  const busca = String(req.query.busca ?? '').trim();
  const status = String(req.query.status ?? '');
  const area = Number(req.query.area_id ?? 0);
  const params: unknown[] = [];
  const where: string[] = [];
  if (busca) { params.push(`%${busca.toLowerCase()}%`); where.push(`(lower(c.nome) LIKE $${params.length} OR c.matricula = $${params.length + 1})`); params.push(busca); }
  if (status) { params.push(status); where.push(`c.status = $${params.length}`); }
  if (area) { params.push(area); where.push(`c.area_id = $${params.length}`); }
  const rows = await query(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.nome LIMIT 500`, params);
  const sens = pode(req.usuario, 'colaborador:sensivel');
  res.json(rows.map((c) => apresentar(c, sens)));
});

// RF10: visão do quadro de colaboradores
r.get('/quadro', exigir('colaborador:ler'), async (req, res) => {
  const sens = pode(req.usuario, 'colaborador:sensivel');
  const ativos = `c.status IN ('ATIVO','EM_ADMISSAO')`;
  const [porArea, porNivel, porCargo, porStatus, faixas, totais] = await Promise.all([
    query(`SELECT COALESCE(a.nome,'Sem área') AS rotulo, count(*)::int AS total FROM colaboradores c LEFT JOIN areas a ON a.id=c.area_id WHERE ${ativos} GROUP BY 1 ORDER BY 2 DESC`),
    query(`SELECT COALESCE(c.nivel,'NAO_INFORMADO') AS rotulo, count(*)::int AS total FROM colaboradores c WHERE ${ativos} GROUP BY 1 ORDER BY 1`),
    query(`SELECT c.cargo AS rotulo, count(*)::int AS total FROM colaboradores c WHERE ${ativos} GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 15`),
    query(`SELECT c.status AS rotulo, count(*)::int AS total FROM colaboradores c GROUP BY 1 ORDER BY 1`),
    sens ? query(`SELECT CASE WHEN salario IS NULL THEN 'Não informado'
                    WHEN salario < 2000 THEN 'Até R$ 2.000' WHEN salario < 4000 THEN 'R$ 2.000 a 3.999'
                    WHEN salario < 7000 THEN 'R$ 4.000 a 6.999' WHEN salario < 12000 THEN 'R$ 7.000 a 11.999'
                    ELSE 'R$ 12.000 ou mais' END AS rotulo,
                    min(COALESCE(salario,-1)) AS ord, count(*)::int AS total
                  FROM colaboradores c WHERE ${ativos} GROUP BY 1 ORDER BY 2`) : Promise.resolve([]),
    one(`SELECT count(*) FILTER (WHERE ${ativos})::int AS ativos, ${sens ? `round(avg(salario) FILTER (WHERE ${ativos}),2)` : 'NULL'} AS salario_medio,
              count(*) FILTER (WHERE c.data_admissao >= date_trunc('year', now()))::int AS admitidos_ano,
              count(*) FILTER (WHERE c.data_demissao >= date_trunc('year', now()))::int AS desligados_ano
         FROM colaboradores c`),
  ]);
  res.json({ porArea, porNivel, porCargo, porStatus, faixas: faixas.map(({ ord, ...f }: any) => f), totais });
});

// RF08 / RF09: consulta rápida
r.get('/:id', exigir('colaborador:ler'), async (req, res) => {
  const c = await one(`${SELECT} WHERE c.id = $1`, [idParam(req)]);
  if (!c) throw naoEncontrado('Pessoa colaboradora');
  const [admissoes, desligamentos] = await Promise.all([
    query('SELECT id, data_referencia, status FROM admissoes WHERE colaborador_id=$1 ORDER BY id DESC', [c.id]),
    query('SELECT d.id, d.data_desligamento, d.status, m.nome AS modalidade FROM desligamentos d LEFT JOIN modalidades_rescisao m ON m.id=d.modalidade_id WHERE colaborador_id=$1 ORDER BY id DESC', [c.id]),
  ]);
  res.json({ ...apresentar(c, pode(req.usuario, 'colaborador:sensivel')), admissoes, desligamentos });
});

// RF01-RF06: cadastro
r.post('/', exigir('colaborador:escrever'), async (req, res) => {
  const d = validar(schemaCriar, req.body);
  const c = await tx(async (db) => {
    const novo = await inserirColaborador(db, d);
    await auditar(db, req.usuario, 'CRIAR', 'colaborador', novo.id, { nome: d.nome, matricula: novo.matricula });
    return novo;
  });
  res.status(201).json(apresentar(c, true));
});

r.put('/:id', exigir('colaborador:escrever'), async (req, res) => {
  const id = idParam(req);
  const d = validar(schemaEditar, req.body);
  const cpf = normalizarCpf(d.cpf);
  const c = await tx(async (db) => {
    const atual = await one('SELECT * FROM colaboradores WHERE id=$1 FOR UPDATE', [id], db);
    if (!atual) throw naoEncontrado('Pessoa colaboradora');
    // O CPF só é regravado se mudou (o valor exibido pode estar mascarado)
    const cpfMudou = !cpf.includes('*') && cpf.length === 11 && hashCpf(cpf) !== atual.cpf_hash;
    if (cpfMudou && !cpfValido(cpf)) throw new HttpError(400, 'CPF inválido (dígitos verificadores não conferem).');
    const novo = await one(
      `UPDATE colaboradores SET nome=$2, rg=$3, data_nascimento=$4, nacionalidade=$5, estado=$6, cidade=$7, estado_civil=$8,
        titulo_eleitor=$9, reservista=$10, ctps=$11, pis_pasep=$12, data_admissao=$13, area_id=$14, cargo=$15, nivel=$16,
        salario=$17, matricula=COALESCE($18, matricula),
        cpf_hash = CASE WHEN $19::boolean THEN $20 ELSE cpf_hash END,
        cpf_enc  = CASE WHEN $19::boolean THEN $21 ELSE cpf_enc END,
        cpf_final= CASE WHEN $19::boolean THEN $22 ELSE cpf_final END,
        atualizado_em = now()
       WHERE id=$1 RETURNING *`,
      [id, d.nome, d.rg, d.data_nascimento, d.nacionalidade, d.estado, d.cidade, d.estado_civil, d.titulo_eleitor,
        d.reservista, d.ctps, d.pis_pasep, d.data_admissao, d.area_id, d.cargo, d.nivel, d.salario, d.matricula,
        cpfMudou, hashCpf(cpf), cifrar(cpf), cpf.slice(-2)],
      db,
    );
    const alterados = Object.keys(d).filter((k) => k !== 'cpf' && String((atual as any)[k] ?? '') !== String((d as any)[k] ?? ''));
    if (cpfMudou) alterados.push('cpf');
    await auditar(db, req.usuario, 'ALTERAR', 'colaborador', id, { campos: alterados });
    return novo;
  });
  res.json(apresentar(c, true));
});

// RF30: inativar / reativar (o desligamento é feito pelo processo próprio)
r.post('/:id/status', exigir('colaborador:escrever'), async (req, res) => {
  const id = idParam(req);
  const { status } = validar(z.object({ status: z.enum(['ATIVO', 'INATIVO']) }), req.body);
  const c = await tx(async (db) => {
    const atual = await one('SELECT status FROM colaboradores WHERE id=$1 FOR UPDATE', [id], db);
    if (!atual) throw naoEncontrado('Pessoa colaboradora');
    if (atual.status === 'DESLIGADO') throw new HttpError(422, 'Pessoa desligada não pode ser reativada por aqui; registre uma nova admissão.');
    const novo = await one('UPDATE colaboradores SET status=$2, atualizado_em=now() WHERE id=$1 RETURNING *', [id, status], db);
    await auditar(db, req.usuario, status === 'ATIVO' ? 'REATIVAR' : 'INATIVAR', 'colaborador', id, { de: atual.status, para: status });
    return novo;
  });
  res.json(apresentar(c, pode(req.usuario, 'colaborador:sensivel')));
});

// RNF13: importação das planilhas originais (linhas já convertidas para JSON no navegador)
r.post('/importar', exigir('colaborador:escrever'), async (req, res) => {
  const { linhas, validar_digitos_cpf } = validar(
    z.object({ linhas: z.array(z.record(z.string(), z.any())).max(1000), validar_digitos_cpf: z.boolean().default(true) }),
    req.body,
  );
  const areas = await query<{ id: number; nome: string }>('SELECT id, nome FROM areas');
  const mapaArea = new Map(areas.map((a) => [a.nome.toLowerCase(), a.id]));
  const resultado = { importados: 0, erros: [] as { linha: number; nome?: string; erro: string }[] };
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    try {
      let areaId: number | null = null;
      if (l.area) {
        const k = String(l.area).trim().toLowerCase();
        areaId = mapaArea.get(k) ?? null;
        if (!areaId) {
          const nova = await one('INSERT INTO areas (nome) VALUES ($1) ON CONFLICT (nome) DO UPDATE SET nome=EXCLUDED.nome RETURNING id', [String(l.area).trim()]);
          areaId = nova.id;
          mapaArea.set(k, nova.id);
        }
      }
      const d = validar(schemaCriar, { ...l, area_id: areaId, status: 'ATIVO' });
      await tx(async (db) => {
        const c = await inserirColaborador(db, d, validar_digitos_cpf);
        await auditar(db, req.usuario, 'IMPORTAR', 'colaborador', c.id, { origem: 'planilha', linha: l.__linha ?? i + 1 });
      });
      resultado.importados++;
    } catch (e: any) {
      const msg = e?.issues ? e.issues.map((x: any) => `${x.path.join('.')}: ${x.message}`).join('; ')
        : e?.code === '23505' ? 'CPF já cadastrado.' : e.message;
      resultado.erros.push({ linha: l.__linha ?? i + 1, nome: l.nome, erro: msg });
    }
  }
  res.json(resultado);
});

// RF49: histórico do colaborador e de seus processos
r.get('/:id/historico', exigir('colaborador:ler'), async (req, res) => {
  const id = idParam(req);
  const rows = await query(
    `SELECT a.* FROM auditoria a
      WHERE (a.entidade='colaborador' AND a.entidade_id=$1)
         OR (a.entidade='admissao' AND a.entidade_id IN (SELECT id FROM admissoes WHERE colaborador_id=$1))
         OR (a.entidade='desligamento' AND a.entidade_id IN (SELECT id FROM desligamentos WHERE colaborador_id=$1))
         OR (a.entidade='ferias' AND a.entidade_id IN (SELECT id FROM ferias WHERE colaborador_id=$1))
         OR (a.entidade='equipamento' AND a.entidade_id IN (SELECT id FROM equipamentos WHERE colaborador_id=$1))
         OR (a.entidade='item' AND (a.entidade_id IN (SELECT i.id FROM checklist_itens i JOIN admissoes ad ON ad.id=i.admissao_id WHERE ad.colaborador_id=$1)
                                  OR a.entidade_id IN (SELECT i.id FROM checklist_itens i JOIN desligamentos de ON de.id=i.desligamento_id WHERE de.colaborador_id=$1)))
      ORDER BY a.criado_em DESC LIMIT 300`,
    [id],
  );
  res.json(rows);
});

