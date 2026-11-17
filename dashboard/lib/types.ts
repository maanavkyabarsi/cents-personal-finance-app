import type { BudgetStatus } from "./derive";

export type BqDate = string | { value: string } | null;
export type BqNumber = number | string | { value: string } | null;

export interface SpendingRow {
  primary_category: string | null;
  detailed_category: string | null;
  total_spending: BqNumber;
  month: BqDate;
  account_id: string | null;
  budget_limit: BqNumber;
  budget_updated_at: BqDate;
}

export interface TransactionRow {
  transaction_id: string;
  is_ignored: boolean;
  transaction_name: string | null;
  merchant_name?: string | null;
  amount: BqNumber;
  transaction_date: BqDate;
  pfc_primary?: string | null;
  pfc_detailed?: string | null;
  original_pfc_primary?: string | null;
  original_pfc_detailed?: string | null;
  is_tagged?: boolean;
  // Set when the transaction belongs to an event. event_counted = the event also counts
  // toward monthly totals; false means it is kept separate (not in the totals).
  event_id?: string | null;
  event_name?: string | null;
  event_counted?: boolean | null;
}

export interface CategorySummary {
  category: string;
  spent: number;
  budget: number | null;
  status: BudgetStatus;
  detailed: { name: string; spent: number }[];
}

export interface MonthPoint {
  key: string;
  label: string;
  spent: number;
}

export interface DashboardOverview {
  totalSpent: number;
  budget: number | null;
  remaining: number | null;
  momDeltaPct: number | null;
  prevMonthKey: string | null;
  prevSpent: number;
  dailyPace: number;
  usedRatio: number;
  status: BudgetStatus;
  daysElapsed: number;
  daysLeft: number;
  inMonth: boolean;
}

export interface Account {
  account_id: string;
  display_name: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
}

export type ViewId = "overview" | "categories" | "budgets" | "events";

export interface EventInput {
  name: string;
  start_date: string;
  end_date: string | null;
  account_ids: string[];
  count_in_totals: boolean;
}

export interface EventRecord {
  event_id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  account_ids: string[];
  count_in_totals: boolean;
  live: boolean;
  transaction_count: number;
  total: number;
}

export interface EventTransaction extends TransactionRow {
  is_override: boolean;
}

export interface EventDetail {
  event: EventRecord;
  categories: { category: string; spent: number }[];
  daily: { date: string; spent: number }[];
  transactions: EventTransaction[];
}
