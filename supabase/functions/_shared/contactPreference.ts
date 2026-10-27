import { formatPhone } from "./phone.ts";

type ContactPage = { data: { phone: string }[] | null; error: unknown };

/** The diagnostic endpoint has a phone, not a student ID. Respect any matching refusal. */
export async function diagnosticContactBlocked(
  number: string,
  loadPage: (from: number, to: number) => PromiseLike<ContactPage>,
): Promise<boolean> {
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error || !data) throw new Error("Não foi possível confirmar a preferência de contato");
    if (data.some(student => {
      const phone = formatPhone(student.phone);
      return phone.ok && phone.number === number;
    })) return true;
    if (data.length < pageSize) return false;
  }
}
