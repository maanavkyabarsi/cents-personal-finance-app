"use client";

import type { EventRecord } from "@/lib/types";

const REMOVE = "__remove__";

// Pill shown on a transaction that belongs to an event. A "counted" event also feeds the
// monthly totals; a separate one doesn't, so its rows are dimmed by the caller.
export function EventBadge({
  name,
  counted,
}: {
  name: string | null | undefined;
  counted: boolean | null | undefined;
}) {
  return (
    <span
      title={
        counted
          ? `In event "${name}" · also counted in monthly totals`
          : `In event "${name}" · not counted in monthly totals`
      }
      className="ml-1.5 inline-block max-w-[110px] truncate rounded bg-primary-soft px-1.5 py-0.5 align-middle text-[10px] font-medium text-primary"
    >
      {name || "Event"}
      {counted ? " · counted" : ""}
    </span>
  );
}

export type EventMoveHandler = (
  transactionId: string,
  eventId: string | null
) => Promise<boolean>;

// Native select (works well on touch) for moving a transaction into an event or taking it
// out of the one it's in. Renders nothing until at least one event exists.
export function EventMoveMenu({
  events,
  currentEventId,
  disabled,
  label,
  onSelect,
  className = "",
}: {
  events: EventRecord[];
  currentEventId: string | null | undefined;
  disabled?: boolean;
  label: string;
  onSelect: (eventId: string | null) => void;
  className?: string;
}) {
  if (events.length === 0) return null;
  return (
    <select
      value=""
      disabled={disabled}
      aria-label={label}
      onChange={(e) => {
        const v = e.target.value;
        if (!v) return;
        onSelect(v === REMOVE ? null : v);
      }}
      className={`shrink-0 cursor-pointer rounded-md bg-transparent px-1.5 py-1 font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <option value="">Event</option>
      {currentEventId && <option value={REMOVE}>Remove from event</option>}
      {events.map((e) => (
        <option key={e.event_id} value={e.event_id} disabled={e.event_id === currentEventId}>
          {e.name}
          {e.live ? " (live)" : ""}
        </option>
      ))}
    </select>
  );
}
