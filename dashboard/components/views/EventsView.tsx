"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { categoryMeta } from "@/lib/categories";
import {
  currency,
  currencyCents,
  dateStr,
  dayLabel,
  eventRangeLabel,
  num,
  prettyCategory,
} from "@/lib/format";
import type { EventDetail, EventRecord, EventTransaction } from "@/lib/types";
import { Alert, Calendar, CategoryIcon, ChevronRight, Inbox, Plus } from "../icons";
import { Button, Card, EmptyState, SectionHeading, Skeleton, cx } from "../primitives";

export type EventPatch = Partial<{
  name: string;
  count_in_totals: boolean;
  end: boolean;
  end_date: string | null;
  account_ids: string[];
}>;

export function EventsView({
  events,
  selectedId,
  onSelect,
  version,
  accountLabel,
  onStart,
  onUpdate,
  onDelete,
  onRemoveTransaction,
}: {
  events: EventRecord[] | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  version: number;
  accountLabel: (id: string) => string;
  onStart: () => void;
  onUpdate: (id: string, patch: EventPatch) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onRemoveTransaction: (transactionId: string) => Promise<boolean>;
}) {
  if (selectedId) {
    return (
      <EventDetailView
        id={selectedId}
        version={version}
        accountLabel={accountLabel}
        onBack={() => onSelect(null)}
        onUpdate={onUpdate}
        onDelete={async (id) => {
          const ok = await onDelete(id);
          if (ok) onSelect(null);
          return ok;
        }}
        onRemoveTransaction={onRemoveTransaction}
      />
    );
  }

  if (events === null) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-4 h-7 w-24" />
            <Skeleton className="mt-2 h-3 w-40" />
          </Card>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Calendar size={24} />}
          title="No events yet"
          message="Start an event for a trip, a wedding or any one-off stretch, and its purchases are tracked on their own."
        />
        <div className="flex justify-center pb-8">
          <Button variant="primary" onClick={onStart}>
            <Plus size={16} /> Start an event
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {events.map((e) => (
        <button
          key={e.event_id}
          onClick={() => onSelect(e.event_id)}
          className="group flex w-full cursor-pointer flex-col rounded-2xl border border-border bg-surface p-5 text-left shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-text">{e.name}</p>
              <p className="tnum truncate text-sm text-muted">{eventRangeLabel(e.start_date, e.end_date)}</p>
            </div>
            {e.live && (
              <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">Live</span>
            )}
            <ChevronRight
              size={18}
              className="shrink-0 text-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-muted"
            />
          </div>
          <p className="tnum mt-4 text-2xl font-semibold tracking-tight text-text">{currencyCents(e.total)}</p>
          <p className="mt-0.5 text-xs text-muted">
            {e.transaction_count} transaction{e.transaction_count === 1 ? "" : "s"} ·{" "}
            {e.count_in_totals ? "also counted in monthly totals" : "kept out of monthly totals"}
          </p>
        </button>
      ))}
    </div>
  );
}

function EventDetailView({
  id,
  version,
  accountLabel,
  onBack,
  onUpdate,
  onDelete,
  onRemoveTransaction,
}: {
  id: string;
  version: number;
  accountLabel: (id: string) => string;
  onBack: () => void;
  onUpdate: (id: string, patch: EventPatch) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onRemoveTransaction: (transactionId: string) => Promise<boolean>;
}) {
  const [result, setResult] = useState<{ id: string; data: EventDetail | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    authFetch(`/api/events/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: EventDetail) => !cancelled && setResult({ id, data }))
      .catch(() => !cancelled && setResult({ id, data: null }));
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  const loaded = result && result.id === id;
  const detail = loaded ? result.data : null;

  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  const remove = async (t: EventTransaction) => {
    setRemoving((p) => new Set(p).add(t.transaction_id));
    await onRemoveTransaction(t.transaction_id);
    setRemoving((p) => {
      const next = new Set(p);
      next.delete(t.transaction_id);
      return next;
    });
  };

  const back = (
    <button
      onClick={onBack}
      className="mb-4 inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-text"
    >
      <ChevronRight size={16} className="rotate-180" /> All events
    </button>
  );

  if (!loaded) {
    return (
      <div>
        {back}
        <Card className="p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-4 h-8 w-28" />
          <Skeleton className="mt-6 h-40 w-full" />
        </Card>
      </div>
    );
  }

  if (!detail) {
    return (
      <div>
        {back}
        <Card>
          <EmptyState
            icon={<Alert size={24} />}
            title="Couldn't load this event"
            message="It may have been deleted. Go back to the list and try again."
          />
        </Card>
      </div>
    );
  }

  const { event, categories, daily, transactions } = detail;
  const maxDaily = Math.max(...daily.map((d) => d.spent), 1);
  const maxCat = Math.max(...categories.map((c) => c.spent), 1);
  const sorted = [...transactions].sort((a, b) =>
    (dateStr(b.transaction_date) ?? "").localeCompare(dateStr(a.transaction_date) ?? "")
  );

  return (
    <div className="space-y-5">
      <div>
        {back}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold text-text">
              {event.name}
              {event.live && (
                <span className="ml-2 rounded-full bg-primary-soft px-2.5 py-1 align-middle text-xs font-medium text-primary">
                  Live
                </span>
              )}
            </h2>
            <p className="tnum text-sm text-muted">{eventRangeLabel(event.start_date, event.end_date)}</p>
            <p className="mt-0.5 text-xs text-subtle">
              {event.account_ids.length === 0
                ? "All accounts"
                : event.account_ids.map(accountLabel).join(", ")}
            </p>
          </div>
          <div className="flex gap-2">
            {event.live && (
              <Button disabled={busy} onClick={() => run(() => onUpdate(event.event_id, { end: true }))}>
                End event
              </Button>
            )}
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Delete "${event.name}"? Its purchases go back into your normal totals.`)) {
                  void run(() => onDelete(event.event_id));
                }
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">Total</p>
          <p className="tnum mt-2 text-3xl font-semibold tracking-tight text-text">{currencyCents(event.total)}</p>
          <p className="mt-1 text-xs text-muted">
            {event.transaction_count} transaction{event.transaction_count === 1 ? "" : "s"}
          </p>

          <p className="mt-5 text-xs font-medium uppercase tracking-[0.08em] text-subtle">Monthly totals</p>
          <div className="mt-2 flex rounded-xl border border-border p-0.5" role="group" aria-label="Monthly totals">
            {([false, true] as const).map((counted) => (
              <button
                key={String(counted)}
                disabled={busy}
                aria-pressed={event.count_in_totals === counted}
                onClick={() =>
                  event.count_in_totals !== counted &&
                  run(() => onUpdate(event.event_id, { count_in_totals: counted }))
                }
                className={cx(
                  "flex-1 cursor-pointer rounded-[10px] px-3 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  event.count_in_totals === counted
                    ? "bg-primary text-on-primary"
                    : "text-muted hover:text-text"
                )}
              >
                {counted ? "Also count" : "Keep separate"}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {event.count_in_totals
              ? "These purchases also count toward your monthly budget and categories."
              : "These purchases are kept out of your monthly budget and categories."}
          </p>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <SectionHeading title="By category" />
          {categories.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No spending in this event yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {categories.map((c) => {
                const meta = categoryMeta(c.category);
                return (
                  <li key={c.category} className="flex items-center gap-3">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: `${meta.color}1f`, color: meta.color }}
                      aria-hidden
                    >
                      <CategoryIcon iconKey={meta.iconKey} size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm text-text">{prettyCategory(c.category)}</span>
                        <span className="tnum shrink-0 text-sm font-medium text-text">{currency(c.spent)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(c.spent / maxCat) * 100}%`, background: meta.color, opacity: 0.8 }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {daily.length > 1 && (
            <>
              <p className="mt-6 text-xs font-medium uppercase tracking-[0.08em] text-subtle">By day</p>
              <div className="mt-2 flex h-16 items-end gap-1" role="img" aria-label="Spending per day">
                {daily.map((d) => (
                  <div
                    key={d.date}
                    title={`${dayLabel(d.date)}: ${currencyCents(d.spent)}`}
                    className="min-w-[3px] flex-1 rounded-t bg-primary opacity-70"
                    style={{ height: `${Math.max((d.spent / maxDaily) * 100, 4)}%` }}
                  />
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <SectionHeading title="Transactions" />
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-subtle">
              <Inbox size={18} />
            </span>
            <p className="text-[13px] text-muted">
              Nothing here yet. Purchases dated in this window show up once they post.
            </p>
          </div>
        ) : (
          <ul className="mt-3">
            {sorted.map((t) => {
              const amt = num(t.amount);
              const refund = amt < 0;
              const title = t.merchant_name || t.transaction_name || "Transaction";
              return (
                <li
                  key={t.transaction_id}
                  className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0"
                >
                  <div className={cx("min-w-0 flex-1", t.is_ignored && "opacity-50")}>
                    <p className="truncate text-[13px] font-medium text-text">
                      {title}
                      {t.is_override && (
                        <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 align-middle text-[10px] font-medium text-muted">
                          Added manually
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11.5px] text-subtle">
                      {prettyCategory(t.pfc_primary ?? null)} · {dayLabel(dateStr(t.transaction_date))}
                      {t.is_ignored && " · ignored"}
                    </p>
                  </div>
                  <span
                    className={cx(
                      "num shrink-0 text-[13px] font-medium",
                      refund ? "text-accent" : "text-text",
                      t.is_ignored && "line-through opacity-50"
                    )}
                  >
                    {refund ? "+" : "−"}
                    {currencyCents(Math.abs(amt))}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(t)}
                    disabled={removing.has(t.transaction_id)}
                    aria-label={`Remove ${title} from this event`}
                    className="shrink-0 cursor-pointer rounded-md px-1.5 py-1 text-[11.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
