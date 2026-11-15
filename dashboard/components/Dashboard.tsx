"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { num, prettyCategory } from "@/lib/format";
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
import {
  applySpendDeltas,
  currentState,
  overviewFromSummaries,
  PendingWrites,
  spendDeltas,
  taggedState,
  transactionMonth,
  type SpendState,
} from "@/lib/optimistic";
import { useTheme } from "@/lib/useTheme";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

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
  const [theme, setThemeMode] = useTheme();
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
  // Bumped after an ignore/unignore so totals and transaction lists refetch.
  const [dataVersion, setDataVersion] = useState(0);
  // Mirror of `summaries` so optimistic updates can compute from the latest value
  // without depending on a stale closure.
  const summariesRef = useRef<CategorySummary[]>([]);
  // Writes that may not be visible to fetches yet; layered over fetched data.
  const [pending] = useState(() => new PendingWrites());

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
    // Fetch-on-mount: every setState in these loaders runs after an await, but
    // the lint rule doesn't track await boundaries and flags the first call.
    /* eslint-disable react-hooks/set-state-in-effect */
    load(false);
    loadOverall();
    loadAccounts();
    loadCategoryBudgets();
    loadMonths();
    /* eslint-enable react-hooks/set-state-in-effect */
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
    const startedAt = Date.now();
    const params = new URLSearchParams({ month: effectiveMonth });
    if (accountId) params.set("account_id", accountId);

    authFetch(`/api/categories?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: CategorySummary[]) => {
        if (cancelled) return;
        const fetched = Array.isArray(data) ? data : [];
        const next = pending.overlaySummaries(fetched, budgets, effectiveMonth, accountId, startedAt);
        summariesRef.current = next;
        setSummaries(next);
        if (next !== fetched) setOverview((o) => (o ? overviewFromSummaries(o, next) : o));
      })
      .catch(() => {
        if (cancelled) return;
        summariesRef.current = [];
        setSummaries([]);
      });

    authFetch(`/api/dashboard/overview?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: DashboardOverview) => {
        if (cancelled) return;
        // Totals follow the (already overlaid) category list while writes are settling.
        setOverview(
          pending.hasRelevant(startedAt)
            ? overviewFromSummaries(data, summariesRef.current)
            : data
        );
      })
      .catch(() => {
        if (!cancelled) setOverview(null);
      });

    return () => {
      cancelled = true;
    };
    // budgets is read only to attach limits to categories created by an overlay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMonth, accountId, summaryKey, dataVersion, pending]);

  const spentByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of summaries) m.set(s.category, s.spent);
    return m;
  }, [summaries]);

  const recentKey = `${effectiveMonth}__${accountId ?? ""}`;

  useEffect(() => {
    if (!effectiveMonth) return;
    let cancelled = false;
    const startedAt = Date.now();
    const url = `/api/transactions/recent?month_year=${effectiveMonth}${
      accountId ? `&account_id=${encodeURIComponent(accountId)}` : ""
    }`;
    authFetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: TransactionRow[]) => {
        if (!cancelled)
          setRecent({
            key: recentKey,
            rows: pending.overlayRows(Array.isArray(data) ? data : [], startedAt),
          });
      })
      .catch(() => {
        if (!cancelled) setRecent({ key: recentKey, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveMonth, accountId, recentKey, dataVersion, pending]);

  const recentRows = recent && recent.key === recentKey ? recent.rows : null;

  const handleSave = useCallback(
    async (category: string, limit: number, _isNew: boolean) => {
      setBudgets((prev) => {
        const next = new Map(prev);
        if (limit > 0) next.set(category, limit);
        else next.delete(category);
        return next;
      });
      setToast({
        id: Date.now(),
        message: `${prettyLabel(category)} budget saved`,
        tone: "success",
      });
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
        // Local state was already updated optimistically; reconcile in the background.
        void loadCategoryBudgets();
        return true;
      } catch {
        // Roll back to whatever the server has.
        void loadCategoryBudgets();
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
      setOverallBudget(limit > 0 ? limit : null);
      setToast({
        id: Date.now(),
        message: "Monthly budget saved",
        tone: "success",
      });
      try {
        const res = await authFetch("/api/budget/overall", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ budget_limit: limit }),
        });
        if (!res.ok) throw new Error();
        void loadOverall();
        return true;
      } catch {
        void loadOverall();
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

  // Reflects a pending ignore/tag in the recent list, category totals and overview right
  // away. A failed write bumps dataVersion, which refetches the real numbers.
  const applyOptimistic = useCallback(
    (t: TransactionRow, after: SpendState, rowPatch: Partial<TransactionRow>) => {
      pending.begin(t, { ...t, ...rowPatch }, after, accountId);
      setRecent((prev) =>
        prev && {
          ...prev,
          rows: prev.rows.map((r) =>
            r.transaction_id === t.transaction_id ? { ...r, ...rowPatch } : r
          ),
        }
      );
      if (!effectiveMonth || transactionMonth(t) !== effectiveMonth.slice(0, 7)) return;
      const deltas = spendDeltas(t, after);
      if (deltas.length === 0) return;
      const next = applySpendDeltas(summariesRef.current, budgets, deltas);
      summariesRef.current = next;
      setSummaries(next);
      setOverview((o) => (o ? overviewFromSummaries(o, next) : o));
    },
    [effectiveMonth, budgets, pending, accountId]
  );

  const handleToggleIgnore = useCallback(
    async (t: TransactionRow, ignore: boolean) => {
      const transactionId = t.transaction_id;
      applyOptimistic(t, { ...currentState(t), ignored: ignore }, { is_ignored: ignore });
      setToast({
        id: Date.now(),
        message: ignore ? "Transaction ignored" : "Transaction restored",
        tone: "success",
      });
      try {
        const res = await authFetch("/api/transactions/ignore", {
          method: ignore ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transaction_id: transactionId }),
        });
        if (!res.ok) throw new Error();
        // Totals/lists refetch once BigQuery has the write.
        pending.finish(transactionId);
        setDataVersion((v) => v + 1);
        return true;
      } catch {
        pending.fail(transactionId);
        setDataVersion((v) => v + 1); // undo the optimistic update
        setToast({
          id: Date.now(),
          message: ignore ? "Couldn't ignore transaction" : "Couldn't restore transaction",
          tone: "error",
        });
        return false;
      }
    },
    [applyOptimistic, pending]
  );

  const handleTagCategory = useCallback(
    async (t: TransactionRow, category: string | null) => {
      const transactionId = t.transaction_id;
      const after = taggedState(t, category);
      applyOptimistic(t, after, {
        pfc_primary: after.category,
        pfc_detailed: after.detailed,
        is_tagged: category !== null,
      });
      setToast({
        id: Date.now(),
        message: category ? `Tagged as ${prettyCategory(category)}` : "Tag removed",
        tone: "success",
      });
      try {
        const res = await authFetch("/api/transactions/category", {
          method: category ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            category
              ? { transaction_id: transactionId, primary_category: category }
              : { transaction_id: transactionId }
          ),
        });
        if (!res.ok) throw new Error();
        pending.finish(transactionId);
        setDataVersion((v) => v + 1);
        return true;
      } catch {
        pending.fail(transactionId);
        setDataVersion((v) => v + 1); // undo the optimistic update
        setToast({
          id: Date.now(),
          message: category ? "Couldn't tag transaction" : "Couldn't remove tag",
          tone: "error",
        });
        return false;
      }
    },
    [applyOptimistic, pending]
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
      <TopStrip
        theme={theme}
        onSetTheme={setThemeMode}
        onSignOut={() => signOut(auth)}
      />

      <div className="flex min-w-0 flex-1">
        <Sidebar active={view} onSelect={setView} />

        <main className="w-full min-w-0 flex-1 pl-[max(1.25rem,var(--safe-l))] pr-[max(1.25rem,var(--safe-r))] pb-[calc(6rem+var(--safe-b))] pt-7 lg:px-10 lg:pb-12">
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
                onToggleIgnore={handleToggleIgnore}
                onTagCategory={handleTagCategory}
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
      <TransactionsDrawer
        target={drawer}
        onClose={() => setDrawer(null)}
        version={dataVersion}
        pending={pending}
        onToggleIgnore={handleToggleIgnore}
        onTagCategory={handleTagCategory}
      />
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
