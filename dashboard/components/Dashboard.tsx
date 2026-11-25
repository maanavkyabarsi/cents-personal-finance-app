"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localToday, num, prettyCategory } from "@/lib/format";
import type {
  Account,
  CategorySummary,
  DashboardOverview,
  EventDetail,
  EventInput,
  EventRecord,
  SpendingRow,
  TransactionRow,
  ViewId,
} from "@/lib/types";
import { BottomNav, Sidebar } from "./Sidebar";
import { PageHeader, TopStrip, type AccountOption } from "./Topbar";
import { EventBar } from "./EventBar";
import { StartEventSheet } from "./StartEventSheet";
import { EventsView, type EventPatch } from "./views/EventsView";
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
  eventTotalsDeltas,
  inSeparateEvent,
  overlappingEvent,
  overviewFromSummaries,
  PendingEventWrites,
  PendingWrites,
  sortEvents,
  spendDeltas,
  taggedState,
  transactionMonth,
  type SpendDelta,
  type SpendState,
} from "@/lib/optimistic";
import { useTheme } from "@/lib/useTheme";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

const VIEW_META: Record<ViewId, { title: string }> = {
  overview: { title: "Overview" },
  categories: { title: "Categories" },
  budgets: { title: "Budgets" },
  events: { title: "Events" },
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
  const [events, setEvents] = useState<EventRecord[] | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [startSheetOpen, setStartSheetOpen] = useState(false);
  // Bumped after an ignore/unignore so totals and transaction lists refetch.
  const [dataVersion, setDataVersion] = useState(0);
  // Mirror of `summaries` so optimistic updates can compute from the latest value
  // without depending on a stale closure.
  const summariesRef = useRef<CategorySummary[]>([]);
  // Writes that may not be visible to fetches yet; layered over fetched data.
  const [pending] = useState(() => new PendingWrites());
  // Same for the events list, plus a mirror of it, the event details the Events view has
  // loaded (used to move an event's spend in or out of the totals), and the queue that
  // runs event writes one at a time.
  const [pendingEvents] = useState(() => new PendingEventWrites());
  const eventsRef = useRef<EventRecord[] | null>(null);
  const eventDetails = useRef(new Map<string, EventDetail>());
  const eventQueue = useRef<Promise<unknown>>(Promise.resolve());

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

  const commitEvents = useCallback((next: EventRecord[] | null) => {
    eventsRef.current = next;
    setEvents(next);
  }, []);

  const loadEvents = useCallback(async () => {
    const startedAt = Date.now();
    try {
      const res = await authFetch("/api/events");
      if (!res.ok) throw new Error();
      const data: EventRecord[] = await res.json();
      commitEvents(pendingEvents.overlay(Array.isArray(data) ? data : [], startedAt));
    } catch {
      commitEvents(eventsRef.current ?? []);
    }
  }, [commitEvents, pendingEvents]);

  useEffect(() => {
    // Fetch-on-mount: every setState in these loaders runs after an await, but
    // the lint rule doesn't track await boundaries and flags the first call.
    /* eslint-disable react-hooks/set-state-in-effect */
    load(false);
    loadOverall();
    loadAccounts();
    loadCategoryBudgets();
    loadMonths();
    loadEvents();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load, loadOverall, loadAccounts, loadCategoryBudgets, loadMonths, loadEvents]);

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
      // A row in a separate event stays out of the totals whether or not it is ignored.
      applyOptimistic(
        t,
        { ...currentState(t), ignored: ignore || inSeparateEvent(t) },
        { is_ignored: ignore }
      );
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

  // ---- Events -------------------------------------------------------------
  // Like tags and ignores, event writes show up at once and the request runs in the
  // background. They go through a queue so edits made in quick succession reach BigQuery
  // one at a time (its transactions on the same tables would otherwise conflict). Each
  // write runs as one BigQuery transaction, so once it returns everything can be refetched;
  // totals are only refetched when the write could have changed them.
  const refreshAfterEventWrite = useCallback(
    (affectsTotals: boolean) => {
      void loadEvents();
      if (affectsTotals) {
        void load(false);
        setDataVersion((v) => v + 1);
      }
    },
    [loadEvents, load]
  );

  const enqueueEventWrite = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = eventQueue.current.then(fn);
    eventQueue.current = run.catch(() => undefined);
    return run;
  }, []);

  // Moves an event's spend in or out of the visible totals when it flips between "kept
  // separate" and "also counted". Needs the event's transactions, so it only applies once
  // the Events view has loaded them; otherwise the refetch after the write corrects the
  // totals. Returns the transaction ids registered in `pending`.
  const applyEventTotals = useCallback(
    (event: EventRecord, nowCounted: boolean): string[] => {
      const detail = eventDetails.current.get(event.event_id);
      if (!detail || event.count_in_totals === nowCounted) return [];
      const moves = eventTotalsDeltas(event, detail.transactions, event.count_in_totals, nowCounted);
      if (moves.length === 0) return [];
      const deltas: SpendDelta[] = [];
      for (const m of moves) {
        // The rows don't carry an account, so with an account filter on we leave the
        // totals to the refetch rather than guess.
        pending.begin(m.original, m.patched, m.after, null);
        if (accountId === null && effectiveMonth && transactionMonth(m.original) === effectiveMonth.slice(0, 7)) {
          deltas.push(...spendDeltas(m.original, m.after));
        }
      }
      const ids = new Set(moves.map((m) => m.original.transaction_id));
      setRecent((prev) =>
        prev && {
          ...prev,
          rows: prev.rows.map((r) => (r.event_id === event.event_id ? { ...r, event_counted: nowCounted } : r)),
        }
      );
      if (deltas.length > 0) {
        const next = applySpendDeltas(summariesRef.current, budgets, deltas);
        summariesRef.current = next;
        setSummaries(next);
        setOverview((o) => (o ? overviewFromSummaries(o, next) : o));
      }
      return [...ids];
    },
    [pending, accountId, effectiveMonth, budgets]
  );

  const eventError = useCallback(async (res: Response, fallback: string) => {
    const body: { error?: string } | null = await res.json().catch(() => null);
    return body?.error ?? fallback;
  }, []);

  // Puts `record` back (or drops it, when null) after a failed background write, then
  // refetches so the list shows what the server actually has.
  const rollbackEvent = useCallback(
    (id: string, record: EventRecord | null, txnIds: string[]) => {
      pendingEvents.fail(id);
      for (const t of txnIds) pending.fail(t);
      const rest = (eventsRef.current ?? []).filter((e) => e.event_id !== id);
      commitEvents(record ? sortEvents([...rest, record]) : rest);
      setDataVersion((v) => v + 1); // undo any optimistic totals
      void loadEvents();
    },
    [pendingEvents, pending, commitEvents, loadEvents]
  );

  const handleCreateEvent = useCallback(
    async (input: EventInput): Promise<string | null> => {
      const clash = overlappingEvent(eventsRef.current ?? [], input);
      if (clash) return `Overlaps with the event "${clash.name}"`;

      const id = crypto.randomUUID();
      const record: EventRecord = {
        event_id: id,
        ...input,
        live: input.end_date === null,
        transaction_count: 0,
        total: 0,
      };
      pendingEvents.begin(id, record);
      commitEvents(sortEvents([...(eventsRef.current ?? []), record]));
      setStartSheetOpen(false);
      setToast({
        id: Date.now(),
        message: input.end_date ? `Added ${input.name}` : `Started ${input.name}`,
        tone: "success",
      });

      enqueueEventWrite(async () => {
        const res = await authFetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, event_id: id }),
        });
        if (!res.ok) throw new Error(await eventError(res, "Couldn't start the event"));
      }).then(
        () => {
          pendingEvents.finish(id);
          // A kept-separate event pulls its purchases out of the totals.
          refreshAfterEventWrite(!input.count_in_totals);
        },
        (e) => {
          rollbackEvent(id, null, []);
          setToast({
            id: Date.now(),
            message: e instanceof Error ? e.message : "Couldn't start the event",
            tone: "error",
          });
        }
      );
      return null;
    },
    [pendingEvents, commitEvents, enqueueEventWrite, eventError, refreshAfterEventWrite, rollbackEvent]
  );

  const handleUpdateEvent = useCallback(
    async (id: string, patch: EventPatch) => {
      const current = eventsRef.current?.find((e) => e.event_id === id);
      if (!current) {
        setToast({ id: Date.now(), message: "Couldn't update the event", tone: "error" });
        return false;
      }
      // The server defaults "end" to its own UTC day; send the viewer's local day.
      const body = patch.end && patch.end_date === undefined ? { ...patch, end_date: localToday() } : patch;
      const end_date = patch.end
        ? (body.end_date ?? localToday())
        : patch.end_date !== undefined
          ? patch.end_date
          : current.end_date;
      const next: EventRecord = {
        ...current,
        name: patch.name ?? current.name,
        count_in_totals: patch.count_in_totals ?? current.count_in_totals,
        account_ids: patch.account_ids ?? current.account_ids,
        end_date,
        live: end_date === null,
      };

      let problem: string | null = null;
      if (next.end_date !== null && next.end_date < next.start_date) {
        problem = "The end date is before the start date";
      } else {
        const clash = overlappingEvent(eventsRef.current ?? [], next, id);
        if (clash) problem = `Overlaps with the event "${clash.name}"`;
      }
      if (problem) {
        setToast({ id: Date.now(), message: problem, tone: "error" });
        return false;
      }

      const affectsTotals =
        next.count_in_totals !== current.count_in_totals ||
        next.end_date !== current.end_date ||
        next.account_ids.join() !== current.account_ids.join();

      pendingEvents.begin(id, next);
      commitEvents(sortEvents((eventsRef.current ?? []).map((e) => (e.event_id === id ? next : e))));
      const txnIds = applyEventTotals(current, next.count_in_totals);
      setToast({
        id: Date.now(),
        message: patch.end
          ? "Event ended"
          : patch.count_in_totals === undefined
            ? "Event updated"
            : patch.count_in_totals
              ? "Event now counts toward monthly totals"
              : "Event kept separate from monthly totals",
        tone: "success",
      });

      enqueueEventWrite(async () => {
        const res = await authFetch(`/api/events/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await eventError(res, "Couldn't update the event"));
      }).then(
        () => {
          pendingEvents.finish(id);
          for (const t of txnIds) pending.finish(t);
          refreshAfterEventWrite(affectsTotals);
        },
        (e) => {
          rollbackEvent(id, current, txnIds);
          setToast({
            id: Date.now(),
            message: e instanceof Error ? e.message : "Couldn't update the event",
            tone: "error",
          });
        }
      );
      return true;
    },
    [
      pendingEvents,
      pending,
      commitEvents,
      applyEventTotals,
      enqueueEventWrite,
      eventError,
      refreshAfterEventWrite,
      rollbackEvent,
    ]
  );

  const handleDeleteEvent = useCallback(
    async (id: string) => {
      const current = eventsRef.current?.find((e) => e.event_id === id);
      if (!current) {
        setToast({ id: Date.now(), message: "Couldn't delete the event", tone: "error" });
        return false;
      }
      pendingEvents.begin(id, null);
      commitEvents((eventsRef.current ?? []).filter((e) => e.event_id !== id));
      // Its purchases go back into the normal totals.
      const txnIds = applyEventTotals(current, true);
      setToast({ id: Date.now(), message: "Event deleted", tone: "success" });

      enqueueEventWrite(async () => {
        const res = await authFetch(`/api/events/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
      }).then(
        () => {
          pendingEvents.finish(id);
          for (const t of txnIds) pending.finish(t);
          eventDetails.current.delete(id);
          refreshAfterEventWrite(!current.count_in_totals);
        },
        () => {
          rollbackEvent(id, current, txnIds);
          setToast({ id: Date.now(), message: "Couldn't delete the event", tone: "error" });
        }
      );
      return true;
    },
    [pendingEvents, pending, commitEvents, applyEventTotals, enqueueEventWrite, refreshAfterEventWrite, rollbackEvent]
  );

  // eventId null = take the transaction out of the event it is in.
  const setEventMembership = useCallback(
    async (transactionId: string, eventId: string | null) => {
      try {
        await enqueueEventWrite(async () => {
          const res = await authFetch("/api/events/overrides", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              eventId
                ? { transaction_id: transactionId, mode: "include", event_id: eventId }
                : { transaction_id: transactionId, mode: "exclude" }
            ),
          });
          if (!res.ok) throw new Error();
        });
        refreshAfterEventWrite(true);
        return true;
      } catch {
        setToast({ id: Date.now(), message: "Couldn't update the event", tone: "error" });
        return false;
      }
    },
    [enqueueEventWrite, refreshAfterEventWrite]
  );

  const handleMoveToEvent = useCallback(
    async (t: TransactionRow, eventId: string | null) => {
      const ok = await setEventMembership(t.transaction_id, eventId);
      if (ok) {
        const name = events?.find((e) => e.event_id === eventId)?.name;
        setToast({
          id: Date.now(),
          message: eventId ? `Moved to ${name ?? "event"}` : "Removed from event",
          tone: "success",
        });
      }
      return ok;
    },
    [setEventMembership, events]
  );

  const handleRemoveFromEvent = useCallback(
    async (transactionId: string) => {
      const ok = await setEventMembership(transactionId, null);
      if (ok) setToast({ id: Date.now(), message: "Removed from event", tone: "success" });
      return ok;
    },
    [setEventMembership]
  );

  // Stable identity: the Events view refetches its detail whenever this changes.
  const handleEventDetailLoaded = useCallback((d: EventDetail) => {
    eventDetails.current.set(d.event.event_id, d);
  }, []);

  const liveEvent = useMemo(() => events?.find((e) => e.live) ?? null, [events]);
  const eventList = events ?? [];

  const accountLabel = useCallback(
    (id: string) => accountMap.get(id) ?? `Account …${id.slice(-4)}`,
    [accountMap]
  );

  const openEvent = useCallback((id: string) => {
    setSelectedEventId(id);
    setView("events");
  }, []);

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
            {liveEvent && (
              <EventBar
                event={liveEvent}
                onOpen={() => openEvent(liveEvent.event_id)}
                onEnd={() => handleUpdateEvent(liveEvent.event_id, { end: true })}
              />
            )}
            <PageHeader
              title={meta.title}
              months={months}
              month={effectiveMonth}
              onMonthChange={setMonth}
              accountOptions={accountOptions}
              accountId={accountId}
              onAccountChange={setAccountId}
              onRefresh={() => {
                void load(true);
                void loadEvents();
              }}
              refreshing={refreshing}
              showFilters={view !== "events"}
              onStartEvent={liveEvent ? undefined : () => setStartSheetOpen(true)}
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
                events={eventList}
                onMoveToEvent={handleMoveToEvent}
              />
            ) : view === "categories" ? (
              <CategoriesView
                month={effectiveMonth}
                summaries={summaries}
                onOpenCategory={openCategory}
              />
            ) : view === "events" ? (
              <EventsView
                events={events}
                selectedId={selectedEventId}
                onSelect={setSelectedEventId}
                version={dataVersion}
                accountLabel={accountLabel}
                onStart={() => setStartSheetOpen(true)}
                onUpdate={handleUpdateEvent}
                onDelete={handleDeleteEvent}
                onRemoveTransaction={handleRemoveFromEvent}
                onDetailLoaded={handleEventDetailLoaded}
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
        events={eventList}
        onMoveToEvent={handleMoveToEvent}
      />
      {startSheetOpen && (
        <StartEventSheet
          accountOptions={accountOptions}
          onClose={() => setStartSheetOpen(false)}
          onCreate={handleCreateEvent}
        />
      )}
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
