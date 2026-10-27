import { paymentStatus, type Student } from "@/components/alunos/studentListModel";
import { spParts } from "@/lib/spTime";
import { matchesStudentSearch } from "@/lib/studentSearch";
import { useEffect, useState } from "react";

type PaymentFilter = "all" | "overdue" | "due_soon" | "upcoming" | "none";
const paymentFilters: readonly string[] = ["all", "overdue", "due_soon", "upcoming", "none"];

export function useStudentListFilters(students: Student[] | undefined, pendingScheduled: { student_id: string }[], initialSearch = "", initialFilters: { payment?: string | null; status?: string | null; evaluation?: string | null } = {}) {
  const requestedPayment = paymentFilters.includes(initialFilters.payment ?? "") ? initialFilters.payment as PaymentFilter : "all";
  const requestedStatus = initialFilters.status === "active" || initialFilters.status === "inactive" ? initialFilters.status : "all";
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  // Navigation can change ?busca= without remounting the student list.
  // Only URL changes should replace text typed directly in the search field.
  useEffect(() => { setSearchTerm(initialSearch); }, [initialSearch]);
  const [statusFilter, setStatusFilter] = useState<string>(requestedStatus);
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>(requestedPayment);
  useEffect(() => { setPaymentFilter(requestedPayment); }, [requestedPayment]);
  useEffect(() => { setStatusFilter(requestedStatus); }, [requestedStatus]);
  const [planFilter, setPlanFilter] = useState<string>("all");
  const requestedFlag = initialFilters.evaluation === "nunca" ? "no_evaluation" : "none";
  const [flagFilter, setFlagFilter] = useState<"none" | "birthday_month" | "no_evaluation" | "pending_messages">(requestedFlag);
  useEffect(() => { setFlagFilter(requestedFlag); }, [requestedFlag]);
  const [sortBy, setSortBy] = useState<"recent" | "name" | "due" | "last_eval">("recent");
  const pendingByStudent = pendingScheduled.reduce((acc: Record<string, number>, m) => {
    acc[m.student_id] = (acc[m.student_id] || 0) + 1;
    return acc;
  }, {});

  const isActive = (s: Student) => s.status === 'active';

  const currentMonth = spParts(new Date()).mo;
  const isBirthdayThisMonth = (s: Student) => {
    if (!s.birth_date) return false;
    const [, mm] = s.birth_date.split("-");
    return Number(mm) - 1 === currentMonth;
  };

  const matchesPayment = (s: Student) => {
    if (paymentFilter === "all") return true;
    if (paymentFilter === "none") return !s.payment_due_date;
    // Inativos não entram em filtros de prazo, igual aos selos e contadores.
    if (!isActive(s)) return false;
    const ps = paymentStatus(s.payment_due_date);
    if (paymentFilter === "overdue") return ps?.key === "overdue";
    if (paymentFilter === "due_soon") return ps?.key === "due_soon";
    if (paymentFilter === "upcoming") return ps?.key === "upcoming";
    return true;
  };

  const matchesFlag = (s: Student) => {
    if (flagFilter === "none") return true;
    if (flagFilter === "birthday_month") return isBirthdayThisMonth(s);
    if (flagFilter === "no_evaluation") return !s.had_evaluation;
    if (flagFilter === "pending_messages") return (pendingByStudent[s.id] || 0) > 0;
    return true;
  };

  const availablePlans = Array.from(
    new Set((students || []).map((s) => s.plan).filter(Boolean) as string[]),
  ).sort();

  const filteredStudents = (students || [])
    .filter(s => {
      const matchesSearch = matchesStudentSearch(s, searchTerm);
      const active = isActive(s);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && active) ||
        (statusFilter === "inactive" && !active);
      const matchesPlan = planFilter === "all" || s.plan === planFilter;
      return matchesSearch && matchesStatus && matchesPlan && matchesPayment(s) && matchesFlag(s);
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "due") {
        const av = a.payment_due_date ? new Date(a.payment_due_date + "T12:00:00").getTime() : Infinity;
        const bv = b.payment_due_date ? new Date(b.payment_due_date + "T12:00:00").getTime() : Infinity;
        return av - bv;
      }
      if (sortBy === "last_eval") {
        const av = a.last_evaluation_date ? new Date(a.last_evaluation_date).getTime() : 0;
        const bv = b.last_evaluation_date ? new Date(b.last_evaluation_date).getTime() : 0;
        return bv - av;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const hasActiveFilters =
    !!searchTerm ||
    statusFilter !== "all" ||
    paymentFilter !== "all" ||
    planFilter !== "all" ||
    flagFilter !== "none" ||
    sortBy !== "recent";

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setPaymentFilter("all");
    setPlanFilter("all");
    setFlagFilter("none");
    setSortBy("recent");
  };

  return {
    searchTerm, setSearchTerm, statusFilter, setStatusFilter,
    paymentFilter, setPaymentFilter, planFilter, setPlanFilter,
    flagFilter, setFlagFilter, sortBy, setSortBy,
    pendingByStudent, isActive, isBirthdayThisMonth,
    availablePlans, filteredStudents, hasActiveFilters, clearFilters,
  };
}
