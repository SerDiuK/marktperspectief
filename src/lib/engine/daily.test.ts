import { expect, it } from "vitest";
import { dailySeries } from "./daily";
import type { LedgerTrade } from "./ledger";
import { toMicro } from "./money";
import type { PutTrade } from "./options";
import type { Point } from "./series";

function trade(id: number, side: LedgerTrade["side"], date: string, shares: number, price: number): LedgerTrade {
    return {
        id,
        instrumentId: "arcelormittal",
        side,
        date,
        micro: toMicro(shares),
        cents: Math.round(shares * price * 100),
    };
}

const series = (
    trades: LedgerTrade[],
    closes: Point[],
    until: string,
    cashFlows: Point[] = [],
    puts: PutTrade[] = [],
) =>
    dailySeries({
        trades,
        stockDividends: [],
        puts,
        cashFlows,
        closes: new Map([["arcelormittal", closes]]),
        until,
    });

it("pays a put's premium out, and counts an open put against the value at what it is in the money", () => {
    const rows = series(
        [trade(1, "buy", "2024-01-08", 10, 100)],
        [
            { date: "2024-01-08", value: 100 },
            { date: "2024-01-10", value: 90 },
        ],
        "2024-01-10",
        [],
        [
            {
                instrumentId: "arcelormittal",
                strike: 95,
                expiry: "2024-03-15",
                side: "sell",
                date: "2024-01-09",
                contracts: 1,
                cents: 20000,
            },
        ],
    );

    expect(rows.slice(-2)).toMatchObject([
        { date: "2024-01-09", valueCents: 100000, outflowCents: 20000 },
        { date: "2024-01-10", valueCents: 40000 },
    ]);
});

it("keeps buys and sells out of the return", () => {
    const rows = series(
        [
            trade(1, "buy", "2024-01-08", 10, 100),
            trade(2, "buy", "2024-01-09", 10, 100),
            trade(3, "sell", "2024-01-11", 20, 110),
        ],
        [
            { date: "2024-01-08", value: 100 },
            { date: "2024-01-10", value: 110 },
        ],
        "2024-01-11",
    );

    expect(rows.map(({ twrIndex }) => twrIndex)).toEqual([1, 1, 1, 1.1, 1.1]);
});

it("counts a dividend paid while nothing is held on the next day with money in", () => {
    const rows = series(
        [
            trade(1, "buy", "2024-01-08", 10, 100),
            trade(2, "sell", "2024-01-09", 10, 100),
            trade(3, "buy", "2024-01-11", 10, 100),
        ],
        [{ date: "2024-01-08", value: 100 }],
        "2024-01-11",
        [{ date: "2024-01-10", value: 5000 }],
    );

    expect(rows.at(-1)?.twrIndex).toBe(1.05);
});

it("gives a cash flow on a weekend its own day", () => {
    const rows = series([trade(1, "buy", "2024-01-12", 10, 100)], [{ date: "2024-01-12", value: 100 }], "2024-01-15", [
        { date: "2024-01-13", value: 500 },
    ]);

    expect(rows.find(({ date }) => date === "2024-01-13")).toMatchObject({ outflowCents: 500 });
});

it("throws on a held day before the first close", () => {
    const holdingWithoutPrice = () =>
        series([trade(1, "buy", "2024-01-08", 10, 100)], [{ date: "2024-01-09", value: 100 }], "2024-01-09");

    expect(holdingWithoutPrice).toThrow("No price for arcelormittal on or before 2024-01-08");
});
