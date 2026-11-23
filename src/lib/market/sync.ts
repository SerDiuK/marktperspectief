import { max, min, sql } from "drizzle-orm";
import { chunks, type Db } from "@/db/connect";
import { dividendEvents, fxDaily, instruments, priceDaily, transactions } from "@/db/schema";
import { addDays } from "@/lib/dates";
import { fetchEcbRates } from "./ecb";
import { fetchChart } from "./yahoo";

// Re-fetching the last days picks up late corrections. With nothing stored,
// a fetch starts before the first trade, or, before there is one, at a date
// early enough for the demo's plan.
const OVERLAP_DAYS = 10;
const NO_TRADES_START = "2017-12-15";

export async function syncMarketData(db: Db) {
    const [securities, [firstTrade], lastCloses, lastRates, storedDividends] = await Promise.all([
        db.select().from(instruments),
        db.select({ date: min(transactions.tradeDate) }).from(transactions),
        db
            .select({
                instrumentId: priceDaily.instrumentId,
                date: max(priceDaily.date),
            })
            .from(priceDaily)
            .groupBy(priceDaily.instrumentId),
        db
            .select({ currency: fxDaily.currency, date: max(fxDaily.date) })
            .from(fxDaily)
            .groupBy(fxDaily.currency),
        db.$count(dividendEvents),
    ]);
    const start = firstTrade?.date ? addDays(firstTrade.date, -OVERLAP_DAYS) : NO_TRADES_START;
    const fetchFrom = (lastStored: string | null | undefined) =>
        lastStored ? addDays(lastStored, -OVERLAP_DAYS) : start;
    const lastClose = new Map(storedDividends ? lastCloses.map(({ instrumentId, date }) => [instrumentId, date]) : []);
    const report = {
        closes: 0,
        dividends: 0,
        rates: 0,
        failures: [] as string[],
        withoutSymbol: [] as string[],
    };

    for (const { id, yahooSymbol, currency } of securities) {
        if (!yahooSymbol) {
            report.withoutSymbol.push(id);
            continue;
        }

        try {
            const listing = await fetchChart(yahooSymbol, fetchFrom(lastClose.get(id)));

            if (listing.currency !== currency) {
                throw new Error(`priced in ${listing.currency}, not ${currency}`);
            }

            const rows = listing.closes.map((close) => ({
                instrumentId: id,
                ...close,
            }));
            const dividends = listing.dividends.map((dividend) => ({
                instrumentId: id,
                ...dividend,
            }));
            const [first, ...rest] = [
                ...chunks(rows).map((chunk) =>
                    db
                        .insert(priceDaily)
                        .values(chunk)
                        .onConflictDoUpdate({
                            target: [priceDaily.instrumentId, priceDaily.date],
                            set: { close: sql`excluded.close` },
                        }),
                ),
                ...chunks(dividends).map((chunk) =>
                    db
                        .insert(dividendEvents)
                        .values(chunk)
                        .onConflictDoUpdate({
                            target: [dividendEvents.instrumentId, dividendEvents.exDate],
                            set: { amount: sql`excluded.amount` },
                        }),
                ),
            ];

            if (first) await db.batch([first, ...rest]);
            report.closes += rows.length;
            report.dividends += dividends.length;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            report.failures.push(`${yahooSymbol}: ${message}`);
        }
    }

    const foreign = [...new Set(securities.map(({ currency }) => currency))].filter((currency) => currency !== "EUR");
    const lastRate = new Map(lastRates.map(({ currency, date }) => [currency, date]));
    const from = foreign.map((currency) => fetchFrom(lastRate.get(currency))).sort()[0];

    if (!from) return report;

    try {
        const rates = await fetchEcbRates(foreign, from);
        const [first, ...rest] = chunks(rates).map((chunk) =>
            db
                .insert(fxDaily)
                .values(chunk)
                .onConflictDoUpdate({
                    target: [fxDaily.currency, fxDaily.date],
                    set: { perEur: sql`excluded.per_eur` },
                }),
        );

        if (first) await db.batch([first, ...rest]);
        report.rates = rates.length;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        report.failures.push(`ECB: ${message}`);
    }

    return report;
}
