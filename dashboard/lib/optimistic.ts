import { isSpendingCategory } from "./categories";
import { budgetStatus } from "./derive";
import { dateStr, num } from "./format";
import type { CategorySummary, DashboardOverview, TransactionRow } from "./types";

// Client-side mirror of how a single transaction feeds the category summaries, used to
// update totals immediately while the write is still running. The server refetch that
// follows is the source of truth and replaces whatever this computes.

export interface SpendState {
  category: string | null;
  detailed: string | null;
  ignored: boolean;
}

export interface SpendDelta {
  category: string;
  detailed: string | null;
  amount: number;
}

// Effective state of a transaction as the lists report it: a tagged transaction has no
// detailed category.
export function currentState(t: TransactionRow): SpendState {
  return {
    category: t.pfc_primary ?? null,
    detailed: t.is_tagged ? null : t.pfc_detailed ?? null,
    ignored: t.is_ignored,
  };
}

// State after tagging (category) or clearing the tag (null, back to the original category).
export function taggedState(t: TransactionRow, category: string | null): SpendState {
  return category
    ? { category, detailed: null, ignored: t.is_ignored }
    : {
        category: t.original_pfc_primary ?? t.pfc_primary ?? null,
        detailed: t.original_pfc_detailed ?? null,
        ignored: t.is_ignored,
      };
}

export function transactionMonth(t: TransactionRow): string | null {
  return dateStr(t.transaction_date)?.slice(0, 7) ?? null;
}

function contribution(state: SpendState, amount: number, sign: 1 | -1): SpendDelta | null {
  if (state.ignored || !state.category || !isSpendingCategory(state.category)) return null;
  return { category: state.category, detailed: state.detailed, amount: sign * amount };
}

export function spendDeltas(t: TransactionRow, after: SpendState): SpendDelta[] {
  const amount = num(t.amount);
  return [
    contribution(currentState(t), amount, -1),
    contribution(after, amount, 1),
  ].filter((d): d is SpendDelta => d !== null);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function applySpendDeltas(
  summaries: CategorySummary[],
  budgets: Map<string, number>,
  deltas: SpendDelta[]
): CategorySummary[] {
  const map = new Map(
    summaries.map((s) => [s.category, { ...s, detailed: s.detailed.map((d) => ({ ...d })) }])
  );
  for (const { category, detailed, amount } of deltas) {
    let entry = map.get(category);
    if (!entry) {
      entry = {
        category,
        spent: 0,
        budget: budgets.get(category) ?? null,
        status: "none",
        detailed: [],
      };
      map.set(category, entry);
    }
    entry.spent = round2(entry.spent + amount);
    if (detailed) {
      const d = entry.detailed.find((x) => x.name === detailed);
      if (d) d.spent = round2(d.spent + amount);
      else entry.detailed.push({ name: detailed, spent: round2(amount) });
    }
  }
  // Same rules as the server: only categories with positive net spend are listed.
  return [...map.values()]
    .filter((e) => e.spent > 0)
    .map((e) => ({
      ...e,
      detailed: e.detailed.filter((d) => d.spent > 0).sort((a, b) => b.spent - a.spent),
      status: budgetStatus(e.spent, e.budget),
    }))
    .sort((a, b) => b.spent - a.spent);
}

// The overview total is the sum of the listed category spend, as on the server.
export function overviewFromSummaries(
  o: DashboardOverview,
  summaries: CategorySummary[]
): DashboardOverview {
  const totalSpent = round2(summaries.reduce((sum, s) => sum + s.spent, 0));
  const hasBudget = o.budget !== null && o.budget > 0;
  return {
    ...o,
    totalSpent,
    remaining: hasBudget ? o.budget! - totalSpent : null,
    momDeltaPct: o.prevSpent > 0 ? ((totalSpent - o.prevSpent) / o.prevSpent) * 100 : null,
    dailyPace: o.daysElapsed > 0 ? totalSpent / o.daysElapsed : totalSpent,
    usedRatio: hasBudget ? totalSpent / o.budget! : 0,
    status: budgetStatus(totalSpent, hasBudget ? o.budget : null),
  };
}
