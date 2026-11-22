import { expect, it, vi } from "vitest";
import { getEffectiveTrades } from "@/db/ledger";
import { priceDaily, theses, transactions } from "@/db/schema";
import { freshDb } from "@/db/test-db";
import { loadHolding } from "@/lib/portfolio/holding";
import type { ThesisInput } from "@/lib/schemas";
import {
    addInstrument,
    addTransaction,
    confirmInstrument,
    confirmThesis,
    confirmTransaction,
    proposeThesis,
    undoChatTransaction,
} from "./chat";

vi.mock("@/lib/import/raw-store", () => ({ putRaw: vi.fn() }));

const now = new Date("2026-10-29T23:30:00Z");
const buy = {
    instrument: "EXO",
    broker: "degiro",
    side: "buy",
    quantity: 10,
    price: 33.14,
    feesEur: 1,
} as const;

async function setUp() {
    const database = await freshDb();

    await database.insert(priceDaily).values({
        instrumentId: "exor",
        date: "2026-10-29",
        close: 33.2,
    });

    return database;
}

async function draft(database: Awaited<ReturnType<typeof setUp>>) {
    const preview = await addTransaction(database, buy, now);

    if (!("draftId" in preview)) throw new Error("No draft");

    return preview.draftId;
}

it("previews a trade on today's date in Madrid without recording it, warns on a price far from the close, and refuses a sell of more than is held or a date in the future", async () => {
    const database = await setUp();

    const preview = await addTransaction(database, buy, now);
    const typo = await addTransaction(database, { ...buy, price: 3.314 }, now);

    expect(preview).toMatchObject({
        instrument: "Exor",
        tradeDate: "2026-10-30",
        totalEur: 332.4,
        sharesAfter: 10,
        warnings: [],
    });
    expect(typo).toMatchObject({ warnings: [expect.stringContaining("15%")] });
    expect(await database.$count(transactions)).toBe(0);
    await expect(addTransaction(database, { ...buy, side: "sell" }, now)).rejects.toThrow("more shares than are held");
    await expect(addTransaction(database, { ...buy, tradeDate: "2026-10-31" }, now)).rejects.toThrow("in the future");
});

it("records a confirmed draft once and undoes it, and refuses a draft older than 30 minutes", async () => {
    const database = await setUp();
    const draftId = await draft(database);

    const first = await confirmTransaction(database, draftId, now);
    const again = await confirmTransaction(database, draftId, now);

    expect([first.status, again.status]).toEqual(["applied", "duplicate"]);
    expect(await getEffectiveTrades(database)).toHaveLength(1);

    await undoChatTransaction(database, draftId, now);
    expect(await getEffectiveTrades(database)).toHaveLength(0);

    const stale = await draft(database);
    const later = new Date(now.getTime() + 31 * 60_000);

    await expect(confirmTransaction(database, stale, later)).rejects.toThrow("No open draft");
});

it("refuses to undo a chat trade the broker's export has replaced", async () => {
    const database = await setUp();
    const draftId = await draft(database);

    await confirmTransaction(database, draftId, now);
    await database.update(transactions).set({ supersededBy: "degiro:order-1" });

    await expect(undoChatTransaction(database, draftId, now)).rejects.toThrow("replaced");
});

it("saves a thesis only once confirmed, makes the newest one the holding's current thesis, and refuses a bargain with one pillar or a trade's draft", async () => {
    const database = await setUp();
    const bargain: ThesisInput = {
        instrument: "EXO",
        type: "bargain",
        pillars: [
            { claim: "US margins recover", wrongIf: "The US margin stays under 4% for two years" },
            { claim: "Buybacks go on", wrongIf: "They stop" },
        ],
        reason: "Cheap on normal earnings",
    };
    const propose = async (input: ThesisInput) => {
        const preview = await proposeThesis(database, input, now);

        if (!("draftId" in preview)) throw new Error("No draft");

        return preview.draftId;
    };

    await confirmTransaction(database, await draft(database), now);

    const first = await propose(bargain);

    expect(await database.$count(theses)).toBe(0);

    await confirmThesis(database, first, now);
    await confirmThesis(database, await propose({ ...bargain, type: "compounder", reason: "Its moat held" }), now);

    expect((await loadHolding(database, "exor"))?.position?.thesis).toMatchObject({ type: "compounder" });
    await expect(proposeThesis(database, { ...bargain, pillars: bargain.pillars.slice(1) }, now)).rejects.toThrow(
        "two to four pillars",
    );
    await expect(confirmThesis(database, await draft(database), now)).rejects.toThrow("not a thesis");
});

it("adds an instrument only once confirmed, so a trade can name it, and refuses an ISIN the ledger knows", async () => {
    const database = await setUp();
    const wolters = { isin: "NL0000395903", name: "Wolters Kluwer", currency: "EUR", yahooSymbol: "WKL.AS" } as const;
    const preview = await addInstrument(database, wolters, now);

    await expect(addTransaction(database, { ...buy, instrument: "WKL" }, now)).rejects.toThrow("No instrument matches");
    expect(await confirmInstrument(database, preview.draftId, now)).toMatchObject({ status: "applied" });
    expect(await addTransaction(database, { ...buy, instrument: "WKL" }, now)).toHaveProperty("draftId");
    await expect(
        addInstrument(database, { ...wolters, name: "Philips again", isin: "NL0000009538" }, now),
    ).rejects.toThrow("already belongs to philips");
});
