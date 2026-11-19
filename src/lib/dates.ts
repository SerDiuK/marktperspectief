// en-CA formats a date as YYYY-MM-DD.
export function dateIn(timeZone: string) {
    const format = new Intl.DateTimeFormat("en-CA", { timeZone });

    return (instant: Date) => format.format(instant);
}

export const ownerDate = dateIn(process.env.OWNER_TIME_ZONE ?? "Europe/Madrid");

export function addDays(date: string, days: number) {
    const day = new Date(`${date}T00:00:00Z`);

    day.setUTCDate(day.getUTCDate() + days);

    return day.toISOString().slice(0, 10);
}

export const ranges = ["1M", "6M", "YTD", "1Y", "5Y", "All"] as const;

export type Range = (typeof ranges)[number];

export function rangeStart(range: Range, asOf: string) {
    const months = { "1M": 1, "6M": 6, "1Y": 12, "5Y": 60 } as const;

    if (range === "All") return "";
    if (range === "YTD") return `${asOf.slice(0, 4)}-01-01`;

    const [year, month, day] = asOf.split("-").map(Number);
    const monthDays = new Date(Date.UTC(year, month - months[range], 0)).getUTCDate();

    return new Date(Date.UTC(year, month - 1 - months[range], Math.min(day, monthDays))).toISOString().slice(0, 10);
}
