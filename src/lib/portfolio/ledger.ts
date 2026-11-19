import { asc } from "drizzle-orm";
import type { Db } from "@/db/connect";
import { getEffectiveTrades, getOptionTrades } from "@/db/ledger";
import { corporateActions, dividendEvents, fees, fxDaily, income, instruments } from "@/db/schema";
import { addDays } from "@/lib/dates";
import { type DividendEvent, dividendPaid } from "@/lib/engine/dividends";
import type { LedgerTrade } from "@/lib/engine/ledger";
import { fromMicro, toCents, toMicro } from "@/lib/engine/money";
import { type PutTrade, SHARES_PER_CONTRACT } from "@/lib/engine/options";
import { asOf, type Point } from "@/lib/engine/series";

type Trade = Awaited<ReturnType<typeof getEffectiveTrades>>[number];
type OptionTrade = Awaited<ReturnType<typeof getOptionTrades>>[number];
type StockDividends = Awaited<ReturnType<typeof loadStockDividends>>;
type ToEur = (amount: number, currency: string, date: string) => number;

export function append<T>(series: Map<string, T[]>, key: string, item: T) {
    const items = series.get(key);

    if (items) items.push(item);
    else series.set(key, [item]);
}

export function tradePrices(trades: Trade[], lastClose: Map<string, string>) {
    return trades.filter(
        ({ instrumentId, side, tradeDate }) =>
            (side === "buy" || side === "sell") && tradeDate > (lastClose.get(instrumentId) ?? ""),
    );
}

export function toStockDividends(rows: (typeof corporateActions.$inferInsert)[]) {
    return rows.map(({ date, instrumentId, broker, shares }) => ({
        date,
        instrumentId,
        broker,
        micro: toMicro(shares),
    }));
}

export async function loadStockDividends(db: Db) {
    return toStockDividends(await db.select().from(corporateActions));
}

async function loadDividendEvents(db: Db) {
    const rows = await db
        .select()
        .from(dividendEvents)
        .orderBy(asc(dividendEvents.instrumentId), asc(dividendEvents.exDate));
    const events = new Map<string, DividendEvent[]>();

    for (const { instrumentId, exDate, amount } of rows) {
        append(events, instrumentId, { exDate, amount });
    }

    return events;
}

export async function loadToEur(db: Db): Promise<ToEur> {
    const rates = await db.select().from(fxDaily).orderBy(asc(fxDaily.currency), asc(fxDaily.date));
    const perEur = new Map<string, Point[]>();

    for (const { currency, date, perEur: value } of rates) {
        append(perEur, currency, { date, value });
    }

    return (amount, currency, date) => {
        if (currency === "EUR") return amount;

        const rate = asOf(perEur.get(currency) ?? [], date);

        if (rate === undefined) {
            throw new Error(`No ${currency} rate on or before ${date}`);
        }

        return amount / rate;
    };
}

export function euroTrades(trades: Trade[], toEur: ToEur): LedgerTrade[] {
    return trades.map((trade) => {
        const fee = trade.side === "buy" ? trade.feesEur : -trade.feesEur;
        const amount = trade.quantity * trade.price;

        return {
            id: trade.id,
            instrumentId: trade.instrumentId,
            side: trade.side,
            date: trade.tradeDate,
            micro: toMicro(trade.quantity),
            cents: toCents(toEur(amount, trade.currency, trade.tradeDate) + fee),
        };
    });
}

function brokerShares(trades: Trade[], stockDividends: StockDividends) {
    const moves = [
        ...trades.map(({ broker, instrumentId, tradeDate, side, quantity }) => ({
            key: `${broker}|${instrumentId}`,
            date: tradeDate,
            micro: side === "buy" || side === "transfer_in" ? toMicro(quantity) : -toMicro(quantity),
        })),
        ...stockDividends.map(({ broker, instrumentId, date, micro }) => ({
            key: `${broker}|${instrumentId}`,
            date,
            micro,
        })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    const shares = new Map<string, Point[]>();

    for (const { key, date, micro } of moves) {
        const before = shares.get(key)?.at(-1)?.value ?? 0;

        append(shares, key, { date, value: before + micro });
    }

    return shares;
}

export function euroIncome(
    rows: (typeof income.$inferSelect)[],
    {
        trades,
        stockDividends,
        events,
        currencies,
        toEur,
    }: {
        trades: Trade[];
        stockDividends: StockDividends;
        events: Map<string, DividendEvent[]>;
        currencies: Map<string, string>;
        toEur: ToEur;
    },
): Point[] {
    const shares = brokerShares(trades, stockDividends);
    const grossedUp = (row: (typeof rows)[number]) => {
        if (row.kind !== "dividend" || !row.instrumentId || row.amount <= 0) return;

        const event = dividendPaid(events.get(row.instrumentId) ?? [], row.payDate);

        if (!event) return;

        const micro = asOf(shares.get(`${row.broker}|${row.instrumentId}`) ?? [], addDays(event.exDate, -1));

        if (!micro) return;

        const currency = currencies.get(row.instrumentId) ?? row.currency;

        return toEur(fromMicro(micro) * event.amount, currency, row.payDate);
    };

    return rows.map((row) => ({
        date: row.payDate,
        value: toCents(
            row.gross === null
                ? (grossedUp(row) ?? toEur(row.amount, row.currency, row.payDate))
                : toEur(row.gross, row.currency, row.payDate),
        ),
    }));
}

function euroPuts(rows: OptionTrade[]): PutTrade[] {
    return rows.map((row) => {
        const premium = row.premium * SHARES_PER_CONTRACT * row.contracts;

        return {
            instrumentId: row.instrumentId,
            strike: row.strike,
            expiry: row.expiry,
            side: row.side,
            date: row.tradeDate,
            contracts: row.contracts,
            cents:
                row.side === "sell"
                    ? toCents(premium - row.feesEur)
                    : row.side === "buy"
                      ? toCents(premium + row.feesEur)
                      : 0,
        };
    });
}

// Flows are paid to the owner, so fees are negative.
export async function loadLedger(db: Db) {
    const [trades, putTrades, stockDividends, securities, payouts, charges, events, toEur] = await Promise.all([
        getEffectiveTrades(db),
        getOptionTrades(db),
        loadStockDividends(db),
        db.select().from(instruments),
        db.select().from(income),
        db.select().from(fees),
        loadDividendEvents(db),
        loadToEur(db),
    ]);

    return {
        trades,
        stockDividends,
        securities,
        events,
        toEur,
        eurTrades: euroTrades(trades, toEur),
        eurPuts: euroPuts(putTrades),
        incomeFlows: euroIncome(payouts, {
            trades,
            stockDividends,
            events,
            currencies: new Map(securities.map(({ id, currency }) => [id, currency])),
            toEur,
        }),
        feeFlows: charges.map(({ date, amount, currency }) => ({
            date,
            value: -toCents(toEur(amount, currency, date)),
        })),
    };
}
