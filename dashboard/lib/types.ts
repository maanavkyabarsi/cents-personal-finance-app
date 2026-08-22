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
  transaction_name: string | null;
  merchant_name?: string | null;
  amount: BqNumber;
  transaction_date: BqDate;
  pfc_primary?: string | null;
  pfc_detailed?: string | null;
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

export type ViewId = "overview" | "categories" | "budgets";
