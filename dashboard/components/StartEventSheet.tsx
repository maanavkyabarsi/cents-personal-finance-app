"use client";

import { useEffect, useState } from "react";
import { localToday } from "@/lib/format";
import type { EventInput } from "@/lib/types";
import type { AccountOption } from "./Topbar";
import { Close } from "./icons";
import { Button, cx } from "./primitives";

const inputClass =
  "h-10 w-full rounded-xl border border-border bg-surface px-3 text-[16px] text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-sm";

// Modal for starting an event (or logging a past one by giving an end date). Mount it only
// while open so the form starts fresh each time. onCreate returns an error message to show
// inline, or null on success (the parent closes the sheet).
export function StartEventSheet({
  accountOptions,
  onClose,
  onCreate,
}: {
  accountOptions: AccountOption[];
  onClose: () => void;
  onCreate: (input: EventInput) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(localToday);
  const [endDate, setEndDate] = useState("");
  const [accountIds, setAccountIds] = useState<Set<string>>(new Set());
  const [counted, setCounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleAccount = (id: string) =>
    setAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!name.trim()) return setError("Give the event a name.");
    if (!startDate) return setError("Pick a start date.");
    if (endDate && endDate < startDate) return setError("The end date is before the start date.");
    setSaving(true);
    setError(null);
    const message = await onCreate({
      name: name.trim(),
      start_date: startDate,
      end_date: endDate || null,
      account_ids: [...accountIds],
      count_in_totals: counted,
    });
    if (message) {
      setError(message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Start an event">
      <div className="absolute inset-0 animate-fade-in bg-black/45" onClick={onClose} aria-hidden />
      <form
        onSubmit={submit}
        className="animate-fade-up relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-2xl border border-border bg-surface pb-[var(--safe-b)] shadow-[var(--shadow-lg)] sm:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text">Start an event</h2>
          <Button variant="ghost" aria-label="Close" onClick={onClose}>
            <Close size={20} />
          </Button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Tokyo trip"
              autoFocus
              className={inputClass}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Starts</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Ends (optional)</span>
              <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
            </label>
          </div>
          <p className="-mt-3 text-xs text-subtle">
            Leave the end empty to keep it live until you end it. Purchases from the start date on are included, including ones that post later.
          </p>

          {accountOptions.length > 0 && (
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-muted">Accounts</legend>
              <div className="space-y-1">
                <AccountCheck label="All accounts" checked={accountIds.size === 0} onChange={() => setAccountIds(new Set())} />
                {accountOptions.map((o) => (
                  <AccountCheck key={o.id} label={o.label} checked={accountIds.has(o.id)} onChange={() => toggleAccount(o.id)} />
                ))}
              </div>
            </fieldset>
          )}

          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-muted">Monthly totals</legend>
            <div className="space-y-2">
              <ModeOption
                selected={!counted}
                onSelect={() => setCounted(false)}
                title="Keep separate"
                description="Event spending stays out of your monthly budget and categories."
              />
              <ModeOption
                selected={counted}
                onSelect={() => setCounted(true)}
                title="Also count"
                description="It counts toward your monthly budget, and you can still see it on its own."
              />
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Starting…" : endDate ? "Add event" : "Start event"}
          </Button>
        </footer>
      </form>
    </div>
  );
}

function AccountCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-text hover:bg-surface-hover">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 accent-[var(--primary)]" />
      <span className="min-w-0 truncate">{label}</span>
    </label>
  );
}

function ModeOption({
  selected,
  onSelect,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cx(
        "w-full cursor-pointer rounded-xl border px-3.5 py-3 text-left transition-colors",
        selected ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-hover"
      )}
    >
      <span className={cx("block text-sm font-semibold", selected ? "text-primary" : "text-text")}>{title}</span>
      <span className="mt-0.5 block text-xs text-muted">{description}</span>
    </button>
  );
}
