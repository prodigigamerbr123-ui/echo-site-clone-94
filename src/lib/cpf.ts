// Utilitários de CPF: máscara, remoção de máscara e validação de dígitos.
// Guardamos apenas dígitos no banco (11 chars). Nunca envie CPF em mensagem.

export function unmaskCpf(v: string): string {
  return (v || "").replace(/\D/g, "").slice(0, 11);
}

export function maskCpf(v: string): string {
  const d = unmaskCpf(v);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

/** Mascara parcial para exibição segura: ***.***.789-** */
export function maskCpfDisplay(v: string | null | undefined): string {
  const d = unmaskCpf(v || "");
  if (d.length !== 11) return "";
  return `***.***.${d.slice(6, 9)}-**`;
}

export function isValidCpf(v: string): boolean {
  const cpf = unmaskCpf(v);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (factor - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = calc(cpf.slice(0, 9), 10);
  if (d1 !== Number(cpf[9])) return false;
  const d2 = calc(cpf.slice(0, 10), 11);
  return d2 === Number(cpf[10]);
}
