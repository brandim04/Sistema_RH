/**
 * Popula o sistema com dados de demonstração (baseados nas planilhas originais) usando a própria API.
 * Funciona tanto localmente quanto no ambiente publicado na Vercel:
 *
 *   npx tsx scripts/demo.ts http://localhost:3001 admin@empresa.com Admin@123
 *   npx tsx scripts/demo.ts https://seu-projeto.vercel.app admin@empresa.com SENHA
 */
const [base = 'http://localhost:3001', email = 'admin@empresa.com', senha = 'Admin@123'] = process.argv.slice(2);
let cookie = '';

async function api(metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(base + '/api' + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const dados: any = r.status === 204 ? null : await r.json();
  if (!r.ok) throw new Error(`${metodo} ${url}: ${r.status} ${JSON.stringify(dados)}`);
  return dados;
}

function cpf(base9: string) {
  const dv = (b: string, p: number) => { let s = 0; for (let i = 0; i < b.length; i++) s += +b[i] * (p - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(base9, 10);
  return base9 + d1 + dv(base9 + d1, 11);
}
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
function mais(dias: number, de = hoje) { const d = new Date(de + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); }
function segunda(d: string) { const x = new Date(d + 'T00:00:00Z'); while (x.getUTCDay() !== 1) x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); }

const PESSOAS = [
  // Planilha "Cadastro de pessoas colaboradoras"
  { nome: 'Agnaldo Gusmão', rg: '111.222-1', data_nascimento: '1992-11-01', nacionalidade: 'Brasileira', estado: 'SP', cidade: 'São Paulo', estado_civil: 'SOLTEIRO', titulo_eleitor: '1234 1234 1234', reservista: '654321', ctps: '1234567', pis_pasep: '123.43287.12-4', data_admissao: '2021-01-01', area: 'Vendas', cargo: 'Vendedor(a)', nivel: 'JUNIOR', salario: 1300 },
  { nome: 'Marcia Rodrigues', rg: '111.222-2', data_nascimento: '1989-04-23', nacionalidade: 'Brasileira', estado: 'SP', cidade: 'Osasco', estado_civil: 'CASADO', titulo_eleitor: '1235 1234 1234', ctps: '7654321', pis_pasep: '192.56412.14-3', data_admissao: '2021-07-08', area: 'Vendas', cargo: 'Vendedor(a)', nivel: 'PLENO', salario: 2000 },
  { nome: 'Kleide Cardoso', rg: '111.222-3', data_nascimento: '1996-06-12', nacionalidade: 'Portuguesa', estado: 'SC', cidade: 'Joinville', estado_civil: 'CASADO', titulo_eleitor: '1236 1234 1234', ctps: '3214568', pis_pasep: '000.12679.13-6', data_admissao: '2020-09-23', area: 'RH', cargo: 'Recrutador(a)', nivel: 'SENIOR', salario: 5000 },
  { nome: 'Diana Cristina de Medeiros', rg: '111.222-4', data_nascimento: '1986-09-27', nacionalidade: 'Alemã', estado: 'SP', cidade: 'São Paulo', estado_civil: 'DIVORCIADO', titulo_eleitor: '1237 1234 1234', ctps: '9876422', pis_pasep: '123.12345.54-2', data_admissao: '2021-04-09', area: 'Marketing', cargo: 'Gerente de Marketing', nivel: 'PLENO', salario: 7000 },
  // Planilha "Controle de férias" (sobrenomes fictícios)
  { nome: 'Marcio Alves', data_admissao: '2023-01-01', area: 'Vendas', cargo: 'Executivo(a) de contas', nivel: 'PLENO', salario: 4200 },
  { nome: 'Flavia Nogueira', data_admissao: '2022-04-02', area: 'Marketing', cargo: 'Analista de marketing', nivel: 'PLENO', salario: 4800 },
  { nome: 'Carlos Menezes', data_admissao: '2022-11-18', area: 'RH', cargo: 'Analista de DP', nivel: 'JUNIOR', salario: 3100 },
  { nome: 'Letícia Prado', data_admissao: '2021-10-05', area: 'Marketing', cargo: 'Designer', nivel: 'SENIOR', salario: 6900 },
  { nome: 'Larissa Teixeira', data_admissao: '2022-04-05', area: 'Engenharia', cargo: 'Engenheira de software', nivel: 'PLENO', salario: 9500 },
  { nome: 'Carla Fontes', data_admissao: '2021-06-01', area: 'Tecnologia', cargo: 'Analista de infraestrutura', nivel: 'SENIOR', salario: 11000 },
  { nome: 'Alfredo Siqueira', data_admissao: '2021-06-02', area: 'Marketing', cargo: 'Coordenador de marketing', nivel: 'SENIOR', salario: 12500 },
  { nome: 'Luiz Barreto', data_admissao: '2021-06-03', area: 'Vendas', cargo: 'Vendedor(a)', nivel: 'PLENO', salario: 2300 },
];

async function main() {
  await api('POST', '/auth/login', { email, senha });
  const areas: any[] = await api('GET', '/areas');
  const areaId = (n: string) => areas.find((a) => a.nome === n)?.id ?? null;
  const ids: Record<string, number> = {};
  const existentes: any[] = await api('GET', '/colaboradores');
  let n = 0;
  for (const p of PESSOAS) {
    n++;
    const ja = existentes.find((e) => e.nome === p.nome);
    if (ja) { ids[p.nome] = ja.id; continue; }
    const c = await api('POST', '/colaboradores', { ...p, cpf: cpf(String(400000000 + n * 7919).padStart(9, '0')), area_id: areaId(p.area), status: 'ATIVO' });
    ids[p.nome] = c.id;
  }
  console.log(`Colaboradores: ${Object.keys(ids).length}`);

  // Histórico: férias já gozadas nos períodos antigos (deixa o último período concluído em aberto)
  for (const nome of Object.keys(ids)) {
    const det = await api('GET', `/ferias/colaboradores/${ids[nome]}`);
    const antigos = det.periodos.filter((x: any) => x.situacao !== 'EM_AQUISICAO').sort((a: any, b: any) => a.numero - b.numero).slice(0, -1);
    for (const p of antigos) {
      if (p.usados > 0) continue;
      const ini = segunda(mais(60, p.fim));
      try { await api('POST', '/ferias', { colaborador_id: ids[nome], periodo_aquisitivo_id: p.id, inicio: ini, fim: mais(29, ini) }); } catch { /* ignora */ }
    }
  }

  // Férias programadas (equivalente às linhas "Férias planejadas" da planilha)
  const programar = async (nome: string, inicioAprox: string, dias: number) => {
    const det = await api('GET', `/ferias/colaboradores/${ids[nome]}`);
    const p = det.periodos.find((x: any) => x.saldo >= dias && x.situacao !== 'EM_AQUISICAO');
    if (!p) return;
    const ini = segunda(inicioAprox);
    try { await api('POST', '/ferias', { colaborador_id: ids[nome], periodo_aquisitivo_id: p.id, inicio: ini, fim: mais(dias - 1, ini) }); } catch (e: any) { console.log('  (férias ignoradas)', nome, e.message.slice(0, 120)); }
  };
  await programar('Carla Fontes', mais(20), 30);
  await programar('Alfredo Siqueira', mais(45), 20);
  await programar('Larissa Teixeira', mais(-5), 15);
  await programar('Flavia Nogueira', mais(75), 30);

  // Admissão em andamento (1º dia daqui a 12 dias)
  const novos: any[] = await api('GET', '/colaboradores?busca=Bruno Tavares');
  if (!novos.length) {
    const inicio = segunda(mais(10));
    const bruno = await api('POST', '/colaboradores', {
      nome: 'Bruno Tavares', cpf: cpf('287654319'), data_admissao: inicio, area_id: areaId('Tecnologia'),
      cargo: 'Desenvolvedor(a) front-end', nivel: 'JUNIOR', salario: 4500, estado_civil: 'SOLTEIRO', nacionalidade: 'Brasileira', status: 'EM_ADMISSAO',
    });
    const adm = await api('POST', '/admissoes', { colaborador_id: bruno.id, data_referencia: inicio, observacoes: 'Vaga aberta para o squad de produto.' });
    const d = await api('GET', `/admissoes/${adm.id}`);
    for (const i of d.itens.filter((x: any) => x.categoria === 'Documentação').slice(0, 9)) {
      await api('PATCH', `/itens/${i.id}`, { status: i.condicional && /CNH|antecedentes|vacina/i.test(i.descricao) ? 'NA' : 'FEITO' });
    }
    for (const t of d.tarefas.filter((x: any) => x.data_limite < hoje).slice(0, -2)) await api('PATCH', `/tarefas/${t.id}`, { concluida: true });
    await api('POST', '/equipamentos', { colaborador_id: bruno.id, admissao_id: adm.id, descricao: 'Notebook Dell Latitude 5440', patrimonio: 'NB-0457', data_entrega: inicio });
    console.log(`Admissão #${adm.id} criada para Bruno Tavares (1º dia ${inicio}).`);
  }

  // Desligamento em andamento
  const desl: any[] = await api('GET', '/desligamentos?status=ABERTO');
  if (!desl.length) {
    await api('POST', '/equipamentos', { colaborador_id: ids['Luiz Barreto'], descricao: 'Celular corporativo', patrimonio: 'CEL-0112', data_entrega: '2021-06-03' });
    const mods: any[] = await api('GET', '/modalidades');
    const d = await api('POST', '/desligamentos', { colaborador_id: ids['Luiz Barreto'], data_desligamento: mais(5), modalidade_id: mods.find((m) => m.codigo === 'PEDIDO_DEMISSAO').id, observacoes: 'Pedido de demissão entregue pelo colaborador.' });
    const det = await api('GET', `/desligamentos/${d.id}`);
    for (const i of det.itens.filter((x: any) => x.categoria === 'Financeiro e legal').slice(0, 3)) await api('PATCH', `/itens/${i.id}`, { status: 'FEITO' });
    console.log(`Desligamento #${d.id} criado para Luiz Barreto.`);
  }

  // Usuários de exemplo para demonstrar os perfis
  const us: any[] = await api('GET', '/usuarios');
  for (const [nome, mail, perfil] of [['Ana (RH)', 'rh@empresa.com', 'RH'], ['Gustavo (Gestor)', 'gestor@empresa.com', 'GESTOR'], ['Tiago (TI)', 'ti@empresa.com', 'TI']]) {
    if (!us.some((u) => u.email === mail)) await api('POST', '/usuarios', { nome, email: mail, perfil, senha: 'Senha@123', ativo: true });
  }
  console.log('Usuários de exemplo: rh@empresa.com, gestor@empresa.com, ti@empresa.com (senha: Senha@123)');
}
main().catch((e) => { console.error(e.message); process.exit(1); });
