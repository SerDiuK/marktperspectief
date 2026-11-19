import { expect, it } from "vitest";
import { formatEur, formatPercent } from "./format";

it("shows no minus sign on an amount that rounds to zero", () => {
    expect([formatEur(-0.001), formatPercent(-0.00001)]).toEqual(["€0.00", "0.0%"]);
});
