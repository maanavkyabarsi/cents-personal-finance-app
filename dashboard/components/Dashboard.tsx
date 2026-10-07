"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { num } from "@/lib/format";
import type {
  Account,
  CategorySummary,
  DashboardOverview,
  SpendingRow,
  TransactionRow,
  ViewId,
} from "@/lib/types";
import { BottomNav, Sidebar } from "./Sidebar";
import { PageHeader, TopStrip, type AccountOption } from "./Topbar";
import { Toast, type ToastState } from "./Toast";
import { TransactionsDrawer, type DrawerTarget } from "./TransactionsDrawer";
import { Alert } from "./icons";
import { Button, Card, EmptyState, Skeleton } from "./primitives";
import { OverviewView } from "./views/OverviewView";
import { CategoriesView } from "./views/CategoriesView";
import { BudgetsView } from "./views/BudgetsView";
import { authFetch } from "@/lib/authFetch";

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
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [budgets, setBudgets] = useState<Map<string, number>>(new Map());
  const [months, setMonths] = useState<string[]>([]);
  const [summaries, setSummaries] = useState<CategorySummary[]>([]);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);

  const load = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setRefreshing(true);
    try {
      const res = await authFetch("/api/spending");
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
      const res = await authFetch("/api/budget/overall");
      if (!res.ok) throw new Error();
      const data: { budget_limit: unknown } = await res.json();
      const limit = num(data.budget_limit as never);
      setOverallBudget(limit > 0 ? limit : null);
    } catch {}
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await authFetch("/api/accounts");
      if (!res.ok) throw new Error();
      const data: Account[] = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  const loadCategoryBudgets = useCallback(async () => {
    try {
      const res = await authFetch("/api/budget/primary_categories");
      if (!res.ok) throw new Error();
      const data: { category: string | null; limit: unknown }[] = await res.json();
      const categories = new Set<string>();
      const budgetMap = new Map<string, number>();
      for (const row of Array.isArray(data) ? data : []) {
        if (!row.category) continue;
        categories.add(row.category);
        const limit = num(row.limit as never);
        if (row.limit !== null && limit > 0) budgetMap.set(row.category, limit);
      }
      setAllCategories([...categories].sort());
      setBudgets(budgetMap);
    } catch {}
  }, []);

  const loadMonths = useCallback(async () => {
    try {
      const res = await authFetch("/api/months");
      if (!res.ok) throw new Error();
      const data: string[] = await res.json();
      setMonths(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  useEffect(() => {
    load(false);
    loadOverall();
    loadAccounts();
    loadCategoryBudgets();
    loadMonths();
    setTheme(
      document.documentElement.classList.contains("dark") ? "dark" : "light"
    );
  }, [load, loadOverall, loadAccounts, loadCategoryBudgets, loadMonths]);

  const effectiveMonth = useMemo(() => {
    if (month && months.includes(month)) return month;
    return months.length ? months[months.length - 1] : "";
  }, [month, months]);

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

  const summaryKey = `${effectiveMonth}__${accountId ?? ""}`;

  useEffect(() => {
    if (!effectiveMonth) return;
    let cancelled = false;
    const params = new URLSearchParams({ month: effectiveMonth });
    if (accountId) params.set("account_id", accountId);

    authFetch(`/api/categories?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: CategorySummary[]) => {
        if (!cancelled) setSummaries(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setSummaries([]);
      });

    authFetch(`/api/dashboard/overview?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: DashboardOverview) => {
        if (!cancelled) setOverview(data);
      })
      .catch(() => {
        if (!cancelled) setOverview(null);
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveMonth, accountId, summaryKey]);

  const spentByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of summaries) m.set(s.category, s.spent);
    return m;
  }, [summaries]);

  const recentKey = `${effectiveMonth}__${accountId ?? ""}`;

  useEffect(() => {
    if (!effectiveMonth) return;
    let cancelled = false;
    const url = `/api/transactions/recent?month_year=${effectiveMonth}${
      accountId ? `&account_id=${encodeURIComponent(accountId)}` : ""
    }`;
    authFetch(url)
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
    async (category: string, limit: number, _isNew: boolean) => {
      try {
        const res = await authFetch("/api/budget/limits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            primary_category: category,
            budget_limit: limit,
          }),
        });
        if (!res.ok) throw new Error();
        await loadCategoryBudgets();
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
    [loadCategoryBudgets]
  );

  const handleSaveOverall = useCallback(
    async (limit: number, _isNew: boolean) => {
      try {
        const res = await authFetch("/api/budget/overall", {
          method: "POST",
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

  const overallSpent = overview?.totalSpent ?? 0;

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
                overview={overview}
                recent={recentRows}
                accountId={accountId}
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
