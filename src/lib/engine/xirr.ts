import type { Point } from "./series";

const DAY = 86_400_000;

/** Excel's XIRR, or null when the flows have no rate. */
export function xirr(flows: Point[]) {
    const start = Date.parse(flows[0].date);
    const terms = flows.map(({ date, value }) => ({
        years: (Date.parse(date) - start) / DAY / 365,
        value,
    }));
    const npv = (rate: number) => terms.reduce((sum, { years, value }) => sum + value / (1 + rate) ** years, 0);
    const slope = (rate: number) =>
        terms.reduce((sum, { years, value }) => sum - (years * value) / (1 + rate) ** (years + 1), 0);

    let rate = 0.1;

    for (let step = 0; step < 50; step++) {
        const next = rate - npv(rate) / slope(rate);

        if (!Number.isFinite(next) || next <= -1) break;
        if (Math.abs(next - rate) < 1e-10) return next;
        rate = next;
    }

    const grid = Array.from({ length: 1100 }, (_, i) => -0.99 + i * 0.01);
    const brackets = grid
        .slice(1)
        .map((high, i) => [grid[i], high])
        .filter(([low, high]) => Math.sign(npv(low)) !== Math.sign(npv(high)));

    if (!brackets.length) return null;

    let [low, high] = brackets.reduce((best, bracket) =>
        Math.abs(bracket[0] - 0.1) < Math.abs(best[0] - 0.1) ? bracket : best,
    );

    while (high - low > 1e-10) {
        const middle = (low + high) / 2;

        if (Math.sign(npv(middle)) === Math.sign(npv(low))) low = middle;
        else high = middle;
    }

    return (low + high) / 2;
}

/** A growth factor over a period as a yearly rate, counting days as XIRR does. */
export function annualised(growth: number, from: string, to: string) {
    return growth ** ((365 * DAY) / (Date.parse(to) - Date.parse(from))) - 1;
}

export function compounded(rate: number, from: string, to: string) {
    return (1 + rate) ** ((Date.parse(to) - Date.parse(from)) / (365 * DAY)) - 1;
}
