import { addDays, diffDays, ISODate, weekday } from './datas';

/**
 * RF22 / RN19: data limite = data de referência + dias configurados na etapa.
 * Observação da planilha de prazos: "trocar para dias úteis, caso caia em finais de semana".
 * Como se trata de prazo, a data é ANTECIPADA para a sexta-feira anterior.
 */
export function calcularDataLimite(referencia: ISODate, dias: number, anteciparFimDeSemana: boolean): ISODate {
  let d = addDays(referencia, dias);
  if (anteciparFimDeSemana) {
    const wd = weekday(d);
    if (wd === 6) d = addDays(d, -1); // sábado -> sexta
    else if (wd === 0) d = addDays(d, -2); // domingo -> sexta
  }
  return d;
}

export type SituacaoPrazo = 'CONCLUIDA' | 'ATRASADA' | 'VENCE_EM_BREVE' | 'NO_PRAZO';

/**
 * RF26 / RN20: tarefa vencida e não concluída é "atrasada".
 * RF29: tarefas que vencem em até `alertaDias` dias geram alerta ("vence em breve").
 */
export function situacaoPrazo(
  t: { concluida: boolean; data_limite: ISODate | null },
  hoje: ISODate,
  alertaDias: number,
): SituacaoPrazo | null {
  if (t.concluida) return 'CONCLUIDA';
  if (!t.data_limite) return null;
  const faltam = diffDays(hoje, t.data_limite);
  if (faltam < 0) return 'ATRASADA';
  if (faltam <= alertaDias) return 'VENCE_EM_BREVE';
  return 'NO_PRAZO';
}
