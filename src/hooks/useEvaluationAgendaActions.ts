import { useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { checkEvaluationSchedule, finishEvaluationWithMessages, recoverEvaluationCreation, saveEvaluationWithMessages } from "@/lib/evaluationActions";
import { assertEvaluationIdentity, evaluationUserId, prepareEvaluationIntent } from "@/lib/evaluationIntent";
import type { ScheduleConflictCheck } from "../../supabase/functions/_shared/evaluationConflicts";

export function useEvaluationAgendaActions() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const invalidate = () => {
    void Promise.all([
      qc.invalidateQueries({ queryKey: ["automation-settings"] }),
      qc.invalidateQueries({ queryKey: ["evaluations-list"] }),
      qc.invalidateQueries({ queryKey: ["evaluations-history"] }),
      qc.invalidateQueries({ queryKey: ["students-evaluation-agenda"] }),
      qc.invalidateQueries({ queryKey: ["today-evaluations"] }),
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] }),
    ]);
  };

  const exclusive = async <T,>(action: () => Promise<T>): Promise<T> => {
    if (busy.current) throw new Error("Há uma operação em andamento. Aguarde sua conclusão");
    busy.current = true;
    setSaving(true);
    try {
      return await action();
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  // Lock covers lookup and the user's conflict decision as well as the write.
  const schedule = async (
    studentId: string, name: string, when: Date, notes: string | null,
    evaluationId: string | undefined,
    approve: (check: ScheduleConflictCheck) => Promise<boolean | null>,
  ) => exclusive(async () => {
    const actor = { userId: await evaluationUserId() };
    const intent = evaluationId ? undefined : await prepareEvaluationIntent(studentId, when, notes);
    await assertEvaluationIdentity(actor);
    if (intent) {
      const recovered = await recoverEvaluationCreation(intent, studentId, when, notes);
      if (recovered) { invalidate(); return recovered; }
    }
    const check = await checkEvaluationSchedule(studentId, when.toISOString(), evaluationId);
    const allowConflict = await approve(check);
    if (allowConflict === null) return null;
    await assertEvaluationIdentity(actor);
    const result = await saveEvaluationWithMessages(studentId, name, when, notes, evaluationId, allowConflict, intent);
    invalidate();
    return result;
  });

  const finish = async (...args: Parameters<typeof finishEvaluationWithMessages>) => exclusive(async () => {
    const result = await finishEvaluationWithMessages(...args);
    invalidate();
    return result;
  });

  return { saving, schedule, finish, invalidate };
}
