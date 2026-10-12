export type StaffRole = "admin" | "recepcao" | "avaliador";

export const ALL_STAFF: readonly StaffRole[] = ["admin", "recepcao", "avaliador"];
export const FRONT_DESK: readonly StaffRole[] = ["admin", "recepcao"];
export const ADMIN_ONLY: readonly StaffRole[] = ["admin"];

export function hasRole(role: StaffRole | null, allowed: readonly StaffRole[]): boolean {
  return role !== null && allowed.includes(role);
}

export function canVisit(role: StaffRole | null, path: string): boolean {
  const adminRoutes = ["/whatsapp", "/automacoes", "/configuracoes"];
  const frontDeskRoutes = ["/cadastrar-aluno", "/mensagens", "/caixa-de-saida", "/assistente-ia"];
  if (adminRoutes.includes(path)) return hasRole(role, ADMIN_ONLY);
  if (frontDeskRoutes.includes(path)) return hasRole(role, FRONT_DESK);
  return hasRole(role, ALL_STAFF);
}
