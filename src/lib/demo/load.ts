import { asc } from "drizzle-orm";
import type { Db } from "@/db/connect";
import { dividendEvents, fxDaily, priceDaily } from "@/db/schema";
import { clearLedger, ingestRaw } from "@/lib/import/ingest";
import { syncMarketData } from "@/lib/market/sync";
import { refreshDerived } from "@/lib/portfolio/refresh";
import { type DemoMarket, demoExports } from "./exports";
import { draftId, instrumentsFile, json } from "./marker";
import { demoInstruments, demoTheses } from "./plan";

async function loadMarket(db: Db): Promise<DemoMarket> {
    const [closes, dividends, rates] = await Promise.all([
        db.select().from(priceDaily).orderBy(asc(priceDaily.date)),
        db.select().from(dividendEvents).orderBy(asc(dividendEvents.exDate)),
        db.select().from(fxDaily).orderBy(asc(fxDaily.date)),
    ]);

    return {
        closes: Map.groupBy(closes, ({ instrumentId }) => instrumentId),
        dividends: Map.groupBy(dividends, ({ instrumentId }) => instrumentId),
        usdPerEur: rates.flatMap(({ currency, date, perEur }) => (currency === "USD" ? [{ date, close: perEur }] : [])),
    };
}

export async function loadDemo(db: Db, today: string) {
    await clearLedger(db);

    const results = [await ingestRaw(db, instrumentsFile)];
    const sync = await syncMarketData(db);
    const exports = demoExports(await loadMarket(db), today);
    const encode = (text: string) => new TextEncoder().encode(`${text}\n`);
    const files = [
        instrumentsFile,
        { name: "Transactions.csv", bytes: encode(exports.transactions) },
        { name: "Account.csv", bytes: encode(exports.account) },
        ...demoTheses.map(({ id, ...thesis }, index) => ({
            name: `thesis-${id}.json`,
            bytes: json({
                chat: "thesis",
                draftId: draftId(100 + index),
                thesis: { isin: demoInstruments.find((row) => row.id === id)!.isin, ...thesis },
            }),
        })),
    ];

    for (const file of files.slice(1)) results.push(await ingestRaw(db, file));

    await refreshDerived(db, today);

    return { sync, files, results };
}
