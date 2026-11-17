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

// True for a transaction in an event that is kept separate from the monthly totals. The
// server treats it like an ignored one for totals, so the optimistic math must too.
export function inSeparateEvent(t: TransactionRow): boolean {
  return !!t.event_id && t.event_counted === false;
}

// Effective state of a transaction as the lists report it: a tagged transaction has no
// detailed category.
export function currentState(t: TransactionRow): SpendState {
  return {
    category: t.pfc_primary ?? null,
    detailed: t.is_tagged ? null : t.pfc_detailed ?? null,
    ignored: t.is_ignored || inSeparateEvent(t),
  };
}

// State after tagging (category) or clearing the tag (null, back to the original category).
export function taggedState(t: TransactionRow, category: string | null): SpendState {
  const ignored = t.is_ignored || inSeparateEvent(t);
  return category
    ? { category, detailed: null, ignored }
    : {
        category: t.original_pfc_primary ?? t.pfc_primary ?? null,
        detailed: t.original_pfc_detailed ?? null,
        ignored,
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

// ---------------------------------------------------------------------------
// Pending writes
//
// A write takes a few seconds to land in BigQuery. Any list or total fetched during that
// window comes back without it, so reopening a drawer or switching month would briefly show
// the old state. PendingWrites remembers each write and layers it back over such results.
// A fetch that started after a write finished already sees it, so only fetches that began
// before `doneAt` (or while the write is still running) are patched.

interface PendingWrite {
  original: TransactionRow; // state before the first write in this window
  patched: TransactionRow; // state after the latest write
  after: SpendState;
  accountId: string | null; // account filter the row was seen under
  doneAt: number | null; // null while the request is in flight
}

const KEEP_MS = 60_000;

export class PendingWrites {
  private entries = new Map<string, PendingWrite>();

  begin(original: TransactionRow, patched: TransactionRow, after: SpendState, accountId: string | null) {
    const prev = this.entries.get(original.transaction_id);
    const stillOpen = prev !== undefined && prev.doneAt === null;
    this.entries.set(original.transaction_id, {
      original: stillOpen ? prev.original : original,
      patched,
      after,
      accountId,
      doneAt: null,
    });
  }

  finish(id: string) {
    const e = this.entries.get(id);
    if (e) e.doneAt = Date.now();
  }

  fail(id: string) {
    this.entries.delete(id);
  }

  private relevant(startedAt: number): PendingWrite[] {
    const now = Date.now();
    const out: PendingWrite[] = [];
    for (const [id, e] of this.entries) {
      if (e.doneAt !== null && now - e.doneAt > KEEP_MS) this.entries.delete(id);
      else if (e.doneAt === null || e.doneAt >= startedAt) out.push(e);
    }
    return out;
  }

  hasRelevant(startedAt: number) {
    return this.relevant(startedAt).length > 0;
  }

  // Rows for one category + month (the drawer). Drops rows that moved elsewhere, adds rows
  // that moved in, and updates rows whose ignored/tag state changed.
  overlayCategoryRows(
    rows: TransactionRow[],
    target: { category: string; month: string; accountId: string | null },
    startedAt: number
  ): TransactionRow[] {
    const writes = this.relevant(startedAt);
    if (writes.length === 0) return rows;
    const byId = new Map(rows.map((r) => [r.transaction_id, r]));
    for (const w of writes) {
      if (transactionMonth(w.patched) !== target.month.slice(0, 7)) continue;
      const belongs =
        w.patched.pfc_primary === target.category &&
        (target.accountId === null || target.accountId === w.accountId);
      if (belongs) byId.set(w.patched.transaction_id, w.patched);
      else byId.delete(w.patched.transaction_id);
    }
    return [...byId.values()];
  }

  // The recent list only shows rows that already exist, so just update them in place.
  overlayRows(rows: TransactionRow[], startedAt: number): TransactionRow[] {
    const writes = this.relevant(startedAt);
    if (writes.length === 0) return rows;
    const byId = new Map(writes.map((w) => [w.patched.transaction_id, w.patched]));
    return rows.map((r) => byId.get(r.transaction_id) ?? r);
  }

  overlaySummaries(
    summaries: CategorySummary[],
    budgets: Map<string, number>,
    month: string,
    accountId: string | null,
    startedAt: number
  ): CategorySummary[] {
    const deltas = this.relevant(startedAt)
      .filter(
        (w) =>
          transactionMonth(w.original) === month.slice(0, 7) &&
          (accountId === null || accountId === w.accountId)
      )
      .flatMap((w) => spendDeltas(w.original, w.after));
    return deltas.length ? applySpendDeltas(summaries, budgets, deltas) : summaries;
  }
}
