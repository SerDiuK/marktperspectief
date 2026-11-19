import { expect, it } from "vitest";
import { annualDividend } from "./dividends";

it("estimates a year of dividends from the last 12 months, a late payer's last dividend, without specials or stopped payers", () => {
    const asOf = "2026-10-27";

    expect(
        annualDividend(
            [
                { exDate: "2025-05-19", amount: 2.16 },
                { exDate: "2025-08-12", amount: 1.38 },
                { exDate: "2026-05-25", amount: 2.5 },
                { exDate: "2026-08-10", amount: 1.55 },
            ],
            asOf,
        ),
    ).toBeCloseTo(4.05);
    expect(
        annualDividend(
            [
                { exDate: "2024-09-02", amount: 1.2 },
                { exDate: "2025-09-15", amount: 1.3 },
            ],
            asOf,
        ),
    ).toBe(1.3);
    expect(
        annualDividend(
            [
                { exDate: "2025-11-03", amount: 0.5 },
                { exDate: "2026-03-02", amount: 3 },
                { exDate: "2026-05-04", amount: 0.5 },
            ],
            asOf,
        ),
    ).toBe(1);
    expect(annualDividend([{ exDate: "2025-04-22", amount: 0.68 }], asOf)).toBe(0);
});
