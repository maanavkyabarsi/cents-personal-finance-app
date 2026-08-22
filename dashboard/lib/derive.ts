export type BudgetStatus = "under" | "warning" | "high" | "over" | "none";

export function budgetStatus(spent: number, budget: number | null): BudgetStatus {
  if (budget === null || budget <= 0) return "none";
  const ratio = spent / budget;
  if (ratio > 1) return "over";
  if (ratio >= 0.9) return "high";
  if (ratio >= 0.65) return "warning";
  return "under";
}

export function monthProgress(monthKey: string): {
  daysElapsed: number;
  daysLeft: number;
  inMonth: boolean;
} {
  const [y, m] = monthKey.split("-").map(Number);
  const daysInMonth = y && m ? new Date(y, m, 0).getDate() : 30;
  const now = new Date();
  const isCurrent = now.getFullYear() === y && now.getMonth() + 1 === m;
  if (isCurrent) {
    const day = now.getDate();
    return { daysElapsed: day, daysLeft: daysInMonth - day, inMonth: true };
  }
  return { daysElapsed: daysInMonth, daysLeft: 0, inMonth: false };
}
