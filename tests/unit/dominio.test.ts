/**
 * Testes de unidade das regras de negócio (camada de domínio).
 * Os identificadores CT-xx correspondem aos casos de teste do docs/02-plano-de-testes.md.
 */
import { describe, expect, it } from 'vitest';
import { itemVigente, pendenciasObrigatorias, progresso, RegraNegocioError, validarStatusItem } from '../../server/domain/checklist';
import { cpfValido, formatarCpf, mascararCpf } from '../../server/domain/cpf';
import { addMonths, diaDaSemana, isISODate, sobrepoe } from '../../server/domain/datas';
import {
  dataLimiteInicio, diasDeDireito, diasPorMes, gerarPeriodosAquisitivos, situacaoPeriodo, validarFerias,
} from '../../server/domain/ferias';
import { calcularDataLimite, situacaoPrazo } from '../../server/domain/prazos';
import { PERMISSOES, pode } from '../../server/infra';

describe('Datas', () => {
  it('CT-U01 addMonths reproduz o EDATE do Excel (fim de mês)', () => {
    expect(addMonths('2023-01-31', 1)).toBe('2023-02-28');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
    expect(addMonths('2023-01-01', 12)).toBe('2024-01-01');
  });
  it('CT-U02 RF27 converte data em dia da semana', () => {
    expect(diaDaSemana('2022-01-17')).toBe('Segunda-feira'); // "Primeiro dia" da planilha de prazos
    expect(diaDaSemana('2022-01-15')).toBe('Sábado');
  });
  it('CT-U03 valida datas ISO', () => {
    expect(isISODate('2025-02-29')).toBe(false);
    expect(isISODate('2024-02-29')).toBe(true);
    expect(isISODate('29/02/2024')).toBe(false);
  });
  it('detecta sobreposição de intervalos fechados', () => {
    expect(sobrepoe('2025-01-01', '2025-01-10', '2025-01-10', '2025-01-20')).toBe(true);
    expect(sobrepoe('2025-01-01', '2025-01-09', '2025-01-10', '2025-01-20')).toBe(false);
  });
});

describe('Prazos (RF22, RF26, RN19, RN20)', () => {
  it('CT-U04 calcula data limite igual à planilha (referência + dias)', () => {
    // Planilha "Calculadora": Primeiro dia 17/01/2022; Abertura de vaga -35 => 13/12/2021
    expect(calcularDataLimite('2022-01-17', -35, false)).toBe('2021-12-13');
    expect(calcularDataLimite('2022-01-17', -40, false)).toBe('2021-12-08');
  });
  it('CT-U05 antecipa para sexta quando cai no fim de semana (parâmetro)', () => {
    // 17/01/2022 - 2 dias = sábado 15/01 -> sexta 14/01
    expect(calcularDataLimite('2022-01-17', -2, true)).toBe('2022-01-14');
    expect(calcularDataLimite('2022-01-17', -1, true)).toBe('2022-01-14'); // domingo -> sexta
    expect(calcularDataLimite('2022-01-17', -2, false)).toBe('2022-01-15');
  });
  it('CT-U06 RN20 tarefa vencida e não concluída é atrasada', () => {
    expect(situacaoPrazo({ concluida: false, data_limite: '2025-06-10' }, '2025-06-11', 3)).toBe('ATRASADA');
    expect(situacaoPrazo({ concluida: true, data_limite: '2025-06-10' }, '2025-06-11', 3)).toBe('CONCLUIDA');
    expect(situacaoPrazo({ concluida: false, data_limite: '2025-06-13' }, '2025-06-11', 3)).toBe('VENCE_EM_BREVE');
    expect(situacaoPrazo({ concluida: false, data_limite: '2025-06-30' }, '2025-06-11', 3)).toBe('NO_PRAZO');
  });
});

describe('Checklist (RF13, RF21, RN09, RN10, RN37)', () => {
  const itens = [
    { categoria: 'Doc', descricao: 'CPF', obrigatorio: true, condicional: false, status: 'FEITO' as const },
    { categoria: 'Doc', descricao: 'CNH', obrigatorio: true, condicional: true, status: 'NA' as const },
    { categoria: 'Doc', descricao: 'RG', obrigatorio: false, condicional: false, status: 'NAO_FEITO' as const },
    { categoria: 'Exames', descricao: 'ASO', obrigatorio: true, condicional: false, status: 'NAO_FEITO' as const },
  ];
  it('CT-U07 RF21 percentual conta "não se aplica" como resolvido', () => {
    expect(progresso(itens)).toMatchObject({ total: 4, feitos: 1, na: 1, pendentes: 2, percentual: 50 });
    expect(progresso([]).percentual).toBe(0);
  });
  it('CT-U08 RN37 pendências obrigatórias ignoram itens opcionais', () => {
    expect(pendenciasObrigatorias(itens).map((i) => i.descricao)).toEqual(['ASO']);
  });
  it('CT-U09 RN10 somente item condicional aceita "não se aplica"', () => {
    expect(() => validarStatusItem({ condicional: false, descricao: 'CPF' }, 'NA')).toThrow(RegraNegocioError);
    expect(() => validarStatusItem({ condicional: true, descricao: 'CNH' }, 'NA')).not.toThrow();
    expect(() => validarStatusItem({ condicional: true, descricao: 'X' }, 'OUTRO' as any)).toThrow(/Status inválido/);
  });
  it('CT-U10 vigência da regra do PIS/PASEP (admissões até 02/2024)', () => {
    const pis = { vigencia_inicio: null, vigencia_fim: '2024-02-29' };
    expect(itemVigente(pis, '2024-02-29')).toBe(true);
    expect(itemVigente(pis, '2024-03-01')).toBe(false);
  });
});

describe('Férias (RF32, RF33, RN22-RN27)', () => {
  it('CT-U11 RN22 gera períodos aquisitivos de 12 meses desde a admissão', () => {
    const ps = gerarPeriodosAquisitivos('2023-01-01', '2025-06-16');
    expect(ps).toEqual([
      { numero: 1, inicio: '2023-01-01', fim: '2023-12-31' },
      { numero: 2, inicio: '2024-01-01', fim: '2024-12-31' },
      { numero: 3, inicio: '2025-01-01', fim: '2025-12-31' },
    ]);
  });
  it('CT-U12 RF33 data limite = EDATE(início,12) + 335 (fórmula da planilha)', () => {
    // Planilha: Marcio, início 01/01/2023 -> fim (EDATE) 01/01/2024 -> limite 01/12/2024
    expect(dataLimiteInicio({ numero: 1, inicio: '2023-01-01', fim: '2023-12-31' })).toBe('2024-12-01');
  });
  it('CT-U13 RN27 dias de direito conforme faltas (CLT art. 130)', () => {
    expect([0, 5, 6, 14, 15, 23, 24, 32, 33].map(diasDeDireito)).toEqual([30, 30, 24, 24, 18, 18, 12, 12, 0]);
  });
  it('CT-U14 RF33 situação: em aquisição, disponível, programada, vencida', () => {
    const p = { numero: 1, inicio: '2024-01-01', fim: '2024-12-31' };
    expect(situacaoPeriodo(p, [], '2024-06-01').situacao).toBe('EM_AQUISICAO');
    expect(situacaoPeriodo(p, [], '2025-03-01').situacao).toBe('DISPONIVEIS');
    expect(situacaoPeriodo(p, [], '2025-12-10').situacao).toBe('VENCIDAS');
    const f = [{ inicio: '2025-07-01', fim: '2025-07-30', dias: 30, status: 'PROGRAMADA' as const }];
    expect(situacaoPeriodo(p, f, '2025-03-01').situacao).toBe('PROGRAMADAS');
    expect(situacaoPeriodo(p, f, '2025-07-10').situacao).toBe('EM_GOZO');
    expect(situacaoPeriodo(p, f, '2025-08-10').situacao).toBe('GOZADAS');
    const parcial = [{ inicio: '2025-07-01', fim: '2025-07-15', dias: 15, status: 'PROGRAMADA' as const }];
    expect(situacaoPeriodo(p, parcial, '2025-03-01')).toMatchObject({ situacao: 'PARCIAL', saldo: 15 });
  });

  const base = {
    colaboradorStatus: 'ATIVO',
    periodo: { id: 1, numero: 1, inicio: '2024-01-01', fim: '2024-12-31', faltas: 0 },
    existentes: [] as any[],
    hoje: '2025-03-01',
    bloquearInicioAntesDsr: true,
  };
  it('CT-U15 aceita 30 dias válidos começando numa segunda-feira', () => {
    const v = validarFerias({ ...base, novo: { inicio: '2025-07-07', fim: '2025-08-05' } });
    expect(v.erros).toEqual([]);
    expect(v.dias).toBe(30);
  });
  it('CT-U16 RN25 início posterior ao término', () => {
    expect(validarFerias({ ...base, novo: { inicio: '2025-07-10', fim: '2025-07-01' } }).erros[0]).toMatch(/início não pode ser posterior/i);
  });
  it('CT-U17 RN26 impede conflito entre períodos da mesma pessoa', () => {
    const existentes = [{ id: 9, periodo_aquisitivo_id: 1, inicio: '2025-07-07', fim: '2025-07-21', dias: 15, status: 'PROGRAMADA' as const }];
    const v = validarFerias({ ...base, existentes, novo: { inicio: '2025-07-14', fim: '2025-07-28' } });
    expect(v.erros.join()).toMatch(/conflito com férias já registradas/i);
    // a mesma férias, ao ser alterada, não conflita consigo mesma
    const v2 = validarFerias({ ...base, existentes, ignorarId: 9, novo: { inicio: '2025-07-14', fim: '2025-07-28' } });
    expect(v2.erros.join()).not.toMatch(/conflito com férias já registradas/i);
  });
  it('CT-U18 RN24 pessoa ainda não apta (período aquisitivo em curso)', () => {
    expect(validarFerias({ ...base, hoje: '2024-11-01', novo: { inicio: '2025-01-06', fim: '2025-01-20' } }).erros.join()).toMatch(/só se completa em/i);
  });
  it('CT-U19 RN27 limites de fracionamento e quantidade de dias', () => {
    expect(validarFerias({ ...base, novo: { inicio: '2025-07-07', fim: '2025-07-09' } }).erros.join()).toMatch(/menos de 5 dias/);
    expect(validarFerias({ ...base, novo: { inicio: '2025-07-07', fim: '2025-08-10' } }).erros.join()).toMatch(/30 dias de direito/);
    const tres = [
      { id: 1, periodo_aquisitivo_id: 1, inicio: '2025-04-07', fim: '2025-04-20', dias: 14, status: 'PROGRAMADA' as const },
      { id: 2, periodo_aquisitivo_id: 1, inicio: '2025-05-05', fim: '2025-05-09', dias: 5, status: 'PROGRAMADA' as const },
      { id: 3, periodo_aquisitivo_id: 1, inicio: '2025-06-02', fim: '2025-06-06', dias: 5, status: 'PROGRAMADA' as const },
    ];
    expect(validarFerias({ ...base, existentes: tres, novo: { inicio: '2025-07-07', fim: '2025-07-11' } }).erros.join()).toMatch(/no máximo 3/);
    // Duas parcelas de 10 dias deixariam o saldo (10) sem permitir um período de 14
    const uma = [{ id: 1, periodo_aquisitivo_id: 1, inicio: '2025-04-07', fim: '2025-04-16', dias: 10, status: 'PROGRAMADA' as const }];
    expect(validarFerias({ ...base, existentes: uma, novo: { inicio: '2025-07-07', fim: '2025-07-16' } }).erros.join()).toMatch(/14 dias/);
  });
  it('CT-U20 RN27 não inicia na sexta/sábado (CLT art. 134 §3º) quando parametrizado', () => {
    const sexta = { inicio: '2025-07-04', fim: '2025-08-02' };
    expect(validarFerias({ ...base, novo: sexta }).erros.join()).toMatch(/repouso semanal/);
    expect(validarFerias({ ...base, bloquearInicioAntesDsr: false, novo: sexta }).erros).toEqual([]);
  });
  it('CT-U21 RN29 pessoa inativa não recebe novas férias', () => {
    expect(validarFerias({ ...base, colaboradorStatus: 'INATIVO', novo: { inicio: '2025-07-07', fim: '2025-08-05' } }).erros.join()).toMatch(/somente pessoas colaboradoras ativas/i);
  });
  it('CT-U22 aviso quando o início passa da data limite (férias em dobro)', () => {
    const v = validarFerias({ ...base, hoje: '2025-12-20', novo: { inicio: '2026-01-05', fim: '2026-02-03' } });
    expect(v.avisos.join()).toMatch(/dobro/);
  });
  it('CT-U23 RF37 distribui os dias de férias por mês no mapa', () => {
    const m = diasPorMes([{ inicio: '2025-06-20', fim: '2025-07-19' }], 2025);
    expect(m[5]).toBe(11);
    expect(m[6]).toBe(19);
    expect(m.reduce((a, b) => a + b, 0)).toBe(30);
  });
});

describe('CPF e perfis', () => {
  it('CT-U24 RNF11 valida dígitos verificadores do CPF', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('123.321.123-31')).toBe(false); // CPF fictício da planilha original
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(formatarCpf('52998224725')).toBe('529.982.247-25');
    expect(mascararCpf('25')).toBe('***.***.***-25');
  });
  it('CT-U25 RNF04 matriz de permissões por perfil', () => {
    const u = (perfil: any) => ({ id: 1, nome: 'x', email: 'x', perfil });
    expect(pode(u('GESTOR'), 'ferias:ler')).toBe(true);
    expect(pode(u('GESTOR'), 'ferias:escrever')).toBe(false);
    expect(pode(u('GESTOR'), 'colaborador:sensivel')).toBe(false);
    expect(pode(u('TI'), 'equipamento:escrever')).toBe(true);
    expect(pode(u('TI'), 'processo:escrever')).toBe(false);
    expect(pode(u('RH'), 'usuario:admin')).toBe(false);
    expect(PERMISSOES.ADMIN).toContain('usuario:admin');
    expect(pode(undefined, 'colaborador:ler')).toBe(false);
  });
});
