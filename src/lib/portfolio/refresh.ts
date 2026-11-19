import { asc, eq, isNotNull } from "drizzle-orm";
import { chunks, type Db } from "@/db/connect";
import { instruments, portfolioDaily, priceDaily } from "@/db/schema";
import { dailySeries } from "@/lib/engine/daily";
import type { Point } from "@/lib/engine/series";
import { append, loadLedger, tradePrices } from "./ledger";

export async function refreshDerived(db: Db, today: string) {
    const [ledger, closes] = await Promise.all([
        loadLedger(db),
        db
            .select({
                instrumentId: priceDaily.instrumentId,
                date: priceDaily.date,
                close: priceDaily.close,
                currency: instruments.currency,
            })
            .from(priceDaily)
            .innerJoin(instruments, eq(priceDaily.instrumentId, instruments.id))
            .where(isNotNull(instruments.yahooSymbol))
            .orderBy(asc(priceDaily.instrumentId), asc(priceDaily.date)),
    ]);
    const { trades, toEur } = ledger;

    const prices = new Map<string, Point[]>();

    for (const { instrumentId, date, close, currency } of closes) {
        append(prices, instrumentId, {
            date,
            value: toEur(close, currency, date),
        });
    }

    const lastClose = new Map(closes.map(({ instrumentId, date }) => [instrumentId, date]));

    for (const trade of tradePrices(trades, lastClose)) {
        append(prices, trade.instrumentId, {
            date: trade.tradeDate,
            value: toEur(trade.price, trade.currency, trade.tradeDate),
        });
    }

    const cashFlows = [...ledger.incomeFlows, ...ledger.feeFlows];
    const latestClose = closes.reduce((latest, { date }) => (date > latest ? date : latest), "");
    const lastDay = [...ledger.eurTrades, ...ledger.stockDividends, ...ledger.eurPuts, ...cashFlows].reduce(
        (latest, { date }) => (date > latest ? date : latest),
        latestClose,
    );
    const rows = dailySeries({
        trades: ledger.eurTrades,
        stockDividends: ledger.stockDividends,
        puts: ledger.eurPuts,
        cashFlows,
        closes: prices,
        until: latestClose && lastDay < today ? lastDay : today,
    });

    await db.batch([
        db.delete(portfolioDaily),
        ...chunks(rows).map((chunk) => db.insert(portfolioDaily).values(chunk)),
    ]);

    return { days: rows.length, asOf: rows.at(-1)?.date ?? null };
}
