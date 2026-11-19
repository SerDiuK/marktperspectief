import type { Point } from "./series";
import { xirr } from "./xirr";

/** The money-weighted return of each day's flow put into the index. Days come oldest first. */
export function simulate(days: { date: string; cents: number; index: number }[]) {
    let units = 0;
    const flows: Point[] = [];

    for (const { date, cents, index } of days) {
        if (!cents) continue;

        const held = units * index;

        if (-cents > held) {
            units = 0;
            flows.push({ date, value: held });
        } else {
            units += cents / index;
            flows.push({ date, value: -cents });
        }
    }

    const last = days[days.length - 1];

    return xirr([...flows, { date: last.date, value: units * last.index }]);
}
