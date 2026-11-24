/**
 * Testes de integração da API com banco PostgreSQL real.
 * Cada "it" corresponde a um caso de teste CT-Ixx do docs/02-plano-de-testes.md.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { cpfValido } from '../../server/domain/cpf';
import { CPFS, HOJE, subirAmbiente } from './ambiente';

let amb: Awaited<ReturnType<typeof subirAmbiente>>;
let admin: request.Agent;

const pessoa = (i: number, extra: Record<string, unknown> = {}) => ({
  nome: `Pessoa Teste ${i}`, cpf: CPFS[i], data_admissao: '2023-01-02', cargo: 'Analista', nivel: 'PLENO',
  salario: 5000, estado_civil: 'SOLTEIRO', nacionalidade: 'Brasileira', ...extra,
});

beforeAll(async () => {
  amb = await subirAmbiente();
  admin = await amb.login();
});
afterAll(async () => { await amb?.derrubar(); });

describe('Segurança (RF52, RF53, RNF03, RNF04)', () => {
  it('CT-I01 nega acesso sem autenticação', async () => {
    const r = await request(amb.app).get('/api/colaboradores');
    expect(r.status).toBe(401);
  });
  it('CT-I02 rejeita senha incorreta e aceita a correta', async () => {
    const r = await request(amb.app).post('/api/auth/login').send({ email: 'admin@empresa.com', senha: 'errada' });
    expect(r.status).toBe(401);
    const me = await admin.get('/api/auth/me');
    expect(me.body).toMatchObject({ email: 'admin@empresa.com', perfil: 'ADMIN' });
  });
  it('CT-I03 perfil GESTOR consulta mas não altera e não vê dados sensíveis', async () => {
    await admin.post('/api/usuarios').send({ nome: 'Gestora', email: 'gestora@empresa.com', perfil: 'GESTOR', senha: 'Gestora123' }).expect(201);
    await admin.post('/api/colaboradores').send(pessoa(5)).expect(201);
    const g = await amb.login('gestora@empresa.com', 'Gestora123');
    const lista = await g.get('/api/colaboradores').expect(200);
    expect(lista.body[0].cpf).toMatch(/^\*\*\*/);
    expect(lista.body[0].salario).toBeNull();
    await g.post('/api/colaboradores').send(pessoa(4)).expect(403);
    await g.get('/api/ferias/mapa').expect(200);
    await g.get('/api/usuarios').expect(403);
  });
});

describe('Cadastro (RF01-RF10, RN01-RN06)', () => {
  let id: number;
  it('CT-I04 cadastra pessoa com dados pessoais e profissionais; reservista opcional', async () => {
    expect(CPFS.every(cpfValido)).toBe(true);
    const r = await admin.post('/api/colaboradores').send(pessoa(0, { reservista: '' })).expect(201);
    id = r.body.id;
    expect(r.body).toMatchObject({ nome: 'Pessoa Teste 0', cpf: '529.982.247-25', reservista: null, status: 'ATIVO', data_demissao: null });
    expect(r.body.matricula).toMatch(/^\d{4}$/);
  });
  it('CT-I05 RN02 impede CPF duplicado', async () => {
    const r = await admin.post('/api/colaboradores').send(pessoa(0, { nome: 'Outra Pessoa' }));
    expect(r.status).toBe(409);
    expect(r.body.erro).toMatch(/RN02/);
  });
  it('CT-I06 RNF11 rejeita CPF inválido, nível e estado civil fora do padrão', async () => {
    expect((await admin.post('/api/colaboradores').send(pessoa(1, { cpf: '123.321.123-31' }))).status).toBe(400);
    expect((await admin.post('/api/colaboradores').send(pessoa(1, { nivel: 'Estagiário' }))).status).toBe(400);
    expect((await admin.post('/api/colaboradores').send(pessoa(1, { estado_civil: 'Enrolado' }))).status).toBe(400);
  });
  it('CT-I07 RF07/RF08 consulta por nome e consulta rápida', async () => {
    const r = await admin.get('/api/colaboradores?busca=teste 0').expect(200);
    expect(r.body).toHaveLength(1);
    const det = await admin.get(`/api/colaboradores/${id}`).expect(200);
    expect(det.body).toMatchObject({ cpf: '529.982.247-25', salario: 5000, nivel: 'PLENO' });
  });
  it('CT-I08 RNF01 CPF fica cifrado no banco', async () => {
    const { query } = await import('../../server/db');
    const [row] = await query('SELECT cpf_enc, cpf_hash FROM colaboradores WHERE id=$1', [id]);
    expect(row.cpf_enc).not.toContain('52998224725');
    expect(row.cpf_hash).toHaveLength(64);
  });
  it('CT-I09 RF10 quadro de colaboradores por área/nível/faixa salarial', async () => {
    const r = await admin.get('/api/colaboradores/quadro').expect(200);
    expect(r.body.porNivel.find((x: any) => x.rotulo === 'PLENO').total).toBeGreaterThanOrEqual(1);
    expect(r.body.faixas.length).toBeGreaterThan(0);
  });
  it('CT-I10 RNF13 importa linhas da planilha e informa erros por linha', async () => {
    const r = await admin.post('/api/colaboradores/importar').send({
      linhas: [
        { __linha: 6, nome: 'Agnaldo Gusmão', cpf: CPFS[1], data_admissao: '2021-01-01', cargo: 'Vendedor(a)', nivel: 'JUNIOR', area: 'Vendas', salario: 1300 },
        { __linha: 7, nome: 'Marcia Rodrigues', cpf: '123.321.123-32', data_admissao: '2021-07-08', cargo: 'Vendedor(a)', nivel: 'PLENO', area: 'Vendas' },
      ],
    }).expect(200);
    expect(r.body.importados).toBe(1);
    expect(r.body.erros).toEqual([expect.objectContaining({ linha: 7 })]);
  });
  it('CT-I11 RF30 inativa e reativa', async () => {
    await admin.post(`/api/colaboradores/${id}/status`).send({ status: 'INATIVO' }).expect(200);
    const r = await admin.post(`/api/colaboradores/${id}/status`).send({ status: 'ATIVO' }).expect(200);
    expect(r.body.status).toBe('ATIVO');
  });
});

describe('Admissão e prazos (RF11-RF29)', () => {
  let colab: number;
  let adm: any;
  it('CT-I12 RN08 admissão exige pessoa cadastrada', async () => {
    const r = await admin.post('/api/admissoes').send({ colaborador_id: 99999, data_referencia: '2025-07-01' });
    expect(r.status).toBe(422);
    expect(r.body.erro).toMatch(/RN08/);
  });
  it('CT-I13 RF12/RF22 gera checklist agrupado e tarefas com prazos calculados', async () => {
    const c = await admin.post('/api/colaboradores').send(pessoa(2, { data_admissao: '2025-07-01', status: 'EM_ADMISSAO' })).expect(201);
    colab = c.body.id;
    const r = await admin.post('/api/admissoes').send({ colaborador_id: colab, data_referencia: '2025-07-01' }).expect(201);
    adm = (await admin.get(`/api/admissoes/${r.body.id}`).expect(200)).body;
    const cats = new Set(adm.itens.map((i: any) => i.categoria));
    expect([...cats]).toEqual(['Documentação', 'Exames', 'Cadastros/acessos', 'Onboarding']);
    expect(adm.itens.length).toBeGreaterThanOrEqual(39);
    // PIS/PASEP: admissão após 02/2024 => "não se aplica" automaticamente (vigência)
    expect(adm.itens.find((i: any) => i.descricao.includes('PIS')).status).toBe('NA');
    // eSocial: 1 dia antes do início (30/06/2025, segunda)
    const esocial = adm.itens.find((i: any) => i.descricao === 'Cadastro no eSocial');
    expect(esocial).toMatchObject({ data_limite: '2025-06-30', dia_semana: 'Segunda-feira' });
    // Tarefas do modelo padrão: "Processo de admissão (DP)" -11 dias = 20/06/2025 (sexta)
    const dp = adm.tarefas.find((t: any) => t.etapa === 'Processo de admissão (DP)');
    expect(dp).toMatchObject({ data_limite: '2025-06-20', dia_semana: 'Sexta-feira', situacao: 'NO_PRAZO' });
    // RN20: etapas anteriores a hoje (16/06/2025) e não concluídas aparecem como atrasadas
    expect(adm.tarefas.find((t: any) => t.dias === -40).situacao).toBe('ATRASADA');
    expect(adm.progresso.percentual).toBeLessThan(10);
  });
  it('CT-I14 RN10 recusa "não se aplica" em item não condicional; aceita em condicional', async () => {
    const cpf = adm.itens.find((i: any) => i.descricao.startsWith('CPF'));
    const r = await admin.patch(`/api/itens/${cpf.id}`).send({ status: 'NA' });
    expect(r.status).toBe(422);
    const cnh = adm.itens.find((i: any) => i.descricao === 'CNH');
    await admin.patch(`/api/itens/${cnh.id}`).send({ status: 'NA', observacao: 'Não é motorista' }).expect(200);
  });
  it('CT-I15 RN21 alterar a data de referência recalcula prazos', async () => {
    await admin.put(`/api/admissoes/${adm.id}`).send({ data_referencia: '2025-07-15' }).expect(200);
    const d = (await admin.get(`/api/admissoes/${adm.id}`)).body;
    expect(d.itens.find((i: any) => i.descricao === 'Cadastro no eSocial').data_limite).toBe('2025-07-14');
    expect(d.tarefas.find((t: any) => t.etapa === 'Processo de admissão (DP)').data_limite).toBe('2025-07-04');
  });
  it('CT-I16 RF25 lista tarefas de vários processos e filtra atrasadas', async () => {
    const r = await admin.get('/api/tarefas?situacao=ATRASADA').expect(200);
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body.every((t: any) => t.situacao === 'ATRASADA')).toBe(true);
  });
  it('CT-I17 RF19/RF20 equipamento exige termo assinado para concluir', async () => {
    await admin.post('/api/equipamentos').send({ colaborador_id: colab, admissao_id: adm.id, descricao: 'Notebook', patrimonio: 'NB-001', data_entrega: '2025-07-15' }).expect(201);
    const pend = (await admin.get(`/api/admissoes/${adm.id}`)).body.pendencias;
    expect(pend.join()).toMatch(/RF20/);
  });
  it('CT-I18 RNF12 não conclui com pendências; conclui após resolvê-las e ativa a pessoa', async () => {
    const r = await admin.post(`/api/admissoes/${adm.id}/concluir`);
    expect(r.status).toBe(422);
    expect(r.body.detalhes.length).toBeGreaterThan(0);
    const d = (await admin.get(`/api/admissoes/${adm.id}`)).body;
    for (const i of d.itens.filter((x: any) => x.status === 'NAO_FEITO')) {
      await admin.patch(`/api/itens/${i.id}`).send({ status: i.obrigatorio || !i.condicional ? 'FEITO' : 'NA' }).expect(200);
    }
    await admin.put(`/api/admissoes/${adm.id}`).send({ termo_equipamentos_assinado: true }).expect(200);
    const fim = (await admin.get(`/api/admissoes/${adm.id}`)).body;
    expect(fim.progresso.percentual).toBe(100);
    await admin.post(`/api/admissoes/${adm.id}/concluir`).expect(200);
    expect((await admin.get(`/api/colaboradores/${colab}`)).body.status).toBe('ATIVO');
    // processo encerrado não pode mais ser alterado
    expect((await admin.patch(`/api/itens/${d.itens[0].id}`).send({ status: 'NAO_FEITO' })).status).toBe(422);
  });
  it('CT-I19 RF17 gera termo LGPD com os dados da pessoa', async () => {
    const r = await admin.get(`/api/admissoes/${adm.id}/lgpd`).expect(200);
    expect(r.body.texto).toContain('Pessoa Teste 2');
    expect(r.body.texto).toContain('390.533.447-05');
  });
  it('CT-I20 RNF09 checklist de ~40 itens carrega em menos de 2 s', async () => {
    const t0 = Date.now();
    await admin.get(`/api/admissoes/${adm.id}`).expect(200);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
  it('CT-I21 RF28 duplica um modelo de prazos', async () => {
    const ms = (await admin.get('/api/config/modelos-prazo')).body;
    const r = await admin.post(`/api/config/modelos-prazo/${ms[0].id}/duplicar`).send({ nome: 'Cópia de teste' }).expect(201);
    const todos = (await admin.get('/api/config/modelos-prazo')).body;
    expect(todos.find((m: any) => m.id === r.body.id).etapas.length).toBe(ms[0].etapas.length);
  });
});

describe('Férias (RF30-RF39)', () => {
  let colab: number;
  let periodos: any[];
  it('CT-I22 RF32/RF33 calcula períodos aquisitivos e situação', async () => {
    colab = (await admin.post('/api/colaboradores').send(pessoa(3, { data_admissao: '2023-01-02' })).expect(201)).body.id;
    const r = await admin.get(`/api/ferias/colaboradores/${colab}`).expect(200);
    periodos = r.body.periodos;
    expect(periodos.map((p: any) => p.numero)).toEqual([3, 2, 1]);
    const p1 = periodos.find((p: any) => p.numero === 1);
    expect(p1).toMatchObject({ inicio: '2023-01-02', fim: '2024-01-01', limite: '2024-12-02', situacao: 'VENCIDAS' });
    expect(periodos.find((p: any) => p.numero === 2).situacao).toBe('DISPONIVEIS');
    expect(periodos.find((p: any) => p.numero === 3).situacao).toBe('EM_AQUISICAO');
  });
  it('CT-I23 RF34 registra férias válidas e atualiza o mapa (RN28)', async () => {
    const p2 = periodos.find((p: any) => p.numero === 2);
    const r = await admin.post('/api/ferias').send({ colaborador_id: colab, periodo_aquisitivo_id: p2.id, inicio: '2025-07-07', fim: '2025-07-26' }).expect(201);
    expect(r.body.dias).toBe(20);
    const mapa = (await admin.get('/api/ferias/mapa?ano=2025')).body;
    const linha = mapa.linhas.find((l: any) => l.colaborador_id === colab);
    expect(linha.meses[6]).toBe(20);
  });
  it('CT-I24 RN26 impede conflito e RN27 excesso de dias', async () => {
    const p2 = periodos.find((p: any) => p.numero === 2);
    const conflito = await admin.post('/api/ferias').send({ colaborador_id: colab, periodo_aquisitivo_id: p2.id, inicio: '2025-07-21', fim: '2025-07-30' });
    expect(conflito.status).toBe(422);
    expect(conflito.body.detalhes.join()).toMatch(/RN26/);
    const excesso = await admin.post('/api/ferias').send({ colaborador_id: colab, periodo_aquisitivo_id: p2.id, inicio: '2025-09-01', fim: '2025-09-15' });
    expect(excesso.body.detalhes.join()).toMatch(/30 dias de direito/);
  });
  it('CT-I25 RN24 não registra férias de período ainda em aquisição', async () => {
    const p3 = periodos.find((p: any) => p.numero === 3);
    const r = await admin.post('/api/ferias').send({ colaborador_id: colab, periodo_aquisitivo_id: p3.id, inicio: '2026-01-05', fim: '2026-01-19' });
    expect(r.status).toBe(422);
    expect(r.body.detalhes.join()).toMatch(/RN24/);
  });
  it('CT-I26 RF39 cancelamento mantém histórico e libera o saldo', async () => {
    const lista = (await admin.get(`/api/ferias?colaborador_id=${colab}`)).body;
    await admin.post(`/api/ferias/${lista[0].id}/cancelar`).send({ motivo: 'Pedido da pessoa' }).expect(200);
    const hist = (await admin.get(`/api/ferias?colaborador_id=${colab}&incluir_canceladas=true`)).body;
    expect(hist[0]).toMatchObject({ status: 'CANCELADA', motivo_cancelamento: 'Pedido da pessoa' });
    const det = (await admin.get(`/api/ferias/colaboradores/${colab}`)).body;
    expect(det.periodos.find((p: any) => p.numero === 2).saldo).toBe(30);
  });
  it('CT-I27 RF36/RF38 consulta e filtra por área', async () => {
    const areas = (await admin.get('/api/areas')).body;
    const r = await admin.get(`/api/ferias/colaboradores?area_id=${areas[0].id}`).expect(200);
    expect(Array.isArray(r.body)).toBe(true);
    const todos = (await admin.get('/api/ferias/colaboradores?situacao=VENCIDAS')).body;
    expect(todos.some((x: any) => x.colaborador_id === colab)).toBe(true);
  });
});

describe('Desligamento (RF40-RF47)', () => {
  let colab: number;
  let deslig: any;
  it('CT-I28 RF40/RF41 abre desligamento e gera checklist por etapas', async () => {
    colab = (await admin.post('/api/colaboradores').send(pessoa(4)).expect(201)).body.id;
    await admin.post('/api/equipamentos').send({ colaborador_id: colab, descricao: 'Celular', data_entrega: '2023-01-02' }).expect(201);
    const r = await admin.post('/api/desligamentos').send({ colaborador_id: colab, data_desligamento: '2025-06-30' }).expect(201);
    deslig = (await admin.get(`/api/desligamentos/${r.body.id}`)).body;
    expect(deslig.itens.some((i: any) => i.categoria === 'Devolução de bens')).toBe(true);
    expect(deslig.pendencias.join()).toMatch(/RN31/);
    expect(deslig.pendencias.join()).toMatch(/RN32/);
    expect(deslig.pendencias.join()).toMatch(/RN39: equipamento não devolvido: Celular/);
  });
  it('CT-I29 RF42/RN31 modalidade define documentos; trocar modalidade substitui os itens', async () => {
    const mods = (await admin.get('/api/modalidades')).body;
    const sjc = mods.find((m: any) => m.codigo === 'SEM_JUSTA_CAUSA');
    const acordo = mods.find((m: any) => m.codigo === 'ACORDO');
    await admin.put(`/api/desligamentos/${deslig.id}`).send({ modalidade_id: sjc.id, motivo_confirmado: true }).expect(200);
    let d = (await admin.get(`/api/desligamentos/${deslig.id}`)).body;
    expect(d.itens.some((i: any) => i.descricao.includes('40%'))).toBe(true);
    await admin.put(`/api/desligamentos/${deslig.id}`).send({ modalidade_id: acordo.id }).expect(200);
    d = (await admin.get(`/api/desligamentos/${deslig.id}`)).body;
    expect(d.itens.some((i: any) => i.descricao.includes('40%'))).toBe(false);
    expect(d.itens.some((i: any) => i.descricao.includes('20%'))).toBe(true);
    // RN32: ao trocar a modalidade o motivo precisa ser reconfirmado
    expect(d.motivo_confirmado).toBe(false);
    // RN33: exame demissional em até 10 dias do término (30/06 + 10 = 10/07)
    expect(d.itens.find((i: any) => i.descricao === 'Marcar exame médico demissional').data_limite).toBe('2025-07-10');
    deslig = d;
  });
  it('CT-I30 RNF12/RN37 bloqueia conclusão com pendências', async () => {
    const r = await admin.post(`/api/desligamentos/${deslig.id}/concluir`);
    expect(r.status).toBe(422);
    expect(r.body.erro).toMatch(/RN37/);
  });
  it('CT-I31 RF44 devolução de bens confere com o inventário da admissão', async () => {
    const eq = deslig.equipamentos[0];
    await admin.patch(`/api/equipamentos/${eq.id}`).send({ status: 'DEVOLVIDO', data_devolucao: '2025-06-30' }).expect(200);
    const d = (await admin.get(`/api/desligamentos/${deslig.id}`)).body;
    expect(d.pendencias.join()).not.toMatch(/RN39/);
  });
  it('CT-I32 RF43 registra valores de verbas para conferência', async () => {
    const saldo = deslig.itens.find((i: any) => i.descricao === 'Saldo de salário');
    await admin.patch(`/api/itens/${saldo.id}`).send({ status: 'FEITO', valor: 4800.5 }).expect(200);
    expect((await admin.get(`/api/desligamentos/${deslig.id}`)).body.total_verbas).toBe(4800.5);
  });
  it('CT-I33 RF46/RF47/RN38 conclui e marca a pessoa como desligada', async () => {
    await admin.put(`/api/desligamentos/${deslig.id}`).send({ motivo_confirmado: true }).expect(200);
    const d = (await admin.get(`/api/desligamentos/${deslig.id}`)).body;
    for (const i of d.itens.filter((x: any) => x.status === 'NAO_FEITO')) {
      await admin.patch(`/api/itens/${i.id}`).send({ status: i.condicional ? 'NA' : 'FEITO' }).expect(200);
    }
    await admin.post(`/api/desligamentos/${deslig.id}/concluir`).expect(200);
    const c = (await admin.get(`/api/colaboradores/${colab}`)).body;
    expect(c).toMatchObject({ status: 'DESLIGADO', data_demissao: '2025-06-30' });
    // RN29: pessoa desligada não recebe novas férias
    const det = (await admin.get(`/api/ferias/colaboradores/${colab}`)).body;
    const p = det.periodos.find((x: any) => x.numero === 2);
    const f = await admin.post('/api/ferias').send({ colaborador_id: colab, periodo_aquisitivo_id: p.id, inicio: '2025-07-07', fim: '2025-07-21' });
    expect(f.body.detalhes.join()).toMatch(/RN29/);
  });
});

describe('Funcionalidades gerais (RF48-RF51, RNF05, RNF06)', () => {
  it('CT-I34 RF48 painel apresenta pendências por processo e alertas (RF29)', async () => {
    const r = await admin.get('/api/painel').expect(200);
    expect(r.body.hoje).toBe(HOJE);
    expect(r.body.contadores).toHaveProperty('ferias_vencidas');
    expect(r.body.alertas.some((a: any) => a.tipo === 'FERIAS')).toBe(true);
  });
  it('CT-I35 RF49/RF50 auditoria registra quem alterou e quando', async () => {
    const r = await admin.get('/api/auditoria?entidade=desligamento').expect(200);
    expect(r.body.some((a: any) => a.acao === 'CONCLUIR' && a.usuario_email === 'admin@empresa.com' && a.criado_em)).toBe(true);
  });
  it('CT-I36 RNF06 parâmetros e modelos configuráveis sem alterar código', async () => {
    await admin.put('/api/config/parametros/alerta_dias').send({ valor: '5' }).expect(200);
    expect((await admin.put('/api/config/parametros/alerta_dias').send({ valor: 'cinco' })).status).toBe(400);
    const novo = await admin.post('/api/config/modelo-itens').send({
      tipo: 'ADMISSAO', categoria: 'Documentação', descricao: 'Item criado no teste', obrigatorio: false, condicional: true,
    }).expect(201);
    await admin.delete(`/api/config/modelo-itens/${novo.body.id}`).expect(204);
  });
  it('CT-I37 RNF17 gera cópia de segurança sem senhas nem conteúdo de anexos', async () => {
    const r = await admin.get('/api/admin/backup').expect(200);
    expect(r.body.colaboradores.length).toBeGreaterThan(0);
    expect(JSON.stringify(r.body.usuarios)).not.toContain('senha_hash');
  });
  it('CT-I38 RF18 anexa e baixa documento (limite de 2 MB)', async () => {
    const c = (await admin.get('/api/colaboradores')).body[0];
    const pdf = Buffer.from('%PDF-1.4 teste').toString('base64');
    const up = await admin.post('/api/documentos').send({ colaborador_id: c.id, nome_arquivo: 'rg.pdf', mime: 'application/pdf', conteudo_base64: pdf }).expect(201);
    const dl = await admin.get(`/api/documentos/${up.body.id}/download`).expect(200);
    expect(dl.headers['content-type']).toContain('application/pdf');
    const exe = await admin.post('/api/documentos').send({ colaborador_id: c.id, nome_arquivo: 'x.exe', mime: 'application/x-msdownload', conteudo_base64: pdf });
    expect(exe.status).toBe(400);
  });
});
