import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AutomationCard } from "@/components/automacoes/AutomationCard";
import { AUTOMATIONS } from "@/lib/automationCatalog";

it("blocks fractional and empty limits, then saves a corrected integer", () => {
  const save = vi.fn();
  render(<AutomationCard def={AUTOMATIONS.find(def => def.key === "payment_overdue")!}
    settings={{ payment_overdue: { key: "payment_overdue", enabled: true, params: {} } }}
    predefined={[]} perTypeCounts={{}} onToggle={vi.fn()} onSaveParams={save}
    onLinkTemplate={vi.fn()} onCreateNew={vi.fn()} onPreview={vi.fn()} saving={false} />);
  const input = screen.getByLabelText("Máx. de cobranças por vencimento");
  const button = screen.getByRole("button", { name: "Salvar parâmetros" });
  fireEvent.change(input, { target: { value: "3.5" } });
  expect(screen.getByRole("alert")).toHaveTextContent("número inteiro");
  expect(button).toBeDisabled();
  fireEvent.change(input, { target: { value: "" } });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "4" } });
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(button);
  expect(save).toHaveBeenCalledWith({ days_after_due: 1, repeat_every_days: 7, max_attempts: 4 });
});
