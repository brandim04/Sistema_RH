import { reactive } from 'vue';

// =====================================================================
// Sessão do usuário (RF52/RF53)
// =====================================================================
export interface UsuarioSessao { id: number; nome: string; email: string; perfil: string; permissoes: string[] }

export const sessao = reactive<{ usuario: UsuarioSessao | null; carregado: boolean }>({ usuario: null, carregado: false });

export function pode(p: string) {
  return !!sessao.usuario?.permissoes.includes(p);
}

// =====================================================================
// Avisos (toasts) e diálogos
// =====================================================================
export const toasts = reactive<{ id: number; texto: string; erro?: boolean; lista?: string[] }[]>([]);
let seq = 0;
export function avisar(texto: string, erro = false, lista?: string[]) {
  const id = ++seq;
  toasts.push({ id, texto, erro, lista });
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
  }, erro ? 8000 : 3500);
}

export const dialogo = reactive<{
  aberto: boolean; titulo: string; texto: string; pedirTexto: boolean; valor: string; confirmar: string; perigo: boolean;
  resolver?: (v: string | null) => void;
}>({ aberto: false, titulo: '', texto: '', pedirTexto: false, valor: '', confirmar: 'Confirmar', perigo: false });

function abrir(titulo: string, texto: string, pedirTexto: boolean, confirmar: string, perigo: boolean) {
  return new Promise<string | null>((resolve) => {
    Object.assign(dialogo, { aberto: true, titulo, texto, pedirTexto, valor: '', confirmar, perigo, resolver: resolve });
  });
}
export const confirmar = async (titulo: string, texto = '', botao = 'Confirmar', perigo = false) =>
  (await abrir(titulo, texto, false, botao, perigo)) !== null;
export const pedirTexto = (titulo: string, texto = '', botao = 'Confirmar') => abrir(titulo, texto, true, botao, false);

// =====================================================================
// Cliente HTTP da API
// =====================================================================
export class ApiError extends Error {
  constructor(public status: number, message: string, public detalhes?: string[], public campos?: { campo: string; mensagem: string }[]) {
    super(message);
  }
}

let aoExpirar: () => void = () => undefined;
export function definirAoExpirar(fn: () => void) { aoExpirar = fn; }

export async function api<T = any>(metodo: string, url: string, corpo?: unknown): Promise<T> {
  const r = await fetch('/api' + url, {
    method: metodo,
    headers: corpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    credentials: 'same-origin',
  });
  if (r.status === 204) return undefined as T;
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && !url.startsWith('/auth/login')) { sessao.usuario = null; aoExpirar(); }
    const detalhes = Array.isArray(dados.detalhes) ? dados.detalhes : undefined;
    throw new ApiError(r.status, dados.erro ?? 'Falha na comunicação com o servidor.', detalhes, dados.campos);
  }
  return dados as T;
}
export const get = <T = any>(u: string) => api<T>('GET', u);
export const post = <T = any>(u: string, c: unknown = {}) => api<T>('POST', u, c);
export const put = <T = any>(u: string, c: unknown) => api<T>('PUT', u, c);
export const patch = <T = any>(u: string, c: unknown) => api<T>('PATCH', u, c);
export const del = <T = any>(u: string) => api<T>('DELETE', u);

/** Executa a ação e mostra o erro da API, se houver. Retorna true se deu certo. */
export async function tentar(fn: () => Promise<unknown>, sucesso?: string) {
  try {
    await fn();
    if (sucesso) avisar(sucesso);
    return true;
  } catch (e: any) {
    const lista = e.detalhes ?? e.campos?.map((c: any) => `${c.campo}: ${c.mensagem}`);
    avisar(e.message ?? String(e), true, lista);
    return false;
  }
}

// =====================================================================
// Formatação e rótulos
// =====================================================================
export function data(s?: string | null) {
  if (!s) return '—';
  const d = s.slice(0, 10).split('-');
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : s;
}
export function dataHora(s?: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
export function moeda(v?: number | null) {
  return v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
export function hojeISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export const ROTULOS: Record<string, Record<string, string>> = {
  status: { ATIVO: 'Ativo', INATIVO: 'Inativo', DESLIGADO: 'Desligado', EM_ADMISSAO: 'Em admissão' },
  nivel: { JUNIOR: 'Júnior', PLENO: 'Pleno', SENIOR: 'Sênior', NAO_INFORMADO: 'Não informado' },
  estado_civil: { SOLTEIRO: 'Solteiro(a)', CASADO: 'Casado(a)', DIVORCIADO: 'Divorciado(a)', VIUVO: 'Viúvo(a)', SEPARADO: 'Separado(a)', UNIAO_ESTAVEL: 'União estável' },
  processo: { ABERTA: 'Aberta', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada', ABERTO: 'Aberto', CONCLUIDO: 'Concluído', CANCELADO: 'Cancelado' },
  prazo: { CONCLUIDA: 'Concluída', ATRASADA: 'Atrasada', VENCE_EM_BREVE: 'Vence em breve', NO_PRAZO: 'No prazo' },
  item: { FEITO: 'Feito', NAO_FEITO: 'Não feito', NA: 'Não se aplica' },
  ferias: {
    EM_AQUISICAO: 'Férias não disponíveis', DISPONIVEIS: 'Férias disponíveis', PARCIAL: 'Parcialmente programadas',
    PROGRAMADAS: 'Férias planejadas', EM_GOZO: 'Em gozo', GOZADAS: 'Gozadas', VENCIDAS: 'Vencidas', SEM_DIREITO: 'Sem direito',
  },
  perfil: { ADMIN: 'Administrador', RH: 'RH', DP: 'Departamento Pessoal', GESTOR: 'Gestor(a)', TI: 'TI / Facilities' },
  aviso: { NAO_DEFINIDO: 'Não definido', TRABALHADO: 'Trabalhado', INDENIZADO: 'Indenizado', DISPENSADO: 'Dispensado', NAO_APLICA: 'Não se aplica' },
  equipamento: { ENTREGUE: 'Com a pessoa', DEVOLVIDO: 'Devolvido', EXTRAVIADO: 'Extraviado' },
};
export const rotulo = (grupo: string, v?: string | null) => (v ? ROTULOS[grupo]?.[v] ?? v : '—');

export function cor(grupo: string, v?: string | null): string {
  const m: Record<string, Record<string, string>> = {
    status: { ATIVO: 'verde', EM_ADMISSAO: 'azul', INATIVO: 'ambar', DESLIGADO: '' },
    processo: { ABERTA: 'azul', ABERTO: 'azul', CONCLUIDA: 'verde', CONCLUIDO: 'verde', CANCELADA: '', CANCELADO: '' },
    prazo: { CONCLUIDA: 'verde', ATRASADA: 'vermelho', VENCE_EM_BREVE: 'ambar', NO_PRAZO: 'azul' },
    ferias: { EM_AQUISICAO: '', DISPONIVEIS: 'azul', PARCIAL: 'azul', PROGRAMADAS: 'verde', EM_GOZO: 'verde', GOZADAS: '', VENCIDAS: 'vermelho', SEM_DIREITO: 'ambar' },
    equipamento: { ENTREGUE: 'ambar', DEVOLVIDO: 'verde', EXTRAVIADO: 'vermelho' },
  };
  return m[grupo]?.[v ?? ''] ?? '';
}
