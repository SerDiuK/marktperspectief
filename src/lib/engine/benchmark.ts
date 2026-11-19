import type { DividendEvent } from "./dividends";
import { asOf, type Point } from "./series";

/** Closes and dividends come oldest first. Null before the first close. */
export function totalReturnIndex(closes: Point[], dividends: DividendEvent[], dates: string[]) {
    const index: Point[] = [];
    let next = 0;

    for (const [i, { date, value }] of closes.entries()) {
        let paid = 0;

        while (next < dividends.length && dividends[next].exDate <= date) {
            paid += dividends[next++].amount;
        }

        index.push({
            date,
            value: i ? (index[i - 1].value * (value + paid)) / closes[i - 1].value : 1,
        });
    }

    return dates.map((date) => asOf(index, date) ?? null);
}
