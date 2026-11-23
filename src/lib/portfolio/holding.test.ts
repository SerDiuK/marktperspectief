import { expect, it } from "vitest";
import { income, priceDaily, transactions } from "@/db/schema";
import { freshDb, insertRawImport } from "@/db/test-db";
import { loadHolding } from "./holding";

it("lists a sold and re-bought holding's trades and dividends newest first in euros, and its closes from the first trade", async () => {
    const db = await freshDb();
    const rawImportId = await insertRawImport(db);
    const binck = {
        source: "binck",
        broker: "binck",
        rawImportId,
        instrumentId: "bayer",
        currency: "EUR",
    } as const;
    const degiro = { ...binck, source: "degiro", broker: "degiro" } as const;

    await db.insert(transactions).values([
        {
            ...binck,
            externalKey: "1",
            side: "buy",
            tradeDate: "2018-07-04",
            quantity: 50,
            price: 20.3,
        },
        {
            ...binck,
            externalKey: "2",
            side: "sell",
            tradeDate: "2019-04-09",
            quantity: 50,
            price: 26.5,
        },
        {
            ...degiro,
            externalKey: "3",
            side: "buy",
            tradeDate: "2022-07-25",
            quantity: 17,
            price: 51.14,
            feesEur: 2,
        },
        {
            ...degiro,
            externalKey: "4",
            instrumentId: "arcelormittal",
            side: "buy",
            tradeDate: "2022-07-25",
            quantity: 1,
            price: 500,
        },
    ]);
    await db.insert(income).values([
        { ...degiro, externalKey: "a", kind: "dividend", payDate: "2022-08-01", amount: 12, gross: 12 },
        { ...degiro, externalKey: "b", kind: "dividend", payDate: "2022-08-01", amount: -2, gross: 0 },
    ]);
    await db.insert(priceDaily).values([
        { instrumentId: "bayer", date: "2018-07-03", close: 20 },
        { instrumentId: "bayer", date: "2018-07-04", close: 20.5 },
        { instrumentId: "bayer", date: "2022-07-25", close: 51 },
    ]);

    const holding = await loadHolding(db, "bayer");

    expect(holding?.entries).toEqual([
        {
            date: "2022-08-01",
            kind: "dividend",
            broker: "degiro",
            shares: null,
            price: null,
            eur: 12,
        },
        {
            date: "2022-07-25",
            kind: "buy",
            broker: "degiro",
            shares: 17,
            price: 51.14,
            eur: 871.38,
        },
        {
            date: "2019-04-09",
            kind: "sell",
            broker: "binck",
            shares: 50,
            price: 26.5,
            eur: 1325,
        },
        {
            date: "2018-07-04",
            kind: "buy",
            broker: "binck",
            shares: 50,
            price: 20.3,
            eur: 1015,
        },
    ]);
    expect(holding?.closes.map(({ date }) => date)).toEqual(["2018-07-04", "2022-07-25"]);
});
