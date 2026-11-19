import { expect, it } from "vitest";
import { type PutTrade, putPositions } from "./options";

const put = (expiry: string, side: PutTrade["side"], date: string, contracts: number, cents = 0): PutTrade => ({
    instrumentId: "heineken",
    strike: 18,
    expiry,
    side,
    date,
    contracts,
    cents,
});

it("nets each put's premium and closes it by buy back, assignment or expiry", () => {
    const positions = putPositions([
        put("2024-03-15", "sell", "2024-02-06", 1, 15425),
        put("2024-03-15", "buy", "2024-03-08", 1, 5075),
        put("2025-03-21", "sell", "2024-06-03", 1, 18925),
        put("2025-03-21", "sell", "2024-06-03", 1, 18925),
        put("2025-03-21", "assigned", "2025-03-21", 2),
        put("2025-06-20", "sell", "2025-01-10", 2, 40000),
    ]);

    expect(positions).toMatchObject([
        { outcome: "bought back", closed: "2024-03-08", premium: 10350 },
        { outcome: "assigned", closed: "2025-03-21", sold: 2, premium: 37850 },
        { outcome: "open", open: 2 },
    ]);
});
