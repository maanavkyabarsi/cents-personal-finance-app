import type { BqDate, BqNumber } from "./types";

export function num(v: BqNumber): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  if (typeof v === "object" && "value" in v) return Number(v.value) || 0;
  return 0;
}

export function dateStr(v: BqDate): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && "value" in v) return v.value;
  return null;
}

export function monthKey(v: BqDate): string | null {
  const s = dateStr(v);
  return s ? s.slice(0, 7) : null;
}

const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const currencyFmtCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function currency(n: number): string {
  return currencyFmt.format(Math.round(n));
}

export function currencyCents(n: number): string {
  return currencyFmtCents.format(n);
}

export function currencyParts(n: number): { main: string; cents: string } {
  const full = currencyFmtCents.format(n);
  const dot = full.lastIndexOf(".");
  if (dot === -1) return { main: full, cents: "" };
  return { main: full.slice(0, dot), cents: full.slice(dot) };
}

export function currencyCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return `$${(n / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
}

export function percent(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export function monthLabelLong(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function dayLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Today in the browser's timezone as YYYY-MM-DD (toISOString would give the UTC day).
export function localToday(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function fullDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// "Nov 3 – Nov 10, 2026", or "Nov 3, 2026 – now" for a live event.
export function eventRangeLabel(start: string, end: string | null): string {
  if (!end) return `${fullDate(start)} – now`;
  if (start === end) return fullDate(start);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${sameYear ? dayLabel(start) : fullDate(start)} – ${fullDate(end)}`;
}

export function prettyCategory(raw: string | null): string {
  if (!raw) return "Uncategorized";
  return raw
    .toLowerCase()
    .split("_")
    .map((w) => (w === "and" ? "&" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
