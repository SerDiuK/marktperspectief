import { expect, it } from "vitest";
import { simulate } from "./simulate";
import { xirr } from "./xirr";

it("sells every unit for a withdrawal the index position can't cover, and rates only what it paid out", () => {
    const result = simulate([
        { date: "2024-01-02", cents: 100_000, index: 1 },
        { date: "2024-07-01", cents: -80_000, index: 0.5 },
        { date: "2024-10-01", cents: 10_000, index: 0.5 },
        { date: "2025-01-02", cents: 0, index: 0.6 },
    ]);

    expect(result).toBe(
        xirr([
            { date: "2024-01-02", value: -100_000 },
            { date: "2024-07-01", value: 50_000 },
            { date: "2024-10-01", value: -10_000 },
            { date: "2025-01-02", value: 12_000 },
        ]),
    );
});
