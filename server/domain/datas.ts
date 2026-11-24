/**
 * Utilitários de datas no formato ISO 'AAAA-MM-DD'.
 * Todas as contas são feitas em UTC para que o resultado não dependa do fuso
 * do servidor (a Vercel executa em UTC; o usuário está em America/Sao_Paulo).
 */
export type ISODate = string;

const RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !RE.test(s)) return false;
  const d = toDate(s);
  return !Number.isNaN(d.getTime()) && fromDate(d) === s;
}

export function toDate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fromDate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDate(d);
}

/** Equivalente ao EDATE do Excel: soma meses e ajusta ao último dia do mês quando necessário. */
export function addMonths(s: ISODate, n: number): ISODate {
  const [y, m, d] = s.split('-').map(Number);
  const alvo = new Date(Date.UTC(y, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return fromDate(alvo);
}

/** Diferença em dias (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}

/** 0 = domingo ... 6 = sábado (mesma convenção de WEEKDAY()-1 do Excel). */
export function weekday(s: ISODate): number {
  return toDate(s).getUTCDay();
}

export const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

/** RF27: converte uma data no respectivo dia da semana. */
export function diaDaSemana(s: ISODate): string {
  return DIAS_SEMANA[weekday(s)];
}

/** Data de hoje no fuso de São Paulo (pode ser sobrescrita por HOJE=AAAA-MM-DD em testes). */
export function hoje(): ISODate {
  if (process.env.HOJE && isISODate(process.env.HOJE)) return process.env.HOJE;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export function minDate(a: ISODate, b: ISODate) { return a < b ? a : b; }
export function maxDate(a: ISODate, b: ISODate) { return a > b ? a : b; }

/** Verdadeiro se os intervalos fechados [a1,a2] e [b1,b2] se sobrepõem. */
export function sobrepoe(a1: ISODate, a2: ISODate, b1: ISODate, b2: ISODate) {
  return a1 <= b2 && b1 <= a2;
}
