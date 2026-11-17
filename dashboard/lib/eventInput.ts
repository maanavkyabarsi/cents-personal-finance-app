// Pure input helpers shared by the /api/events routes.

export function isIsoDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const parsed = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

// UTC "today". Clients that care about their local day should send start_date/end_date.
export function todayIso() {
    return new Date().toISOString().slice(0, 10)
}

export function parseName(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const name = value.trim()
    return name.length >= 1 && name.length <= 60 ? name : null
}

// Returns a de-duplicated list, or null when the value isn't an array of non-empty strings.
// An empty array means "all accounts".
export function parseAccountIds(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null
    if (!value.every((v) => typeof v === 'string' && v.length > 0)) return null
    return [...new Set(value as string[])]
}
