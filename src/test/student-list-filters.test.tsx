import { useStudentListFilters } from "@/hooks/useStudentListFilters";
import { paymentStatus, type Student } from "@/components/alunos/studentListModel";
import { StudentQuickFilters } from "@/components/alunos/StudentQuickFilters";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.useRealTimers());

describe("student search controlled by navigation", () => {
  it("updates when a new URL search arrives without remounting the list", () => {
    const { result, rerender } = renderHook(({ fromUrl }) => useStudentListFilters([], [], fromUrl), {
      initialProps: { fromUrl: "Maria" },
    });
    expect(result.current.searchTerm).toBe("Maria");
    act(() => result.current.setSearchTerm("Busquei manualmente"));
    rerender({ fromUrl: "Maria" });
    expect(result.current.searchTerm).toBe("Busquei manualmente");
    rerender({ fromUrl: "João" });
    expect(result.current.searchTerm).toBe("João");
    rerender({ fromUrl: "" });
    expect(result.current.searchTerm).toBe("");
  });
});

describe("student due-date status", () => {
  it("classifies dates including today without claiming a payment was received", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
    expect(paymentStatus("2026-10-17")).toMatchObject({ key: "overdue", label: "Prazo vencido" });
    expect(paymentStatus("2026-10-18")).toMatchObject({ key: "due_soon", label: "Vence hoje" });
    expect(paymentStatus("2026-10-21")).toMatchObject({ key: "due_soon", label: "Vence em 3d" });
    expect(paymentStatus("2026-10-22")).toMatchObject({ key: "upcoming", label: "Vencimento futuro" });
    expect(paymentStatus(null)).toBeNull();
  });

  it("filters by stable due-date keys even when the label changes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
    const students = [
      { id: "late", payment_due_date: "2026-10-17" },
      { id: "today", payment_due_date: "2026-10-18" },
      { id: "soon", payment_due_date: "2026-10-21" },
      { id: "future", payment_due_date: "2026-10-22" },
      { id: "no-date", payment_due_date: null },
    ].map((student) => ({ ...student, name: student.id, status: "active", phone: "43999990000", created_at: "2026-01-01T00:00:00Z" })) as Student[];
    const { result } = renderHook(() => useStudentListFilters(students, []));
    act(() => result.current.setPaymentFilter("due_soon"));
    expect(result.current.filteredStudents.map((student) => student.id)).toEqual(["today", "soon"]);
    act(() => result.current.setPaymentFilter("overdue"));
    expect(result.current.filteredStudents.map((student) => student.id)).toEqual(["late"]);
    act(() => result.current.setPaymentFilter("upcoming"));
    expect(result.current.filteredStudents.map((student) => student.id)).toEqual(["future"]);
    act(() => result.current.setPaymentFilter("none"));
    expect(result.current.filteredStudents.map((student) => student.id)).toEqual(["no-date"]);
  });
});

describe("never-evaluated shortcut", () => {
  it("lists the same active students that its count reports", () => {
    const students = [
      { id: "active-new", status: "active", had_evaluation: false },
      { id: "inactive-new", status: "inactive", had_evaluation: false },
      { id: "active-evaluated", status: "active", had_evaluation: true },
    ].map((student) => ({ ...student, name: student.id, phone: "43999990000", payment_due_date: null, created_at: "2026-01-01T00:00:00Z" })) as Student[];
    const { result } = renderHook(() => useStudentListFilters(students, []));
    const { rerender } = render(<StudentQuickFilters students={students} {...result.current} />);
    expect(screen.getByRole("button", { name: /Nunca avaliados/ })).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: /Nunca avaliados/ }));
    expect(result.current.filteredStudents.map((student) => student.id)).toEqual(["active-new"]);
    rerender(<StudentQuickFilters students={students} {...result.current} />);
    fireEvent.click(screen.getByRole("button", { name: /Nunca avaliados/ }));
    expect(result.current.filteredStudents).toHaveLength(3);
  });

  it("opens the same list from the dashboard link", () => {
    const students = [
      { id: "active-new", status: "active", had_evaluation: false },
      { id: "inactive-new", status: "inactive", had_evaluation: false },
    ].map((student) => ({ ...student, name: student.id, phone: "43999990000", payment_due_date: null, created_at: "2026-01-01T00:00:00Z" })) as Student[];
    const { result } = renderHook(() => useStudentListFilters(students, [], "", { status: "active", evaluation: "nunca" }));
    expect(result.current.filteredStudents.map((student) => student.id)).toEqual(["active-new"]);
  });
});

describe("due dates of inactive students", () => {
  it("are not tracked by due-date filters", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
    const students = [
      { id: "active-late", status: "active" },
      { id: "inactive-late", status: "inactive" },
    ].map((student) => ({ ...student, name: student.id, phone: "43999990000", payment_due_date: "2026-10-01", created_at: "2026-01-01T00:00:00Z" })) as Student[];
    const { result } = renderHook(() => useStudentListFilters(students, []));
    act(() => result.current.setPaymentFilter("overdue"));
    expect(result.current.filteredStudents.map((student) => student.id)).toEqual(["active-late"]);
  });
});
