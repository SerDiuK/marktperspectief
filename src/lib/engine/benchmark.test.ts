import { expect, it } from "vitest";
import { totalReturnIndex } from "./benchmark";

it("reinvests a dividend at the first close on or after its ex-date, carries the last close over days without one, and is null before the first", () => {
    const index = totalReturnIndex(
        [
            { date: "2024-01-08", value: 100 },
            { date: "2024-01-10", value: 98 },
            { date: "2024-01-11", value: 99 },
        ],
        [{ exDate: "2024-01-09", amount: 2 }],
        ["2024-01-05", "2024-01-08", "2024-01-09", "2024-01-10", "2024-01-11"],
    );

    expect(index).toEqual([null, 1, 1, 1, 99 / 98]);
});
