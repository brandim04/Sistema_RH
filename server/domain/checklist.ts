import type { ISODate } from './datas';

export type StatusItem = 'FEITO' | 'NAO_FEITO' | 'NA';

export interface ItemChecklist {
  id?: number;
  categoria: string;
  descricao: string;
  obrigatorio: boolean;
  condicional: boolean;
  status: StatusItem;
}

export class RegraNegocioError extends Error {
  constructor(public regra: string, mensagem: string) {
    super(mensagem);
  }
}

/** RF21: percentual de conclusão. Itens "Não se aplica" contam como resolvidos. */
export function progresso(itens: Pick<ItemChecklist, 'status'>[]) {
  const total = itens.length;
  const feitos = itens.filter((i) => i.status === 'FEITO').length;
  const na = itens.filter((i) => i.status === 'NA').length;
  const percentual = total === 0 ? 0 : Math.round(((feitos + na) / total) * 100);
  return { total, feitos, na, pendentes: total - feitos - na, percentual };
}

/** RN37 / RNF12: pendências obrigatórias = itens obrigatórios ainda não feitos. */
export function pendenciasObrigatorias<T extends Pick<ItemChecklist, 'obrigatorio' | 'status'>>(itens: T[]): T[] {
  return itens.filter((i) => i.obrigatorio && i.status === 'NAO_FEITO');
}

/** RF13 / RN09 / RN10: valida a mudança de status de um item. */
export function validarStatusItem(item: Pick<ItemChecklist, 'condicional' | 'descricao'>, novo: StatusItem) {
  if (!['FEITO', 'NAO_FEITO', 'NA'].includes(novo)) {
    throw new RegraNegocioError('RN09', 'Status inválido. Use feito, não feito ou não se aplica.');
  }
  if (novo === 'NA' && !item.condicional) {
    throw new RegraNegocioError('RN10', `O item "${item.descricao}" não é condicional e não pode ser marcado como "Não se aplica".`);
  }
}

/** DRS 2.5: regras com vigência (ex.: PIS/PASEP obrigatório só para admissões até 02/2024). */
export function itemVigente(m: { vigencia_inicio: ISODate | null; vigencia_fim: ISODate | null }, referencia: ISODate) {
  if (m.vigencia_inicio && referencia < m.vigencia_inicio) return false;
  if (m.vigencia_fim && referencia > m.vigencia_fim) return false;
  return true;
}
