import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { corporateActions, fxDaily, portfolioDaily, priceDaily, transactions } from "@/db/schema";
import { freshDb, insertRawImport } from "@/db/test-db";
import { loadPortfolio } from "./load";
import { refreshDerived } from "./refresh";

it("buys in euros at the last ECB rate, fees included, and values an instrument without a symbol at its trade price", async () => {
    const db = await freshDb();

    await db.delete(corporateActions);

    const buy = {
        source: "degiro",
        broker: "degiro",
        rawImportId: await insertRawImport(db),
        side: "buy",
        tradeDate: "2025-04-17",
        quantity: 10,
    } as const;

    await db.insert(transactions).values([
        {
            ...buy,
            externalKey: "msft",
            instrumentId: "microsoft",
            price: 150,
            currency: "USD",
            feesEur: 2,
        },
        {
            ...buy,
            externalKey: "telenet",
            instrumentId: "telenet",
            price: 20,
            currency: "EUR",
        },
    ]);
    await db.insert(fxDaily).values({ currency: "USD", date: "2025-04-16", perEur: 1.25 });
    await db.insert(priceDaily).values({ instrumentId: "microsoft", date: "2025-04-17", close: 150 });

    await refreshDerived(db, "2025-04-17");

    expect(await db.select().from(portfolioDaily).where(eq(portfolioDaily.date, "2025-04-17"))).toMatchObject([
        { inflowCents: 140200, valueCents: 140000 },
    ]);
});

it("runs the series to a trade dated after the latest close, and values the series and the holdings at its price from then on, never at an older one", async () => {
    const db = await freshDb();

    await db.delete(corporateActions);

    const rawImportId = await insertRawImport(db);
    const buy = {
        source: "degiro",
        broker: "degiro",
        rawImportId,
        instrumentId: "kbc",
        side: "buy",
        quantity: 10,
        price: 70,
        currency: "EUR",
    } as const;

    await db.insert(transactions).values([
        { ...buy, externalKey: "first", tradeDate: "2025-04-16" },
        { ...buy, externalKey: "chat", tradeDate: "2025-04-18", price: 80 },
        { ...buy, externalKey: "stale", instrumentId: "arcelormittal", tradeDate: "2024-12-02", price: 50 },
    ]);
    await db.insert(priceDaily).values([
        { instrumentId: "kbc", date: "2025-04-16", close: 70 },
        { instrumentId: "kbc", date: "2025-04-17", close: 75 },
        { instrumentId: "arcelormittal", date: "2024-12-02", close: 50 },
        { instrumentId: "arcelormittal", date: "2025-01-02", close: 60 },
    ]);

    await refreshDerived(db, "2025-04-22");

    const rows = await db.select().from(portfolioDaily);

    expect(rows.at(-1)).toMatchObject({ date: "2025-04-18", inflowCents: 80000, valueCents: 220000 });
    expect((await loadPortfolio(db)).holdings).toMatchObject([
        { instrumentId: "kbc", valueEur: 1600 },
        { instrumentId: "arcelormittal", price: null },
    ]);
});
