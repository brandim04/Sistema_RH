/**
 * Exportação para Excel (RF51) e importação das planilhas originais (RNF13).
 * A biblioteca exceljs é carregada sob demanda para não pesar no carregamento inicial.
 */
export interface Coluna { titulo: string; campo: string; largura?: number; formato?: (v: any, linha: any) => unknown }

export async function exportarExcel(nomeArquivo: string, aba: string, colunas: Coluna[], linhas: any[]) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema de Ciclo de Vida do Colaborador';
  const ws = wb.addWorksheet(aba.slice(0, 31));
  ws.columns = colunas.map((c) => ({ header: c.titulo, key: c.campo, width: c.largura ?? 18 }));
  for (const l of linhas) {
    const row: Record<string, unknown> = {};
    for (const c of colunas) row[c.campo] = c.formato ? c.formato(l[c.campo], l) : l[c.campo];
    ws.addRow(row);
  }
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6F5C' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
  const buf = await wb.xlsx.writeBuffer();
  baixar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nomeArquivo);
}

export function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const sem = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function valorCelula(v: any): any {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return valorCelula(v.result);
    if ('text' in v) return v.text;
    if ('richText' in v) return v.richText.map((t: any) => t.text).join('');
  }
  return v;
}

/** Lê uma aba procurando a linha de cabeçalho que contém "Nome". */
function lerAba(ws: any): Record<string, any>[] {
  let cab: string[] | null = null;
  const linhas: Record<string, any>[] = [];
  ws.eachRow({ includeEmpty: false }, (row: any, n: number) => {
    const vals: any[] = [];
    row.eachCell({ includeEmpty: true }, (cell: any, col: number) => { vals[col - 1] = valorCelula(cell.value); });
    if (!cab) {
      if (vals.some((v) => sem(v) === 'nome')) { cab = vals.map(sem); }
      return;
    }
    const o: Record<string, any> = { __linha: n };
    cab.forEach((h, i) => { if (h) o[h] = vals[i]; });
    if (o.nome) linhas.push(o);
  });
  return linhas;
}

const ESTADO_CIVIL: Record<string, string> = {
  solteiro: 'SOLTEIRO', 'solteiro(a)': 'SOLTEIRO', solteira: 'SOLTEIRO', casado: 'CASADO', 'casado(a)': 'CASADO', casada: 'CASADO',
  divorciado: 'DIVORCIADO', 'divorciado(a)': 'DIVORCIADO', divorciada: 'DIVORCIADO', viuvo: 'VIUVO', 'viuvo(a)': 'VIUVO', viuva: 'VIUVO',
  separado: 'SEPARADO', 'separado(a)': 'SEPARADO', 'uniao estavel': 'UNIAO_ESTAVEL',
};
const NIVEL: Record<string, string> = { junior: 'JUNIOR', pleno: 'PLENO', senior: 'SENIOR' };

/**
 * Converte a planilha "Cadastro de pessoas colaboradoras" (abas de dados pessoais e
 * profissionais) para o formato da API, juntando as duas abas pelo nome.
 */
export async function lerPlanilhaCadastro(arquivo: File) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await arquivo.arrayBuffer());
  const pessoais = new Map<string, any>();
  const profissionais = new Map<string, any>();
  wb.eachSheet((ws: any) => {
    const nome = sem(ws.name);
    const linhas = lerAba(ws);
    if (nome.includes('pessoa')) linhas.forEach((l) => pessoais.set(sem(l.nome), l));
    else if (nome.includes('profissiona')) linhas.forEach((l) => profissionais.set(sem(l.nome), l));
    else if (!nome.includes('consulta') && !nome.includes('painel') && !nome.includes('instru')) {
      linhas.forEach((l) => { pessoais.set(sem(l.nome), { ...pessoais.get(sem(l.nome)), ...l }); });
    }
  });
  const nomes = new Set([...pessoais.keys(), ...profissionais.keys()]);
  const data = (v: any) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : typeof v === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(v) ? v.split('/').reverse().join('-') : '');
  return [...nomes].map((k) => {
    const p = pessoais.get(k) ?? {};
    const f = profissionais.get(k) ?? {};
    return {
      __linha: p.__linha ?? f.__linha,
      nome: String(p.nome ?? f.nome).trim(),
      rg: String(p.rg ?? '').trim(),
      cpf: String(p.cpf ?? '').trim(),
      data_nascimento: data(p.nascimento),
      nacionalidade: String(p.nacionalidade ?? '').trim(),
      estado: String(p.estado ?? '').trim(),
      cidade: String(p.cidade ?? '').trim(),
      estado_civil: ESTADO_CIVIL[sem(Object.entries(p).find(([h]) => h.startsWith('estado c'))?.[1])] ?? '',
      titulo_eleitor: String(p['titulo eleitoral'] ?? '').trim(),
      reservista: String(Object.entries(p).find(([h]) => h.includes('reservista'))?.[1] ?? '').trim(),
      ctps: String(f.ctps ?? '').trim(),
      pis_pasep: String(f['pis/pasep'] ?? '').trim(),
      data_admissao: data(f.admissao),
      area: String(f.area ?? '').trim(),
      cargo: String(f.cargo ?? '').trim(),
      nivel: NIVEL[sem(f.nivel)] ?? '',
      salario: f.salario === '' || f.salario === undefined ? '' : Number(f.salario),
    };
  });
}
