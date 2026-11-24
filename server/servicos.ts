import type { Db } from './db';
import { one, query } from './db';
import { itemVigente, pendenciasObrigatorias, progresso } from './domain/checklist';
import { calcularDataLimite, situacaoPrazo } from './domain/prazos';
import { diaDaSemana, hoje } from './domain/datas';
import { parametros } from './infra';

type Processo = { admissao_id?: number; desligamento_id?: number };

/**
 * RF12 / RF41: gera o checklist a partir do modelo configurado.
 * Itens fora da vigência (DRS 2.5) entram como "Não se aplica", com justificativa.
 */
export async function gerarItens(
  db: Db, proc: Processo, tipo: 'ADMISSAO' | 'DESLIGAMENTO', modalidadeId: number | null,
  referencia: string, antecipar: boolean,
) {
  const modelo = await query(
    `SELECT * FROM modelo_checklist_itens
      WHERE tipo=$1 AND ativo AND ${modalidadeId ? 'modalidade_id=$2' : 'modalidade_id IS NULL'}
      ORDER BY ordem, id`,
    modalidadeId ? [tipo, modalidadeId] : [tipo],
    db,
  );
  const origem = modalidadeId ? 'MODALIDADE' : 'GERAL';
  const baseOrdem = modalidadeId ? 5000 : 0;
  for (const m of modelo) {
    const vigente = itemVigente(m, referencia);
    const limite = m.prazo_dias === null ? null : calcularDataLimite(referencia, m.prazo_dias, antecipar);
    await query(
      `INSERT INTO checklist_itens (admissao_id, desligamento_id, origem, categoria, descricao, orientacao, obrigatorio,
         condicional, status, observacao, prazo_dias, data_limite, ordem)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [proc.admissao_id ?? null, proc.desligamento_id ?? null, origem, m.categoria, m.descricao, m.orientacao,
        m.obrigatorio, m.condicional || !vigente, vigente ? 'NAO_FEITO' : 'NA',
        vigente ? null : `Não exigido: fora da vigência da regra (${m.vigencia_inicio ?? '...'} a ${m.vigencia_fim ?? '...'}).`,
        m.prazo_dias, limite, baseOrdem + m.ordem],
      db,
    );
  }
  return modelo.length;
}

/** RF22 / RF23: gera as tarefas (etapas sequenciadas) da admissão a partir do modelo de prazos. */
export async function gerarTarefas(db: Db, admissaoId: number, modeloId: number, referencia: string, antecipar: boolean) {
  const etapas = await query('SELECT * FROM modelo_prazo_etapas WHERE modelo_id=$1 ORDER BY ordem, id', [modeloId], db);
  for (const e of etapas) {
    await query(
      `INSERT INTO tarefas (admissao_id, ordem, etapa, dias, data_limite, responsavel, responsavel_final)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [admissaoId, e.ordem, e.etapa, e.dias, calcularDataLimite(referencia, e.dias, antecipar), e.responsavel, e.responsavel_final],
      db,
    );
  }
}

/** RN21: alteração da data de referência recalcula os prazos vinculados. */
export async function recalcularPrazos(db: Db, proc: Processo, referencia: string, antecipar: boolean) {
  if (proc.admissao_id) {
    const tarefas = await query('SELECT id, dias FROM tarefas WHERE admissao_id=$1', [proc.admissao_id], db);
    for (const t of tarefas) {
      await query('UPDATE tarefas SET data_limite=$2 WHERE id=$1', [t.id, calcularDataLimite(referencia, t.dias, antecipar)], db);
    }
  }
  const col = proc.admissao_id ? 'admissao_id' : 'desligamento_id';
  const itens = await query(`SELECT id, prazo_dias FROM checklist_itens WHERE ${col}=$1 AND prazo_dias IS NOT NULL`, [proc.admissao_id ?? proc.desligamento_id], db);
  for (const i of itens) {
    await query('UPDATE checklist_itens SET data_limite=$2 WHERE id=$1', [i.id, calcularDataLimite(referencia, i.prazo_dias, antecipar)], db);
  }
}

export function enriquecerTarefa(t: any, hojeISO: string, alertaDias: number) {
  return { ...t, dia_semana: diaDaSemana(t.data_limite), situacao: situacaoPrazo(t, hojeISO, alertaDias) };
}

export function enriquecerItem(i: any, hojeISO: string, alertaDias: number) {
  return {
    ...i,
    dia_semana: i.data_limite ? diaDaSemana(i.data_limite) : null,
    situacao_prazo: i.data_limite ? situacaoPrazo({ concluida: i.status !== 'NAO_FEITO', data_limite: i.data_limite }, hojeISO, alertaDias) : null,
  };
}

/** Pendências que bloqueiam a conclusão de uma admissão. */
export async function pendenciasAdmissao(db: Db | undefined, admissaoId: number) {
  const ad = await one('SELECT * FROM admissoes WHERE id=$1', [admissaoId], db);
  const itens = await query('SELECT id, descricao, categoria, obrigatorio, status FROM checklist_itens WHERE admissao_id=$1', [admissaoId], db);
  const lista = pendenciasObrigatorias(itens).map((i) => `Item obrigatório pendente: ${i.descricao}`);
  const eq = await one<{ n: number }>('SELECT count(*)::int AS n FROM equipamentos WHERE admissao_id=$1', [admissaoId], db);
  if (eq!.n > 0 && !ad.termo_equipamentos_assinado) lista.push('RF20: termo de entrega de equipamentos não assinado.');
  return { lista, progresso: progresso(itens) };
}

/** RN37 / RNF12: pendências que bloqueiam a conclusão de um desligamento. */
export async function pendenciasDesligamento(db: Db | undefined, desligamentoId: number) {
  const d = await one('SELECT * FROM desligamentos WHERE id=$1', [desligamentoId], db);
  const itens = await query('SELECT id, descricao, categoria, obrigatorio, status FROM checklist_itens WHERE desligamento_id=$1', [desligamentoId], db);
  const lista = pendenciasObrigatorias(itens).map((i) => `Item obrigatório pendente: ${i.descricao}`);
  if (!d.modalidade_id) lista.unshift('RN31: selecione a modalidade de rescisão.');
  if (!d.motivo_confirmado) lista.unshift('RN32: confirme o motivo do desligamento.');
  const eq = await query("SELECT descricao FROM equipamentos WHERE colaborador_id=$1 AND status='ENTREGUE'", [d.colaborador_id], db);
  for (const e of eq) lista.push(`RN39: equipamento não devolvido: ${e.descricao}`);
  return { lista, progresso: progresso(itens) };
}

/** RF48 / RF29: painel de pendências e alertas. */
export async function painel(db?: Db) {
  const p = await parametros(db);
  const h = hoje();
  const [contadores, tarefas, itensPrazo, processos] = await Promise.all([
    one(`SELECT
          (SELECT count(*)::int FROM colaboradores WHERE status='ATIVO') AS ativos,
          (SELECT count(*)::int FROM colaboradores WHERE status='EM_ADMISSAO') AS em_admissao,
          (SELECT count(*)::int FROM admissoes WHERE status='ABERTA') AS admissoes_abertas,
          (SELECT count(*)::int FROM desligamentos WHERE status='ABERTO') AS desligamentos_abertos`, [], db),
    query(`SELECT t.*, c.nome AS colaborador, c.id AS colaborador_id FROM tarefas t
             JOIN admissoes a ON a.id=t.admissao_id JOIN colaboradores c ON c.id=a.colaborador_id
            WHERE a.status='ABERTA' AND NOT t.concluida AND t.data_limite <= $1::date + $2::int
            ORDER BY t.data_limite`, [h, p.alertaDias], db),
    query(`SELECT i.*, COALESCE(c1.nome, c2.nome) AS colaborador FROM checklist_itens i
             LEFT JOIN admissoes a ON a.id=i.admissao_id LEFT JOIN colaboradores c1 ON c1.id=a.colaborador_id
             LEFT JOIN desligamentos d ON d.id=i.desligamento_id LEFT JOIN colaboradores c2 ON c2.id=d.colaborador_id
            WHERE i.status='NAO_FEITO' AND i.data_limite IS NOT NULL AND i.data_limite <= $1::date + $2::int
              AND (a.status='ABERTA' OR d.status='ABERTO')
            ORDER BY i.data_limite`, [h, p.alertaDias], db),
    query(`SELECT 'ADMISSAO' AS tipo, a.id, c.id AS colaborador_id, c.nome AS colaborador, a.data_referencia AS data,
                  count(i.*)::int AS total,
                  count(i.*) FILTER (WHERE i.status<>'NAO_FEITO')::int AS resolvidos,
                  count(i.*) FILTER (WHERE i.status='NAO_FEITO' AND i.obrigatorio)::int AS obrigatorias_pendentes,
                  (SELECT count(*)::int FROM tarefas t WHERE t.admissao_id=a.id AND NOT t.concluida AND t.data_limite < $1) AS atrasadas
             FROM admissoes a JOIN colaboradores c ON c.id=a.colaborador_id LEFT JOIN checklist_itens i ON i.admissao_id=a.id
            WHERE a.status='ABERTA' GROUP BY a.id, c.id
           UNION ALL
           SELECT 'DESLIGAMENTO', d.id, c.id, c.nome, d.data_desligamento,
                  count(i.*)::int, count(i.*) FILTER (WHERE i.status<>'NAO_FEITO')::int,
                  count(i.*) FILTER (WHERE i.status='NAO_FEITO' AND i.obrigatorio)::int,
                  count(i.*) FILTER (WHERE i.status='NAO_FEITO' AND i.data_limite < $1)::int
             FROM desligamentos d JOIN colaboradores c ON c.id=d.colaborador_id LEFT JOIN checklist_itens i ON i.desligamento_id=d.id
            WHERE d.status='ABERTO' GROUP BY d.id, c.id
            ORDER BY data`, [h], db),
  ]);

  const alertas: any[] = [];
  for (const t of tarefas) {
    const s = situacaoPrazo(t, h, p.alertaDias);
    alertas.push({ tipo: 'TAREFA', severidade: s === 'ATRASADA' ? 'alta' : 'media', data: t.data_limite,
      mensagem: `${t.etapa} — ${t.colaborador}`, responsavel: t.responsavel, link: `/admissoes/${t.admissao_id}`, situacao: s });
  }
  for (const i of itensPrazo) {
    const s = situacaoPrazo({ concluida: false, data_limite: i.data_limite }, h, p.alertaDias);
    alertas.push({ tipo: i.admissao_id ? 'ADMISSAO' : 'DESLIGAMENTO', severidade: s === 'ATRASADA' ? 'alta' : 'media', data: i.data_limite,
      mensagem: `${i.descricao} — ${i.colaborador}`, link: i.admissao_id ? `/admissoes/${i.admissao_id}` : `/desligamentos/${i.desligamento_id}`, situacao: s });
  }
  alertas.sort((a, b) => (a.data < b.data ? -1 : 1));
  return {
    hoje: h,
    contadores: { ...contadores, tarefas_atrasadas: tarefas.filter((t) => t.data_limite < h).length },
    alertas,
    processos: processos.map((x: any) => ({ ...x, percentual: x.total ? Math.round((x.resolvidos / x.total) * 100) : 0 })),
    alertaDias: p.alertaDias,
  };
}
