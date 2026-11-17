"use client";

import { useState } from "react";
import { currencyCents, eventRangeLabel } from "@/lib/format";
import type { EventRecord } from "@/lib/types";
import { Button } from "./primitives";

// Banner shown on every view while an event is live.
export function EventBar({
  event,
  onOpen,
  onEnd,
}: {
  event: EventRecord;
  onOpen: () => void;
  onEnd: () => Promise<boolean>;
}) {
  const [ending, setEnding] = useState(false);

  const end = async () => {
    setEnding(true);
    await onEnd();
    setEnding(false);
  };

  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-primary-soft px-4 py-3">
      <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-40" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
      </span>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 cursor-pointer text-left">
        <span className="block truncate text-sm font-semibold text-text">
          {event.name} <span className="font-medium text-primary">· live</span>
        </span>
        <span className="tnum block truncate text-xs text-muted">
          {eventRangeLabel(event.start_date, null)} · {currencyCents(event.total)} across{" "}
          {event.transaction_count} transaction{event.transaction_count === 1 ? "" : "s"}
          {event.count_in_totals ? " · also counted in monthly totals" : " · kept out of monthly totals"}
        </span>
      </button>
      <Button onClick={end} disabled={ending} className="h-9">
        {ending ? "Ending…" : "End event"}
      </Button>
    </div>
  );
}
