import { MessageRecipientPicker } from "@/components/mensagens/MessageRecipientPicker";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(cleanup);
it("keeps blocked recipients visible and prevents selecting them", () => {
  const toggle = vi.fn();
  render(<MessageRecipientPicker filteredStudents={[
    { id: "a", name: "Ana", phone: "fixture", had_evaluation: false, messages_enabled: false },
    { id: "b", name: "Bruno", phone: "fixture", had_evaluation: false, messages_enabled: true },
  ]} selectedStudents={[]} searchTerm="" setSearchTerm={vi.fn()} allVisibleSelected={false} handleSelectAll={vi.fn()} handleStudentToggle={toggle} inactiveCount={0} showInactive={false} setShowInactive={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: "Selecionar Ana" })).toBeDisabled();
  expect(screen.getByText("Mensagens desativadas")).toBeVisible();
  fireEvent.click(screen.getByText("Ana"));
  expect(toggle).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Bruno"));
  expect(toggle).toHaveBeenCalledWith("b");
});
