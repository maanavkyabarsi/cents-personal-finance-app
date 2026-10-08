"use client";

import { useEffect, useState } from "react";
import { monthLabel } from "@/lib/format";
import { Check, ChevronDown, Refresh, RingMark } from "./icons";
import { cx } from "./primitives";

export interface AccountOption {
  id: string;
  label: string;
}

function AccountSelect({
  options,
  value,
  onChange,
}: {
  options: AccountOption[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = value
    ? options.find((o) => o.id === value)?.label ?? "Account"
    : "All accounts";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 max-w-[min(200px,50vw)] cursor-pointer items-center gap-1.5 rounded-[10px] border border-border px-3 text-[13px] font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text"
      >
        <span className="truncate">{current}</span>
        <ChevronDown size={14} className="shrink-0 text-subtle" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="absolute right-0 z-40 mt-1.5 min-w-[224px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-1 shadow-[var(--shadow-lg)]"
            role="listbox"
          >
            <AccountRow
              label="All accounts"
              selected={value === null}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            />
            {options.map((o) => (
              <AccountRow
                key={o.id}
                label={o.label}
                selected={value === o.id}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AccountRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      role="option"
      aria-selected={selected}
      className={cx(
        "flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-hover",
        selected ? "font-medium text-text" : "text-muted"
      )}
    >
      <span className="truncate">{label}</span>
      {selected && <Check size={15} className="shrink-0 text-primary" />}
    </button>
  );
}

export function TopStrip({
  theme,
  onSetTheme,
}: {
  theme: "light" | "dark";
  onSetTheme: (t: "light" | "dark") => void;
}) {
  return (
    <div className="sticky top-0 z-30 flex h-[var(--topbar-total)] items-center justify-between border-b border-border bg-bg/90 pt-[var(--safe-t)] pl-[max(1.25rem,var(--safe-l))] pr-[max(1.25rem,var(--safe-r))] backdrop-blur max-lg:short:static lg:px-10">
      <div className="flex items-center gap-2 text-primary">
        <RingMark size={22} />
        <span className="font-serif text-[19px] font-medium tracking-[-0.01em]">
          cents
        </span>
      </div>

      <div className="flex rounded-full border border-border p-0.5">
        {(["light", "dark"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => onSetTheme(mode)}
            aria-pressed={theme === mode}
            className={cx(
              "cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition-colors",
              theme === mode
                ? "bg-primary text-on-primary"
                : "text-muted hover:text-text"
            )}
          >
            {mode}
          </button>
        ))}
      </div>
    </div>
  );
}

function MonthSelect({
  months,
  value,
  onChange,
}: {
  months: string[];
  value: string;
  onChange: (m: string) => void;
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Select month</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="tnum cursor-pointer appearance-none bg-transparent pr-7 text-[22px] font-medium tracking-[-0.01em] text-text focus-visible:outline-none"
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-1 text-muted"
      />
    </label>
  );
}

export function PageHeader({
  title,
  months,
  month,
  onMonthChange,
  accountOptions,
  accountId,
  onAccountChange,
  onRefresh,
  refreshing,
}: {
  title: string;
  months: string[];
  month: string;
  onMonthChange: (m: string) => void;
  accountOptions: AccountOption[];
  accountId: string | null;
  onAccountChange: (id: string | null) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">
          {title}
        </span>
        {months.length > 0 ? (
          <MonthSelect months={months} value={month} onChange={onMonthChange} />
        ) : (
          <span className="text-[22px] font-medium text-text">Overview</span>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-2">
        {accountOptions.length > 0 && (
          <AccountSelect
            options={accountOptions}
            value={accountId}
            onChange={onAccountChange}
          />
        )}
        <button
          onClick={onRefresh}
          aria-label="Refresh data"
          disabled={refreshing}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border border-border text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-50"
        >
          <Refresh size={16} className={cx(refreshing && "animate-spin")} />
        </button>
      </div>
    </div>
  );
}
