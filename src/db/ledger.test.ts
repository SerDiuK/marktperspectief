import { expect, it } from "vitest";
import { getEffectiveTrades } from "./ledger";
import { transactions } from "./schema";
import { freshDb, insertRawImport } from "./test-db";

it("leaves out superseded trades, oldest first", async () => {
    const db = await freshDb();
    const rawImportId = await insertRawImport(db);

    const row = (externalKey: string, tradeDate: string) => ({
        source: "binck" as const,
        broker: "binck" as const,
        externalKey,
        rawImportId,
        instrumentId: "lvmh",
        side: "buy" as const,
        tradeDate,
        quantity: 1,
        price: 50,
        currency: "EUR" as const,
    });

    await db
        .insert(transactions)
        .values([
            row("later", "2020-02-03"),
            row("earlier", "2020-01-02"),
            { ...row("superseded", "2020-01-04"), supersededBy: "degiro:1" },
        ]);

    const trades = await getEffectiveTrades(db);

    expect(trades.map((trade) => trade.externalKey)).toEqual(["earlier", "later"]);
});
