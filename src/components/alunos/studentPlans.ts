export const PLAN_OPTIONS = [
  "Mensal",
  "Trimestral",
  "Quadrimestral",
  "Semestral",
  "Octomestral",
  "Anual",
  "12 meses",
  "Desconto especial",
  "Desconto especial Taekwondo",
  "Desconto Funcionários AME",
  "Convênio Talento confecções",
];

// Legacy plans remain available when editing existing registrations.
export const REGISTRATION_PLAN_OPTIONS = PLAN_OPTIONS.slice(0, 6);
export const BENEFIT_OPTIONS = PLAN_OPTIONS.slice(7);
