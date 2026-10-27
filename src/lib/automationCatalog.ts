import { DEFAULT_EVALUATION_DAYS_OVERDUE } from "@/lib/evaluationDue";

// Único padrão para a tela e para o agendamento (antes: 30 na tela, 20 no código).
export const DEFAULT_REENGAGEMENT_DAYS = 30;

type ParamDef = { name: string; label: string; fallback: number; suffix?: string };

type MessageTypeDef = { type: string; label: string };

export type AutomationDef = {
  key: string;
  title: string;
  description: string;
  when: string;
  messageTypes: MessageTypeDef[];
  placeholders: string[];
  params?: ParamDef[];
};

export const AUTOMATIONS: AutomationDef[] = [
  {
    key: "evaluation_invite",
    title: "Convite para avaliação física",
    description: "Envia lembretes para alunos que ainda não fizeram avaliação física.",
    when: "Diariamente pela manhã, para alunos sem avaliação há X dias.",
    messageTypes: [{ type: "evaluation_reminder", label: "Convite de avaliação" }],
    placeholders: ["{nome}"],
    params: [
      { name: "days_overdue", label: "Dias sem avaliação", fallback: DEFAULT_EVALUATION_DAYS_OVERDUE, suffix: "dias" },

      { name: "min_interval_days", label: "Intervalo mín. entre envios (mesmo aluno)", fallback: 14, suffix: "dias" },
      { name: "max_attempts", label: "Máx. de tentativas por aluno", fallback: 3, suffix: "envios" },
    ],
  },
  {
    key: "birthday",
    title: "Mensagem de aniversário",
    description: "Parabeniza o aluno no dia do aniversário.",
    when: "Todo dia pela manhã, para aniversariantes do dia.",
    messageTypes: [{ type: "birthday", label: "Aniversário" }],
    placeholders: ["{nome}"],
  },
  {
    key: "evaluation_reminders",
    title: "Lembretes de avaliação agendada",
    description: "Confirmação e lembretes automáticos antes da avaliação.",
    when: "Ao agendar, no dia anterior e no dia da avaliação.",
    messageTypes: [
      { type: "evaluation_confirmation", label: "Confirmação (ao agendar)" },
      { type: "evaluation_reminder_1d", label: "Lembrete véspera" },
      { type: "evaluation_reminder_day", label: "Lembrete no dia" },
    ],
    placeholders: ["{nome}", "{data}", "{hora}"],
  },
  {
    key: "evaluation_followup",
    title: "Follow-up pós-avaliação",
    description: "Mensagem de acompanhamento após a avaliação realizada.",
    when: "X dias após a avaliação concluída.",
    messageTypes: [{ type: "evaluation_followup", label: "Follow-up" }],
    placeholders: ["{nome}"],
    params: [{ name: "days_after", label: "Dias após avaliação", fallback: 7, suffix: "dias" }],
  },
  {
    key: "no_show_reschedule",
    title: "Reagendamento por falta",
    description: "Convida o aluno a reagendar quando não comparece.",
    when: "Ao marcar uma avaliação como não comparecida.",
    messageTypes: [{ type: "evaluation_reschedule", label: "Reagendamento" }],
    placeholders: ["{nome}"],
  },
  {
    key: "welcome_message",
    title: "Mensagem de boas-vindas",
    description: "Envia uma boas-vindas para alunos recém-cadastrados.",
    when: "Logo após o cadastro do aluno.",
    messageTypes: [{ type: "welcome", label: "Boas-vindas" }],
    placeholders: ["{nome}"],
  },
  {
    key: "reengagement",
    title: "Reengajamento de alunos inativos",
    description: "Convida o aluno a voltar, uma única vez, depois que ele é marcado como inativo.",
    when: "X dias depois de marcar o aluno como inativo. Não é enviada se ele voltar a ficar ativo antes.",
    messageTypes: [{ type: "reengagement", label: "Reengajamento" }],
    placeholders: ["{nome}"],
    params: [{ name: "days_after", label: "Enviar após inativar", fallback: DEFAULT_REENGAGEMENT_DAYS, suffix: "dias" }],
  },
  {
    key: "payment_reminder",
    title: "Lembrete de vencimento da mensalidade",
    description: "Avisa o aluno 3 dias antes e no dia do vencimento da mensalidade.",
    when: "Diariamente, 3 dias antes do vencimento e no próprio dia.",
    messageTypes: [
      { type: "payment_reminder_before", label: "Aviso antecipado" },
      { type: "payment_reminder_due", label: "Aviso no dia" },
    ],
    placeholders: ["{nome}", "{dias}"],
  },
  {
    key: "payment_overdue",
    title: "Cobrança de mensalidade vencida",
    description: "Envia cobrança para alunos ativos com mensalidade em atraso, até o limite de cobranças por vencimento.",
    when: "Diariamente, respeitando o intervalo entre cobranças. Para depois do limite até a data de vencimento ser atualizada; acima de 30 dias o texto diz \"mais de 30 dias\".",
    messageTypes: [
      { type: "payment_overdue", label: "Cobrança de vencido" },
    ],
    placeholders: ["{nome}", "{dias}"],
    params: [
      { name: "days_after_due", label: "Enviar a partir de", fallback: 1, suffix: "dias em atraso" },
      { name: "repeat_every_days", label: "Repetir a cada", fallback: 7, suffix: "dias" },
      { name: "max_attempts", label: "Máx. de cobranças por vencimento", fallback: 3, suffix: "envios" },
    ],
  },
];

export const ALL_AUTO_TYPES = Array.from(
  new Set(AUTOMATIONS.flatMap((a) => a.messageTypes.map((m) => m.type))),
);

export type PredefinedMsg = { id: string; title: string; content: string };
