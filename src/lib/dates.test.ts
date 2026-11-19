import { expect, it } from "vitest";
import { rangeStart } from "./dates";

it("starts a range on the same day months back, or that month's last day when it is shorter", () => {
    expect([rangeStart("1M", "2026-03-31"), rangeStart("1Y", "2024-02-29"), rangeStart("6M", "2026-10-15")]).toEqual([
        "2026-02-28",
        "2023-02-28",
        "2026-04-15",
    ]);
});
