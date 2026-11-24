/** Remove tudo que não for dígito. */
export function normalizarCpf(cpf: string): string {
  return (cpf ?? '').replace(/\D/g, '');
}

/** RNF11: valida os dígitos verificadores do CPF. */
export function cpfValido(cpf: string): boolean {
  const c = normalizarCpf(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(c.slice(0, 9), 10) === Number(c[9]) && dv(c.slice(0, 10), 11) === Number(c[10]);
}

export function formatarCpf(c: string): string {
  const d = normalizarCpf(c);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : c;
}

export function mascararCpf(final2: string): string {
  return `***.***.***-${final2}`;
}
