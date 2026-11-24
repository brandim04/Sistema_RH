import { addDays, addMonths, diffDays, ISODate, sobrepoe, weekday } from './datas';

export interface PeriodoAquisitivo {
  numero: number;
  inicio: ISODate;
  fim: ISODate;
}

export interface FeriasRegistro {
  id?: number;
  inicio: ISODate;
  fim: ISODate;
  dias: number;
  status: 'PROGRAMADA' | 'CANCELADA';
  periodo_aquisitivo_id?: number;
}

/**
 * RF32 / RN22: períodos aquisitivos de 12 meses contados da data de admissão.
 * Gera todos os períodos iniciados até a data `ate` (inclui o período em curso).
 */
export function gerarPeriodosAquisitivos(admissao: ISODate, ate: ISODate): PeriodoAquisitivo[] {
  const lista: PeriodoAquisitivo[] = [];
  let inicio = admissao;
  let numero = 1;
  while (inicio <= ate && numero <= 100) {
    const proximo = addMonths(admissao, 12 * numero);
    lista.push({ numero, inicio, fim: addDays(proximo, -1) });
    inicio = proximo;
    numero++;
  }
  return lista;
}

/**
 * RF33: data limite para início das férias.
 * Planilha "Controle de férias": Limite = EDATE(início, 12) + 335 dias,
 * isto é, o último dia em que 30 dias de férias ainda cabem no período concessivo.
 */
export function dataLimiteInicio(p: PeriodoAquisitivo, diasAposAquisitivo = 335): ISODate {
  return addDays(addDays(p.fim, 1), diasAposAquisitivo);
}

/** RN27: dias de direito conforme faltas injustificadas no período (CLT art. 130). */
export function diasDeDireito(faltas: number): number {
  if (faltas <= 5) return 30;
  if (faltas <= 14) return 24;
  if (faltas <= 23) return 18;
  if (faltas <= 32) return 12;
  return 0;
}

export function contarDias(inicio: ISODate, fim: ISODate) {
  return diffDays(inicio, fim) + 1;
}

export type SituacaoFerias =
  | 'EM_AQUISICAO'        // "Férias não disponíveis" na planilha
  | 'DISPONIVEIS'         // "Férias disponíveis"
  | 'PARCIAL'             // parte do saldo programada
  | 'PROGRAMADAS'         // "Férias planejadas"
  | 'EM_GOZO'
  | 'GOZADAS'
  | 'VENCIDAS'            // passou a data limite com saldo
  | 'SEM_DIREITO';

export const ROTULO_SITUACAO: Record<SituacaoFerias, string> = {
  EM_AQUISICAO: 'Férias não disponíveis',
  DISPONIVEIS: 'Férias disponíveis',
  PARCIAL: 'Parcialmente programadas',
  PROGRAMADAS: 'Férias planejadas',
  EM_GOZO: 'Em gozo',
  GOZADAS: 'Gozadas',
  VENCIDAS: 'Vencidas (prazo de início expirado)',
  SEM_DIREITO: 'Sem direito (faltas)',
};

/** RF33: situação das férias de um período aquisitivo. */
export function situacaoPeriodo(
  p: PeriodoAquisitivo & { faltas?: number },
  ferias: FeriasRegistro[],
  hojeISO: ISODate,
  diasAposAquisitivo = 335,
) {
  const validas = ferias.filter((f) => f.status !== 'CANCELADA');
  const direito = diasDeDireito(p.faltas ?? 0);
  const usados = validas.reduce((s, f) => s + f.dias, 0);
  const saldo = Math.max(0, direito - usados);
  const limite = dataLimiteInicio(p, diasAposAquisitivo);
  // H da planilha: "Dias vencidos ou faltantes" = hoje - fim do aquisitivo
  const diasDesdeAquisicao = diffDays(addDays(p.fim, 1), hojeISO);
  let situacao: SituacaoFerias;
  if (hojeISO <= p.fim) situacao = 'EM_AQUISICAO';
  else if (direito === 0) situacao = 'SEM_DIREITO';
  else if (validas.some((f) => f.inicio <= hojeISO && hojeISO <= f.fim)) situacao = 'EM_GOZO';
  else if (saldo === 0) situacao = validas.every((f) => f.fim < hojeISO) ? 'GOZADAS' : 'PROGRAMADAS';
  else if (hojeISO > limite) situacao = 'VENCIDAS';
  else if (usados > 0) situacao = 'PARCIAL';
  else situacao = 'DISPONIVEIS';
  return { direito, usados, saldo, limite, situacao, rotulo: ROTULO_SITUACAO[situacao], diasDesdeAquisicao };
}

export interface ValidacaoFeriasEntrada {
  colaboradorStatus: string;
  periodo: PeriodoAquisitivo & { id?: number; faltas?: number };
  /** Todas as férias não canceladas do colaborador (de qualquer período). */
  existentes: FeriasRegistro[];
  novo: { inicio: ISODate; fim: ISODate };
  hoje: ISODate;
  bloquearInicioAntesDsr: boolean;
  diasAposAquisitivo?: number;
  /** id das férias sendo alteradas (excluída das comparações). */
  ignorarId?: number;
}

/**
 * RF34/RF35 e RN24-RN29: valida um período de férias.
 * Devolve erros (impedem o registro) e avisos (apenas informam).
 */
export function validarFerias(e: ValidacaoFeriasEntrada) {
  const erros: string[] = [];
  const avisos: string[] = [];
  const { inicio, fim } = e.novo;
  const outras = e.existentes.filter((f) => f.status !== 'CANCELADA' && f.id !== e.ignorarId);

  if (e.colaboradorStatus !== 'ATIVO') {
    erros.push('RN29: somente pessoas colaboradoras ativas podem receber novos períodos de férias.');
  }
  if (inicio > fim) {
    erros.push('RN25: a data de início não pode ser posterior à data de término.');
    return { erros, avisos, dias: 0 };
  }
  const dias = contarDias(inicio, fim);

  if (e.hoje <= e.periodo.fim) {
    erros.push(`RN24: o período aquisitivo ${e.periodo.numero} só se completa em ${e.periodo.fim}; a pessoa ainda não está apta a usufruir dessas férias.`);
  }
  if (inicio <= e.periodo.fim) {
    erros.push('RN23: as férias devem começar depois do fim do período aquisitivo a que se referem.');
  }

  const conflito = outras.find((f) => sobrepoe(inicio, fim, f.inicio, f.fim));
  if (conflito) {
    erros.push(`RN26: conflito com férias já registradas de ${conflito.inicio} a ${conflito.fim}.`);
  }

  // RN27 - CLT art. 130 e art. 134 §1º (fracionamento em até 3 períodos)
  const direito = diasDeDireito(e.periodo.faltas ?? 0);
  const doPeriodo = outras.filter((f) => e.periodo.id === undefined || f.periodo_aquisitivo_id === e.periodo.id);
  const usados = doPeriodo.reduce((s, f) => s + f.dias, 0);
  const parcelas = [...doPeriodo.map((f) => f.dias), dias];
  if (direito === 0) erros.push('RN27: sem direito a férias neste período (mais de 32 faltas injustificadas).');
  if (usados + dias > direito) {
    erros.push(`RN27: o período tem ${direito} dias de direito; já há ${usados} dias registrados e foram solicitados ${dias}.`);
  }
  if (parcelas.length > 3) erros.push('RN27: as férias podem ser fracionadas em no máximo 3 períodos.');
  if (dias < 5) erros.push('RN27: nenhum período de férias pode ter menos de 5 dias corridos.');
  const temQuatorze = parcelas.some((d) => d >= 14);
  const restante = direito - usados - dias;
  if (!temQuatorze && direito >= 14) {
    const parcelasRestantes = 3 - parcelas.length;
    if (restante < 14 || parcelasRestantes < 1) {
      erros.push('RN27: um dos períodos de férias deve ter pelo menos 14 dias corridos.');
    }
  }

  if (e.bloquearInicioAntesDsr) {
    const wd = weekday(inicio);
    if (wd === 5 || wd === 6) {
      erros.push('RN27: as férias não podem começar nos 2 dias que antecedem o repouso semanal (sexta-feira ou sábado) - CLT art. 134 §3º.');
    }
  }

  const limite = dataLimiteInicio(e.periodo, e.diasAposAquisitivo);
  if (inicio > limite) {
    avisos.push(`Início após a data limite (${limite}). Férias concedidas fora do período concessivo são devidas em dobro (CLT art. 137).`);
  }
  if (inicio < e.hoje) avisos.push('Férias registradas com data retroativa.');
  return { erros, avisos, dias };
}

/** RF37: distribui os dias de férias por mês de um ano (mapa de férias). */
export function diasPorMes(ferias: { inicio: ISODate; fim: ISODate }[], ano: number): number[] {
  const meses = new Array(12).fill(0);
  for (const f of ferias) {
    for (let m = 0; m < 12; m++) {
      const ini = `${ano}-${String(m + 1).padStart(2, '0')}-01`;
      const fimMes = addDays(addMonths(ini, 1), -1);
      if (!sobrepoe(f.inicio, f.fim, ini, fimMes)) continue;
      const a = f.inicio > ini ? f.inicio : ini;
      const b = f.fim < fimMes ? f.fim : fimMes;
      meses[m] += contarDias(a, b);
    }
  }
  return meses;
}
