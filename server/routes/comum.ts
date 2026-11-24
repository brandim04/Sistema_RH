import { z } from 'zod';
import { isISODate } from '../domain/datas';

export const dataISO = z.string().refine(isISODate, 'Data inválida (use AAAA-MM-DD).');
export const dataOpcional = z.union([dataISO, z.literal(''), z.null()]).optional().transform((v) => (v ? v : null));
export const textoOpcional = (max = 500) =>
  z.union([z.string().max(max), z.null()]).optional().transform((v) => (v && v.trim() ? v.trim() : null));
export const idOpcional = z.union([z.coerce.number().int().positive(), z.null(), z.literal('')]).optional()
  .transform((v) => (v ? Number(v) : null));
