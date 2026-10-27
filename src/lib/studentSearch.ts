interface SearchableStudent {
  name?: string | null;
  phone?: string | null;
  cpf?: string | null;
}

const normalizeText = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

export function matchesSearchText(value: string | null | undefined, search: string): boolean {
  return normalizeText(value ?? "").includes(normalizeText(search));
}

const nationalPhoneDigits = (digits: string) =>
  /^55\d{10,11}$/.test(digits) ? digits.slice(2) : digits;

/** Name searches are textual; phone and CPF searches only run for numeric input. */
export function matchesStudentSearch(student: SearchableStudent | null | undefined, search: string): boolean {
  const term = search.trim();
  if (!term) return true;

  if (matchesSearchText(student?.name, term)) return true;

  // An empty digit string matches every CPF; never use it as a search term.
  if (!/^[\d\s()+.-]+$/.test(term)) return false;
  const digits = term.replace(/\D/g, "");
  if (!digits) return false;

  const phone = nationalPhoneDigits((student?.phone ?? "").replace(/\D/g, ""));
  return phone.includes(nationalPhoneDigits(digits))
    || (student?.cpf ?? "").replace(/\D/g, "").includes(digits);
}
