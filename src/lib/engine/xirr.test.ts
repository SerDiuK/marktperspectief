import { expect, it } from "vitest";
import { xirr } from "./xirr";

it("matches Excel's XIRR example", () => {
    const rate = xirr([
        { date: "2008-01-01", value: -10000 },
        { date: "2008-03-01", value: 2750 },
        { date: "2008-10-30", value: 4250 },
        { date: "2009-02-15", value: 3250 },
        { date: "2009-04-01", value: 2750 },
    ]);

    expect(rate).toBeCloseTo(0.373362535, 8);
});

it("bisects when Newton leaves the range, and has no rate for flows of one sign", () => {
    const nearTotalLoss = xirr([
        { date: "2020-01-01", value: -1000 },
        { date: "2020-12-31", value: 1 },
        { date: "2021-12-31", value: 1 },
    ]);

    expect(nearTotalLoss).toBeCloseTo(-0.96787, 4);
    expect(
        xirr([
            { date: "2020-01-01", value: 100 },
            { date: "2021-01-01", value: 100 },
        ]),
    ).toBeNull();
});
