import { expect, it, vi } from "vitest";
import { fetchChart } from "./yahoo";

const response = vi.hoisted(() => ({
    meta: { currency: "EUR", exchangeTimezoneName: "Europe/Amsterdam" },
    quotes: [
        { date: new Date("2023-09-12T22:00:00Z"), close: 25 },
        { date: new Date("2023-09-13T22:00:00Z"), close: 25.2 },
        { date: new Date("2023-09-14T22:00:00Z"), close: null },
    ],
    events: {
        dividends: [
            { date: new Date("2023-09-12T07:00:00Z"), amount: 0.05 },
            { date: new Date("2023-09-12T07:00:00Z"), amount: 0.01 },
        ],
        splits: [
            {
                date: new Date("2023-09-14T07:00:00Z"),
                numerator: 2.1796,
                denominator: 1,
            },
        ],
    },
}));

vi.mock("yahoo-finance2", () => ({
    default: class {
        chart = async () => response;
    },
}));

it("multiplies closes and dividends before a split back to the traded amounts, on the exchange's own date", async () => {
    const { closes, dividends } = await fetchChart("PRX.AS", "2023-09-01");

    expect(closes).toEqual([
        { date: "2023-09-13", close: 25 * 2.1796 },
        { date: "2023-09-14", close: 25.2 },
    ]);
    expect(dividends).toEqual([{ exDate: "2023-09-12", amount: 0.05 * 2.1796 + 0.01 * 2.1796 }]);
});
