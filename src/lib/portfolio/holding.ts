import { asc, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/connect";
import { income, portfolioDaily, priceDaily } from "@/db/schema";
import { fromMicro } from "@/lib/engine/money";
import { euroIncome, euroTrades, loadLedger } from "./ledger";
import { loadHoldings } from "./load";

export type Holding = NonNullable<Awaited<ReturnType<typeof loadHolding>>>;

/** Closes are in the listing's currency, and entries come newest first. */
export async function loadHolding(db: Db, instrumentId: string) {
    const [ledger, [latest], payouts, closes] = await Promise.all([
        loadLedger(db),
        db.select({ date: portfolioDaily.date }).from(portfolioDaily).orderBy(desc(portfolioDaily.date)).limit(1),
        db.select().from(income).where(eq(income.instrumentId, instrumentId)),
        db
            .select({ date: priceDaily.date, close: priceDaily.close })
            .from(priceDaily)
            .where(eq(priceDaily.instrumentId, instrumentId))
            .orderBy(asc(priceDaily.date)),
    ]);
    const { trades, stockDividends, securities, events, toEur } = ledger;
    const security = securities.find(({ id }) => id === instrumentId);
    const own = trades.filter((trade) => trade.instrumentId === instrumentId);

    if (!security || !own.length) return null;

    const { holdings, closed } = await loadHoldings(db, ledger, latest?.date);
    const ownStockDividends = stockDividends.filter((dividend) => dividend.instrumentId === instrumentId);
    const euros = euroTrades(own, toEur);
    const dividends = euroIncome(payouts, {
        trades: own,
        stockDividends: ownStockDividends,
        events,
        currencies: new Map([[instrumentId, security.currency]]),
        toEur,
    });
    const entries = [
        ...own.map(({ tradeDate, side, broker, quantity, price }, i) => {
            const priced = side === "buy" || side === "sell";

            return {
                date: tradeDate,
                kind: side,
                broker,
                shares: quantity,
                price: priced ? price : null,
                eur: priced ? euros[i].cents / 100 : null,
            };
        }),
        ...ownStockDividends.map(({ date, broker, micro }) => ({
            date,
            kind: "stock_dividend" as const,
            broker,
            shares: fromMicro(micro),
            price: null,
            eur: null,
        })),
        ...payouts.map(({ payDate, broker }, i) => ({
            date: payDate,
            kind: "dividend" as const,
            broker,
            shares: null,
            price: null,
            eur: dividends[i].value / 100,
        })),
    ]
        .sort((a, b) => a.date.localeCompare(b.date))
        .reverse();

    return {
        instrumentId,
        name: security.name,
        symbol: security.yahooSymbol,
        currency: security.currency,
        closes: security.yahooSymbol ? closes.filter(({ date }) => date >= own[0].tradeDate) : [],
        entries,
        position: holdings.find((holding) => holding.instrumentId === instrumentId),
        periods: closed.filter((period) => period.instrumentId === instrumentId),
    };
}
