import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { dividendEvents, priceDaily } from "@/db/schema";
import { freshDb } from "@/db/test-db";
import { fetchEcbRates } from "./ecb";
import { syncMarketData } from "./sync";
import { fetchChart } from "./yahoo";

vi.mock("./yahoo", () => ({ fetchChart: vi.fn() }));
vi.mock("./ecb", () => ({ fetchEcbRates: vi.fn() }));

it("refetches a listing from 10 days before its last close, and stores closes only in the instrument's currency", async () => {
    const db = await freshDb();

    await db.insert(priceDaily).values({ instrumentId: "philips", date: "2026-10-20", close: 900 });
    await db.insert(dividendEvents).values({ instrumentId: "ackermans", exDate: "2026-05-20", amount: 3.6 });
    vi.mocked(fetchChart).mockResolvedValue({
        currency: "EUR",
        closes: [{ date: "2026-10-23", close: 950 }],
        dividends: [],
    });
    vi.mocked(fetchEcbRates).mockResolvedValue([]);

    await syncMarketData(db);

    expect(fetchChart).toHaveBeenCalledWith("PHIA.AS", "2026-10-10");
    expect(await db.select().from(priceDaily).where(eq(priceDaily.instrumentId, "nestle"))).toEqual([]);
});

it("fetches every listing in full until a dividend is stored, stores its dividends, and reports a failed ECB fetch", async () => {
    const db = await freshDb();

    await db.insert(priceDaily).values({ instrumentId: "ackermans", date: "2026-10-20", close: 260 });
    vi.mocked(fetchChart).mockResolvedValue({
        currency: "EUR",
        closes: [],
        dividends: [{ exDate: "2026-05-20", amount: 3.6 }],
    });
    vi.mocked(fetchEcbRates).mockRejectedValue(new Error("HTTP 503"));

    expect((await syncMarketData(db)).failures).toContain("ECB: HTTP 503");
    expect(fetchChart).toHaveBeenCalledWith("ACKB.BR", "2017-12-15");
    expect(await db.select().from(dividendEvents).where(eq(dividendEvents.instrumentId, "ackermans"))).toEqual([
        { instrumentId: "ackermans", exDate: "2026-05-20", amount: 3.6 },
    ]);
});
