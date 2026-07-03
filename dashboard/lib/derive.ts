import { isSpendingCategory } from "./categories";
import { monthKey, monthLabel, num } from "./format";
import type { CategorySummary, MonthPoint, SpendingRow } from "./types";

export function availableMonths(rows: SpendingRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const k = monthKey(r.month);
    if (k) set.add(k);
  }
  return [...set].sort();
}

export function monthlyTotals(rows: SpendingRow[]): MonthPoint[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    if (!isSpendingCategory(r.primary_category)) continue;
    const k = monthKey(r.month);
    if (!k) continue;
    const amt = num(r.total_spending);
    if (amt <= 0) continue;
    totals.set(k, (totals.get(k) ?? 0) + amt);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, spent]) => ({ key, label: monthLabel(key), spent }));
}

export function categorySummaries(
  rows: SpendingRow[],
  month: string
): CategorySummary[] {
  const map = new Map<string, CategorySummary>();

  for (const r of rows) {
    if (monthKey(r.month) !== month) continue;
    if (!isSpendingCategory(r.primary_category)) continue;
    const amt = num(r.total_spending);
    if (amt <= 0) continue;

    const cat = r.primary_category ?? "UNCATEGORIZED";
    let entry = map.get(cat);
    if (!entry) {
      entry = { category: cat, spent: 0, budget: null, detailed: [] };
      map.set(cat, entry);
    }
    entry.spent += amt;

    const limit = num(r.budget_limit);
    if (r.budget_limit !== null && limit > 0) entry.budget = limit;

    if (r.detailed_category) {
      const existing = entry.detailed.find((d) => d.name === r.detailed_category);
      if (existing) existing.spent += amt;
      else entry.detailed.push({ name: r.detailed_category, spent: amt });
    }
  }

  const list = [...map.values()];
  for (const e of list) e.detailed.sort((a, b) => b.spent - a.spent);
  return list.sort((a, b) => b.spent - a.spent);
}

export function budgetByCategory(rows: SpendingRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.primary_category) continue;
    const limit = num(r.budget_limit);
    if (r.budget_limit !== null && limit > 0) out.set(r.primary_category, limit);
  }
  return out;
}

export function allSpendingCategories(rows: SpendingRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.primary_category && isSpendingCategory(r.primary_category)) {
      set.add(r.primary_category);
    }
  }
  return [...set].sort();
}

export type BudgetStatus = "under" | "warning" | "over" | "none";

export function budgetStatus(spent: number, budget: number | null): BudgetStatus {
  if (budget === null || budget <= 0) return "none";
  const ratio = spent / budget;
  if (ratio > 1) return "over";
  if (ratio >= 0.85) return "warning";
  return "under";
}
