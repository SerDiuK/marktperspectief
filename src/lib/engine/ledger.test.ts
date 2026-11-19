import { expect, it } from "vitest";
import { type LedgerTrade, replay } from "./ledger";
import { toMicro } from "./money";

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

it("sells the oldest shares first, and a part-sold lot keeps its share of the cost", () => {
    const { books } = replay(
        [
            trade(1, "buy", "2024-01-02", 10, 100),
            trade(2, "buy", "2024-02-01", 10, 101),
            trade(3, "sell", "2024-03-01", 15, 106),
        ],
        [],
    );

    expect(books.get("arcelormittal")?.lots).toEqual([{ acquiredOn: "2024-02-01", micro: toMicro(5), cost: 50500 }]);
});

it("throws on a sell of more shares than are held, naming the trade", () => {
    const oversell = () =>
        replay([trade(1, "buy", "2024-01-02", 10, 100), trade(2, "sell", "2024-03-01", 11, 106)], []);

    expect(oversell).toThrow("Selling 11 arcelormittal on 2024-03-01 ");
});

it("starts the holding period again after a full exit", () => {
    const { books } = replay(
        [
            trade(1, "buy", "2020-06-01", 10, 100),
            trade(2, "sell", "2021-02-15", 10, 90),
            trade(3, "buy", "2021-05-03", 5, 95),
            trade(4, "buy", "2021-08-02", 2, 97),
        ],
        [],
    );

    expect(books.get("arcelormittal")?.heldSince).toBe("2021-05-03");
});

it("closes a holding period with what it bought and sold, once the last share is sold", () => {
    const { closed } = replay(
        [
            trade(1, "buy", "2020-06-01", 10, 100),
            trade(2, "buy", "2020-09-01", 5, 110),
            trade(3, "sell", "2021-02-15", 15, 120),
            trade(4, "buy", "2021-05-03", 5, 95),
            trade(5, "sell", "2021-08-02", 2, 97),
        ],
        [],
    );

    expect(closed).toEqual([
        {
            instrumentId: "arcelormittal",
            from: "2020-06-01",
            to: "2021-02-15",
            bought: 155000,
            sold: 180000,
        },
    ]);
});

it("keeps the lots' dates and costs through a move between brokers", () => {
    const { books } = replay(
        [
            trade(1, "buy", "2019-01-02", 10, 100),
            trade(2, "transfer_out", "2021-10-01", 10, 100),
            trade(3, "transfer_in", "2021-10-04", 10, 104),
        ],
        [],
    );

    expect(books.get("arcelormittal")?.lots).toEqual([{ acquiredOn: "2019-01-02", micro: toMicro(10), cost: 100000 }]);
});

it("adds a stock dividend's shares at no cost, before that day's trades", () => {
    const { books } = replay(
        [trade(1, "buy", "2021-10-04", 10, 100), trade(2, "sell", "2021-12-21", 11, 110)],
        [{ date: "2021-12-21", instrumentId: "arcelormittal", micro: toMicro(2) }],
    );

    expect(books.get("arcelormittal")?.lots).toEqual([{ acquiredOn: "2021-12-21", micro: toMicro(1), cost: 0 }]);
});
