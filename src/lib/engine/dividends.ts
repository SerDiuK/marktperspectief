import { addDays } from "@/lib/dates";

export type DividendEvent = { exDate: string; amount: number };

const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = sorted.length >> 1;

    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Events come oldest first. */
export function dividendPaid(events: DividendEvent[], payDate: string) {
    const from = addDays(payDate, -60);

    return events.findLast(({ exDate }) => exDate <= payDate && exDate >= from);
}

/**
 * Per share: the last 12 months of dividends, or the last one when it is up to
 * 3 months late. Events come oldest first.
 */
export function annualDividend(events: DividendEvent[], asOf: string) {
    const recent = events.filter(({ exDate }) => exDate <= asOf && exDate > addDays(asOf, -456));

    if (!recent.length) return 0;

    const cap = 2 * median(recent.slice(-4).map(({ amount }) => amount));
    const regular = recent.filter(({ amount }) => amount <= cap);
    const yearAgo = addDays(asOf, -365);
    const lastYear = regular.filter(({ exDate }) => exDate > yearAgo);

    return (lastYear.length ? lastYear : regular.slice(-1)).reduce((sum, { amount }) => sum + amount, 0);
}
