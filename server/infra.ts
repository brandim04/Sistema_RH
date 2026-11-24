import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError, ZodType } from 'zod';
import { Db, query } from './db';
import { RegraNegocioError } from './domain/checklist';

// =====================================================================
// Erros HTTP
// =====================================================================
export class HttpError extends Error {
  constructor(public status: number, message: string, public detalhes?: unknown) {
    super(message);
  }
}
export const naoEncontrado = (o = 'Registro') => new HttpError(404, `${o} não encontrado(a).`);

export function validar<T>(schema: ZodType<T>, dados: unknown): T {
  return schema.parse(dados);
}

export function idParam(req: Request, nome = 'id'): number {
  const n = Number(req.params[nome]);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Identificador inválido.');
  return n;
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      erro: 'Dados inválidos.',
      campos: err.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
    });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ erro: err.message, detalhes: err.detalhes });
  if (err instanceof RegraNegocioError) return res.status(422).json({ erro: err.message, regra: err.regra });
  if (err?.type === 'entity.too.large') return res.status(413).json({ erro: 'Arquivo ou requisição muito grande.' });
  // Erros do PostgreSQL que representam violação de regra (RNF11)
  if (err?.code === '23505') return res.status(409).json({ erro: mensagemUnica(err.constraint) });
  if (err?.code === '23514') return res.status(422).json({ erro: mensagemCheck(err.constraint) });
  if (err?.code === '23503') return res.status(409).json({ erro: 'Registro vinculado a outro registro (integridade referencial).' });
  console.error(err);
  return res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
}

function mensagemUnica(c?: string) {
  const m: Record<string, string> = {
    colaboradores_cpf_hash_key: 'Já existe uma pessoa colaboradora cadastrada com este CPF.',
    colaboradores_matricula_key: 'Já existe uma pessoa colaboradora com esta matrícula.',
    ux_admissao_aberta: 'Já existe um processo de admissão aberto para esta pessoa.',
    ux_desligamento_aberto: 'Já existe um processo de desligamento aberto para esta pessoa.',
    usuarios_email_key: 'Já existe um usuário com este e-mail.',
    areas_nome_key: 'Já existe uma área com este nome.',
    modelos_prazo_nome_key: 'Já existe um modelo de prazos com este nome.',
  };
  return m[c ?? ''] ?? 'Registro duplicado.';
}
function mensagemCheck(c?: string) {
  const m: Record<string, string> = {
    ck_demissao_somente_desligado: 'A data de demissão deve ficar em branco enquanto a pessoa não estiver desligada.',
    ck_demissao_apos_admissao: 'A data de demissão não pode ser anterior à admissão.',
    ck_na_somente_condicional: 'Apenas itens condicionais podem ser marcados como "Não se aplica".',
    ck_ferias_datas: 'A data de início não pode ser posterior à data de término.',
    ck_devolucao: 'Informe a data de devolução.',
  };
  return m[c ?? ''] ?? 'Valor não permitido (regra de integridade).';
}

// =====================================================================
// Criptografia de dados pessoais (RNF01 / RNF02)
// =====================================================================
function chave(): Buffer {
  const k = process.env.DATA_KEY;
  if (!k) {
    if (process.env.NODE_ENV === 'production') throw new Error('DATA_KEY não configurada');
    return crypto.createHash('sha256').update('chave-de-desenvolvimento-nao-usar-em-producao').digest();
  }
  return crypto.createHash('sha256').update(k).digest();
}

/** Hash determinístico (HMAC-SHA256) para garantir unicidade do CPF sem armazená-lo em claro. */
export function hashCpf(cpfDigitos: string): string {
  return crypto.createHmac('sha256', chave()).update(cpfDigitos).digest('hex');
}

/** AES-256-GCM: iv(12) + tag(16) + texto cifrado, em base64. */
export function cifrar(texto: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const enc = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}

export function decifrar(b64: string): string {
  const buf = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', chave(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

// =====================================================================
// Autenticação e autorização (RF52, RF53, RNF03, RNF04, RN40)
// =====================================================================
export type Perfil = 'ADMIN' | 'RH' | 'DP' | 'GESTOR' | 'TI';
export type Permissao =
  | 'colaborador:ler' | 'colaborador:escrever' | 'colaborador:sensivel'
  | 'processo:ler' | 'processo:escrever' | 'checklist:marcar' | 'equipamento:escrever'
  | 'ferias:ler' | 'ferias:escrever' | 'config:escrever' | 'usuario:admin' | 'auditoria:ler';

const TODAS: Permissao[] = [
  'colaborador:ler', 'colaborador:escrever', 'colaborador:sensivel', 'processo:ler', 'processo:escrever',
  'checklist:marcar', 'equipamento:escrever', 'ferias:ler', 'ferias:escrever', 'config:escrever',
  'usuario:admin', 'auditoria:ler',
];

/** Matriz perfil x permissão (documentada em docs/01-SDD.md). */
export const PERMISSOES: Record<Perfil, Permissao[]> = {
  ADMIN: TODAS,
  RH: TODAS.filter((p) => p !== 'usuario:admin'),
  DP: TODAS.filter((p) => p !== 'usuario:admin' && p !== 'config:escrever'),
  GESTOR: ['colaborador:ler', 'processo:ler', 'ferias:ler'],
  TI: ['colaborador:ler', 'processo:ler', 'checklist:marcar', 'equipamento:escrever'],
};

export interface Usuario { id: number; nome: string; email: string; perfil: Perfil }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { usuario?: Usuario } }
}

const COOKIE = 'cv_sessao';
function segredo() {
  const s = process.env.JWT_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET não configurado');
    return 'segredo-de-desenvolvimento';
  }
  return s;
}

export function emitirSessao(res: Response, u: Usuario) {
  const token = jwt.sign({ sub: u.id, nome: u.nome, email: u.email, perfil: u.perfil }, segredo(), { expiresIn: '8h' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 3600 * 1000,
    path: '/',
  });
}

export function encerrarSessao(res: Response) {
  res.clearCookie(COOKIE, { path: '/' });
}

/** Middleware: exige usuário autenticado. */
export function autenticar(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE] ?? (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined);
  if (!token) return next(new HttpError(401, 'Faça login para continuar.'));
  try {
    const p = jwt.verify(token, segredo()) as any;
    req.usuario = { id: Number(p.sub), nome: p.nome, email: p.email, perfil: p.perfil };
    next();
  } catch {
    next(new HttpError(401, 'Sessão expirada. Faça login novamente.'));
  }
}

export function pode(u: Usuario | undefined, p: Permissao) {
  return !!u && PERMISSOES[u.perfil]?.includes(p);
}

/** Middleware: exige a permissão informada. */
export function exigir(...ps: Permissao[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (ps.every((p) => pode(req.usuario, p))) return next();
    next(new HttpError(403, 'Seu perfil não tem permissão para esta ação.'));
  };
}

// =====================================================================
// Auditoria (RF49, RF50, RNF05)
// =====================================================================
export async function auditar(
  db: Db | undefined, u: Usuario | undefined, acao: string, entidade: string, entidadeId: number | null, detalhes?: unknown,
) {
  await query(
    'INSERT INTO auditoria (usuario_id, usuario_email, acao, entidade, entidade_id, detalhes) VALUES ($1,$2,$3,$4,$5,$6)',
    [u?.id ?? null, u?.email ?? null, acao, entidade, entidadeId, detalhes === undefined ? null : JSON.stringify(detalhes)],
    db,
  );
}

// =====================================================================
// Parâmetros (RNF06)
// =====================================================================
export async function parametros(db?: Db) {
  const rows = await query<{ chave: string; valor: string }>('SELECT chave, valor FROM parametros', [], db);
  const m = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
  return {
    raw: m as Record<string, string>,
    alertaDias: Number(m.alerta_dias ?? 3),
    anteciparFimDeSemana: (m.prazos_antecipar_fim_de_semana ?? 'true') === 'true',
    feriasAlertaDias: Number(m.ferias_alerta_limite_dias ?? 60),
    feriasBloquearDsr: (m.ferias_bloquear_inicio_antes_dsr ?? 'true') === 'true',
    feriasDiasLimite: Number(m.ferias_dias_limite_apos_aquisitivo ?? 335),
  };
}
