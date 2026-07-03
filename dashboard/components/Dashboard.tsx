"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  allSpendingCategories,
  availableMonths,
  budgetByCategory,
  categorySummaries,
  monthlyTotals,
} from "@/lib/derive";
import { num } from "@/lib/format";
import type { Account, SpendingRow, TransactionRow, ViewId } from "@/lib/types";
import { monthKey } from "@/lib/format";
import { isSpendingCategory } from "@/lib/categories";
import { BottomNav, Sidebar } from "./Sidebar";
import { PageHeader, TopStrip, type AccountOption } from "./Topbar";
import { Toast, type ToastState } from "./Toast";
import { TransactionsDrawer, type DrawerTarget } from "./TransactionsDrawer";
import { Alert } from "./icons";
import { Button, Card, EmptyState, Skeleton } from "./primitives";
import { OverviewView } from "./views/OverviewView";
import { CategoriesView } from "./views/CategoriesView";
import { BudgetsView } from "./views/BudgetsView";

const VIEW_META: Record<ViewId, { title: string }> = {
  overview: { title: "Overview" },
  categories: { title: "Categories" },
  budgets: { title: "Budgets" },
};

export function Dashboard() {
  const [rows, setRows] = useState<SpendingRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [view, setView] = useState<ViewId>("overview");
  const [month, setMonth] = useState<string>("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [recent, setRecent] = useState<{
    key: string;
    rows: TransactionRow[];
  } | null>(null);
  const [overallBudget, setOverallBudget] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);

  const load = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setRefreshing(true);
    try {
      const res = await fetch("/api/spending");
      if (!res.ok) throw new Error();
      const data: SpendingRow[] = await res.json();
      setRows(Array.isArray(data) ? data : []);
      setLoadError(false);
    } catch {
      setLoadError(true);
      setRows((r) => r ?? []);
    } finally {
      if (showSpinner) setRefreshing(false);
    }
  }, []);

  const loadOverall = useCallback(async () => {
    try {
      const res = await fetch("/api/budget/overall");
      if (!res.ok) throw new Error();
      const data: { budget_limit: unknown } = await res.json();
      const limit = num(data.budget_limit as never);
      setOverallBudget(limit > 0 ? limit : null);
    } catch {}
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      if (!res.ok) throw new Error();
      const data: Account[] = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  useEffect(() => {
    load(false);
    loadOverall();
    loadAccounts();
    setTheme(
      document.documentElement.classList.contains("dark") ? "dark" : "light"
    );
  }, [load, loadOverall, loadAccounts]);

  const months = useMemo(() => availableMonths(rows ?? []), [rows]);

  const effectiveMonth = useMemo(() => {
    if (month && months.includes(month)) return month;
    return months.length ? months[months.length - 1] : "";
  }, [month, months]);

  const scopedRows = useMemo(() => {
    const base = rows ?? [];
    return accountId ? base.filter((r) => r.account_id === accountId) : base;
  }, [rows, accountId]);

  const accountMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accounts) if (a.display_name) m.set(a.account_id, a.display_name);
    return m;
  }, [accounts]);

  const accountOptions = useMemo<AccountOption[]>(() => {
    const ids = new Set<string>();
    for (const r of rows ?? []) if (r.account_id) ids.add(r.account_id);
    return [...ids]
      .map((id) => ({ id, label: accountMap.get(id) ?? `Account …${id.slice(-4)}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, accountMap]);

  const points = useMemo(() => monthlyTotals(scopedRows), [scopedRows]);
  const summaries = useMemo(
    () => (effectiveMonth ? categorySummaries(scopedRows, effectiveMonth) : []),
    [scopedRows, effectiveMonth]
  );
  const budgets = useMemo(() => budgetByCategory(rows ?? []), [rows]);
  const allCategories = useMemo(
    () => allSpendingCategories(rows ?? []),
    [rows]
  );
  const spentByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of scopedRows) {
      if (monthKey(r.month) !== effectiveMonth) continue;
      if (!isSpendingCategory(r.primary_category) || !r.primary_category) continue;
      const amt = num(r.total_spending);
      if (amt <= 0) continue;
      m.set(r.primary_category, (m.get(r.primary_category) ?? 0) + amt);
    }
    return m;
  }, [scopedRows, effectiveMonth]);

  const recentKey = `${effectiveMonth}__${accountId ?? ""}`;

  useEffect(() => {
    if (!effectiveMonth) return;
    let cancelled = false;
    const url = `/api/transactions/recent?month_year=${effectiveMonth}${
      accountId ? `&account_id=${encodeURIComponent(accountId)}` : ""
    }`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: TransactionRow[]) => {
        if (!cancelled)
          setRecent({ key: recentKey, rows: Array.isArray(data) ? data : [] });
      })
      .catch(() => {
        if (!cancelled) setRecent({ key: recentKey, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveMonth, accountId, recentKey]);

  const recentRows = recent && recent.key === recentKey ? recent.rows : null;

  function setThemeMode(next: "light" | "dark") {
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("fp-theme", next);
    } catch {}
  }

  const handleSave = useCallback(
    async (category: string, limit: number, isNew: boolean) => {
      try {
        const res = await fetch("/api/budget_limits", {
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            primary_category: category,
            budget_limit: limit,
          }),
        });
        if (!res.ok) throw new Error();
        await load(false);
        setToast({
          id: Date.now(),
          message: `${prettyLabel(category)} budget saved`,
          tone: "success",
        });
        return true;
      } catch {
        setToast({
          id: Date.now(),
          message: "Couldn't save budget",
          tone: "error",
        });
        return false;
      }
    },
    [load]
  );

  const handleSaveOverall = useCallback(
    async (limit: number, isNew: boolean) => {
      try {
        const res = await fetch("/api/budget/overall", {
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ budget_limit: limit }),
        });
        if (!res.ok) throw new Error();
        setOverallBudget(limit > 0 ? limit : null);
        await loadOverall();
        setToast({
          id: Date.now(),
          message: "Monthly budget saved",
          tone: "success",
        });
        return true;
      } catch {
        setToast({
          id: Date.now(),
          message: "Couldn't save monthly budget",
          tone: "error",
        });
        return false;
      }
    },
    [loadOverall]
  );

  const overallSpent = useMemo(
    () => [...spentByCategory.values()].reduce((s, v) => s + v, 0),
    [spentByCategory]
  );

  const openCategory = useCallback(
    (category: string) =>
      setDrawer({ category, month: effectiveMonth, accountId }),
    [effectiveMonth, accountId]
  );

  const meta = VIEW_META[view];
  const loading = rows === null;
  const empty = !loading && (rows?.length ?? 0) === 0;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <TopStrip theme={theme} onSetTheme={setThemeMode} />

      <div className="flex min-w-0 flex-1">
        <Sidebar active={view} onSelect={setView} />

        <main className="w-full min-w-0 flex-1 px-5 pb-24 pt-7 lg:px-10 lg:pb-12">
          <div className="mx-auto w-full max-w-6xl">
            <PageHeader
              title={meta.title}
              months={months}
              month={effectiveMonth}
              onMonthChange={setMonth}
              accountOptions={accountOptions}
              accountId={accountId}
              onAccountChange={setAccountId}
              onRefresh={() => load(true)}
              refreshing={refreshing}
            />
          </div>
          <div key={view} className="animate-fade-up mx-auto w-full max-w-6xl">
            {loadError && empty ? (
              <Card>
                <EmptyState
                  icon={<Alert size={24} />}
                  title="Couldn't load your data"
                  message="We couldn't reach the spending API. Check that the dashboard is configured with BigQuery credentials, then retry."
                />
                <div className="flex justify-center pb-8">
                  <Button variant="primary" onClick={() => load(true)}>
                    Retry
                  </Button>
                </div>
              </Card>
            ) : loading ? (
              <LoadingState />
            ) : empty ? (
              <Card>
                <EmptyState
                  icon={<Alert size={24} />}
                  title="No spending data yet"
                  message="Once the pipeline syncs transactions into BigQuery, your spending and budgets will appear here."
                />
              </Card>
            ) : view === "overview" ? (
              <OverviewView
                month={effectiveMonth}
                summaries={summaries}
                points={points}
                recent={recentRows}
                overallBudget={overallBudget}
                onOpenCategory={openCategory}
                onViewAll={() => setView("categories")}
              />
            ) : view === "categories" ? (
              <CategoriesView
                month={effectiveMonth}
                summaries={summaries}
                onOpenCategory={openCategory}
              />
            ) : (
              <BudgetsView
                month={effectiveMonth}
                categories={allCategories}
                budgets={budgets}
                spentByCategory={spentByCategory}
                overallBudget={overallBudget}
                overallSpent={overallSpent}
                onSave={handleSave}
                onSaveOverall={handleSaveOverall}
              />
            )}
          </div>
        </main>
      </div>

      <BottomNav active={view} onSelect={setView} />
      <TransactionsDrawer target={drawer} onClose={() => setDrawer(null)} />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-7 w-28" />
            <Skeleton className="mt-2 h-3 w-20" />
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-56 w-full" />
      </Card>
    </div>
  );
}

function prettyLabel(category: string): string {
  return category
    .toLowerCase()
    .split("_")
    .map((w) => (w === "and" ? "&" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
