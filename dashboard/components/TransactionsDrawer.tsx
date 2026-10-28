"use client";

import { useEffect, useState } from "react";
import { categoryMeta } from "@/lib/categories";
import {
  currencyCents,
  dateStr,
  dayLabel,
  monthLabelLong,
  num,
  prettyCategory,
} from "@/lib/format";
import type { TransactionRow } from "@/lib/types";
import { CategoryIcon, Close, Inbox, Alert } from "./icons";
import { Button, EmptyState, Skeleton } from "./primitives";
import { authFetch } from "@/lib/authFetch";

export interface DrawerTarget {
  category: string;
  month: string;
  accountId: string | null;
}

export function TransactionsDrawer({
  target,
  onClose,
  version,
  onToggleIgnore,
}: {
  target: DrawerTarget | null;
  onClose: () => void;
  version: number;
  onToggleIgnore: (transactionId: string, ignore: boolean) => Promise<boolean>;
}) {
  const [result, setResult] = useState<{ key: string; rows: TransactionRow[] } | null>(
    null
  );
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const open = target !== null;
  const key = target
    ? `${target.category}__${target.month}__${target.accountId ?? ""}`
    : null;

  useEffect(() => {
    if (!target || !key) return;
    let cancelled = false;
    const url = `/api/transactions?primary_category=${encodeURIComponent(
      target.category
    )}&month_year=${target.month}${
      target.accountId
        ? `&account_id=${encodeURIComponent(target.accountId)}`
        : ""
    }`;
    authFetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: TransactionRow[]) => {
        if (!cancelled) setResult({ key, rows: Array.isArray(data) ? data : [] });
      })
      .catch(() => !cancelled && setErrorKey(key));
    return () => {
      cancelled = true;
    };
  }, [key, target, version]);

  const toggle = async (t: TransactionRow) => {
    const ignore = !t.is_ignored;
    setPending((p) => new Set(p).add(t.transaction_id));
    const ok = await onToggleIgnore(t.transaction_id, ignore);
    setPending((p) => {
      const next = new Set(p);
      next.delete(t.transaction_id);
      return next;
    });
    if (!ok) return;
    setResult((r) =>
      r && {
        ...r,
        rows: r.rows.map((row) =>
          row.transaction_id === t.transaction_id ? { ...row, is_ignored: ignore } : row
        ),
      }
    );
  };

  const rows = result && result.key === key ? result.rows : null;
  const error = errorKey === key;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !target) return null;

  const meta = categoryMeta(target.category);
  const sorted = rows
    ? [...rows].sort(
        (a, b) =>
          (dateStr(b.transaction_date) ?? "").localeCompare(
            dateStr(a.transaction_date) ?? ""
          )
      )
    : null;
  const counted = rows ? rows.filter((r) => !r.is_ignored) : [];
  const total = counted.reduce((s, r) => s + num(r.amount), 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 animate-fade-in bg-black/45"
        onClick={onClose}
        aria-hidden
      />
      <aside className="animate-slide-in relative flex h-full w-full max-w-md flex-col pt-[var(--safe-t)] pr-[var(--safe-r)] pb-[var(--safe-b)] border-l border-border bg-surface shadow-[var(--shadow-lg)]">
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `${meta.color}1f`, color: meta.color }}
          >
            <CategoryIcon iconKey={meta.iconKey} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-text">
              {prettyCategory(target.category)}
            </h2>
            <p className="text-sm text-muted">{monthLabelLong(target.month)}</p>
          </div>
          <Button variant="ghost" aria-label="Close panel" onClick={onClose}>
            <Close size={20} />
          </Button>
        </header>

        {rows && rows.length > 0 && (
          <div className="flex items-baseline justify-between border-b border-border bg-surface-2 px-5 py-3">
            <span className="text-sm text-muted">
              {counted.length} transaction{counted.length === 1 ? "" : "s"}
              {counted.length !== rows.length && ` · ${rows.length - counted.length} ignored`}
            </span>
            <span className="tnum text-sm font-semibold text-text">
              {currencyCents(total)}
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {error && (
            <EmptyState
              icon={<Alert size={22} />}
              title="Couldn't load transactions"
              message="Something went wrong fetching this category. Close and try again."
            />
          )}

          {!error && !sorted && (
            <ul className="space-y-1 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="flex items-center justify-between px-2 py-2.5">
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-3.5 w-16" />
                </li>
              ))}
            </ul>
          )}

          {!error && sorted && sorted.length === 0 && (
            <EmptyState
              icon={<Inbox size={22} />}
              title="No transactions"
              message="There are no transactions recorded for this category in this month."
            />
          )}

          {!error && sorted && sorted.length > 0 && (
            <ul className="divide-y divide-border">
              {sorted.map((t) => {
                const amt = num(t.amount);
                const refund = amt < 0;
                return (
                  <li
                    key={t.transaction_id}
                    className="group flex items-center justify-between gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-surface-hover"
                  >
                    <div className={`min-w-0 flex-1 ${t.is_ignored ? "opacity-50" : ""}`}>
                      <p className="truncate text-sm font-medium text-text">
                        {t.transaction_name || "Unnamed transaction"}
                      </p>
                      <p className="text-xs text-subtle">
                        {dayLabel(dateStr(t.transaction_date))}
                      </p>
                    </div>
                    <span
                      className={`tnum shrink-0 text-sm font-semibold ${
                        refund ? "text-accent" : "text-text"
                      } ${t.is_ignored ? "line-through opacity-50" : ""}`}
                    >
                      {refund ? "+" : ""}
                      {currencyCents(Math.abs(amt))}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggle(t)}
                      disabled={pending.has(t.transaction_id)}
                      aria-label={`${t.is_ignored ? "Restore" : "Ignore"} ${
                        t.transaction_name || "transaction"
                      }`}
                      className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t.is_ignored ? "Restore" : "Ignore"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
