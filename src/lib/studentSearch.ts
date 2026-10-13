interface SearchableStudent {
  name: string;
  phone: string | null;
  cpf: string | null;
}

const normalizeText = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

/** Name searches are textual; phone and CPF searches only run for numeric input. */
export function matchesStudentSearch(student: SearchableStudent, search: string): boolean {
  const term = search.trim();
  if (!term) return true;

  if (normalizeText(student.name).includes(normalizeText(term))) return true;

  // An empty digit string matches every CPF; never use it as a search term.
  if (!/^[\d\s()+.\-]+$/.test(term)) return false;
  const digits = term.replace(/\D/g, "");
  if (!digits) return false;

  return (student.phone ?? "").replace(/\D/g, "").includes(digits)
    || (student.cpf ?? "").replace(/\D/g, "").includes(digits);
}
