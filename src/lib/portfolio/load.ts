import { and, asc, gte, inArray, max } from "drizzle-orm";
import type { Db } from "@/db/connect";
import { portfolioDaily, priceDaily, theses } from "@/db/schema";
import { addDays, type Range, rangeStart, ranges } from "@/lib/dates";
import { totalReturnIndex } from "@/lib/engine/benchmark";
import { annualDividend } from "@/lib/engine/dividends";
import { type Book, held, replay } from "@/lib/engine/ledger";
import { fromMicro, toCents, toMicro } from "@/lib/engine/money";
import { putPositions, SHARES_PER_CONTRACT } from "@/lib/engine/options";
import type { Point } from "@/lib/engine/series";
import { simulate } from "@/lib/engine/simulate";
import { annualised, compounded, xirr } from "@/lib/engine/xirr";
import { append, loadLedger, tradePrices } from "./ledger";

const benchmarkIds = ["ishares-stoxx-600", "ishares-sp500"];

const sumCost = (lots: { cost: number }[]) => lots.reduce((sum, lot) => sum + lot.cost, 0);
const bookCost = (books: Map<string, Book>) =>
    [...books.values()].reduce((total, book) => total + sumCost(book.lots), 0);
const after = (points: Point[], date: string) =>
    points.reduce((total, point) => (point.date > date ? total + point.value : total), 0);

export type Portfolio = Awaited<ReturnType<typeof loadPortfolio>>;

/**
 * recentCloses are the three months before the last close, in the listing's
 * currency.
 */
export async function loadHoldings(
    db: Db,
    { trades, stockDividends, securities, events, toEur, eurTrades, eurPuts }: Awaited<ReturnType<typeof loadLedger>>,
    lastDay: string | undefined,
) {
    const puts = putPositions(eurPuts);
    const eur = replay(eurTrades, stockDividends);
    const local = replay(
        trades.map((trade) => ({
            id: trade.id,
            instrumentId: trade.instrumentId,
            side: trade.side,
            date: trade.tradeDate,
            micro: toMicro(trade.quantity),
            cents: toCents(trade.quantity * trade.price),
        })),
        stockDividends,
    );
    const open = [...eur.books].filter(([, book]) => book.lots.length);

    const closes = new Map<string, { date: string; close: number }[]>();
    const priced = [...open.map(([id]) => id), ...puts.filter((put) => put.open).map((put) => put.instrumentId)];
    const [recent, latest, written] = await Promise.all([
        db
            .select({
                instrumentId: priceDaily.instrumentId,
                date: priceDaily.date,
                close: priceDaily.close,
            })
            .from(priceDaily)
            .where(
                and(
                    inArray(priceDaily.instrumentId, priced),
                    lastDay ? gte(priceDaily.date, addDays(lastDay, -100)) : undefined,
                ),
            )
            .orderBy(asc(priceDaily.instrumentId), asc(priceDaily.date)),
        db
            .select({ instrumentId: priceDaily.instrumentId, date: max(priceDaily.date) })
            .from(priceDaily)
            .where(inArray(priceDaily.instrumentId, priced))
            .groupBy(priceDaily.instrumentId),
        db
            .select({
                instrumentId: theses.instrumentId,
                date: theses.date,
                type: theses.type,
                pillars: theses.pillars,
                reason: theses.reason,
            })
            .from(theses)
            .orderBy(asc(theses.id)),
    ]);
    const current = new Map(written.map(({ instrumentId, ...thesis }) => [instrumentId, thesis]));

    const security = new Map(securities.map((row) => [row.id, row]));
    const securityOf = (instrumentId: string) => {
        const row = security.get(instrumentId);

        if (!row) throw new Error(`No instrument ${instrumentId}`);

        return row;
    };

    for (const { instrumentId, date, close } of recent) {
        append(closes, instrumentId, { date, close });
    }

    const pricedIds = new Set(priced);
    const lastClose = new Map(latest.map(({ instrumentId, date }) => [instrumentId, date ?? ""]));

    for (const trade of tradePrices(
        trades.filter(({ instrumentId }) => pricedIds.has(instrumentId)),
        lastClose,
    )) {
        const { currency } = securityOf(trade.instrumentId);

        append(closes, trade.instrumentId, {
            date: trade.tradeDate,
            close: toEur(trade.price, trade.currency, trade.tradeDate) / toEur(1, currency, trade.tradeDate),
        });
    }

    const rows = open.map(([instrumentId, book]) => {
        const { name, currency, yahooSymbol } = securityOf(instrumentId);
        const shares = fromMicro(held(book));
        const series = closes.get(instrumentId) ?? [];
        const last = series.at(-1);
        const previous = series.at(-2);

        return {
            instrumentId,
            name,
            symbol: yahooSymbol,
            currency,
            shares,
            avgPrice: sumCost(local.books.get(instrumentId)?.lots ?? []) / 100 / shares,
            costEur: sumCost(book.lots) / 100,
            heldSince: book.heldSince,
            price: last?.close ?? null,
            priceDate: last?.date ?? null,
            dayChange: last && previous ? last.close / previous.close - 1 : null,
            valueEur: last ? toEur(shares * last.close, currency, last.date) : null,
            estimatedDividendEur: lastDay
                ? toEur(annualDividend(events.get(instrumentId) ?? [], lastDay) * shares, currency, lastDay)
                : 0,
            recentCloses: last
                ? series.filter(({ date }) => date >= addDays(last.date, -91)).map(({ close }) => close)
                : [],
            thesis: current.get(instrumentId) ?? null,
        };
    });
    const totalEur = rows.reduce((sum, row) => sum + (row.valueEur ?? 0), 0);
    const holdings = rows
        .map((row) => {
            const unrealisedEur = row.valueEur === null ? null : row.valueEur - row.costEur;

            return {
                ...row,
                weight: row.valueEur === null ? null : row.valueEur / totalEur,
                unrealisedEur,
                unrealisedPct: unrealisedEur === null ? null : unrealisedEur / row.costEur,
            };
        })
        .sort((a, b) => (b.valueEur ?? 0) - (a.valueEur ?? 0));

    return {
        openCost: bookCost(eur.books),
        asOf: holdings.reduce<string | null>(
            (latest, { priceDate }) => (priceDate && (!latest || priceDate > latest) ? priceDate : latest),
            null,
        ),
        holdings,
        closed: eur.closed
            .map(({ instrumentId, from, to, bought, sold }) => ({
                instrumentId,
                name: securityOf(instrumentId).name,
                from,
                to,
                realisedEur: (sold - bought) / 100,
                realisedPct: bought ? (sold - bought) / bought : null,
            }))
            .sort((a, b) => b.to.localeCompare(a.to)),
        puts: puts
            .map((put) => {
                const last = closes.get(put.instrumentId)?.at(-1);

                return {
                    ...put,
                    name: securityOf(put.instrumentId).name,
                    premiumEur: put.premium / 100,
                    atRiskEur: put.strike * SHARES_PER_CONTRACT * put.open,
                    underlyingPrice: put.open && last ? last.close : null,
                };
            })
            .sort((a, b) => b.opened.localeCompare(a.opened)),
    };
}

export async function loadPortfolio(db: Db) {
    const [ledger, daily, benchmarkRows] = await Promise.all([
        loadLedger(db),
        db.select().from(portfolioDaily).orderBy(asc(portfolioDaily.date)),
        db
            .select({
                instrumentId: priceDaily.instrumentId,
                date: priceDaily.date,
                value: priceDaily.close,
            })
            .from(priceDaily)
            .where(inArray(priceDaily.instrumentId, benchmarkIds))
            .orderBy(asc(priceDaily.instrumentId), asc(priceDaily.date)),
    ]);
    const { trades, stockDividends, events, eurTrades, eurPuts, incomeFlows, feeFlows } = ledger;
    const { openCost, asOf, holdings, closed, puts } = await loadHoldings(db, ledger, daily.at(-1)?.date);
    const last = daily.at(-1);
    const previous = daily.at(-2);
    const dates = daily.map(({ date }) => date);
    const benchmarkCloses = new Map<string, Point[]>();

    for (const { instrumentId, ...close } of benchmarkRows) {
        append(benchmarkCloses, instrumentId, close);
    }

    const [stoxx600, sp500] = benchmarkIds.map((id) =>
        totalReturnIndex(benchmarkCloses.get(id) ?? [], events.get(id) ?? [], dates),
    );
    const tradeFlows = eurTrades.flatMap(({ side, date, cents }) =>
        side === "buy" ? [{ date, value: -cents }] : side === "sell" ? [{ date, value: cents }] : [],
    );
    const putFlows = eurPuts.flatMap(({ side, date, cents }) =>
        side === "sell" ? [{ date, value: cents }] : side === "buy" ? [{ date, value: -cents }] : [],
    );
    const overview = (() => {
        if (!last || !previous) return null;

        const estimated = holdings.reduce((total, { estimatedDividendEur }) => total + estimatedDividendEur, 0);
        const returnsOver = (range: Range) => {
            const start = rangeStart(range, last.date);
            const from = daily.findIndex(({ date }) => date >= start);
            const base = daily[from];
            const baseCost = bookCost(
                replay(
                    eurTrades.filter(({ date }) => date <= base.date),
                    stockDividends.filter(({ date }) => date <= base.date),
                ).books,
            );
            const unrealised = last.valueCents - openCost - (base.valueCents - baseCost);
            const realised = after(tradeFlows, base.date) + openCost - baseCost;
            const dividends = after(incomeFlows, base.date);
            const premiums = after(putFlows, base.date);
            const costs = -after(feeFlows, base.date);
            const irr = xirr([
                { date: base.date, value: -base.valueCents },
                ...daily.slice(from + 1).map(({ date, inflowCents, outflowCents }) => ({
                    date,
                    value: outflowCents - inflowCents,
                })),
                { date: last.date, value: last.valueCents },
            ]);
            const stoxx600Days = daily.slice(from).flatMap(({ date, inflowCents, outflowCents }, i) => {
                const index = stoxx600[from + i];

                return index === null ? [] : [{ date, cents: i ? inflowCents - outflowCents : base.valueCents, index }];
            });
            const stoxx600Irr = stoxx600Days.length === daily.length - from ? simulate(stoxx600Days) : null;
            const [startIndex, endIndex] = [stoxx600[from], stoxx600.at(-1)];
            const yearly = range === "1Y" || range === "5Y" || range === "All";
            const growthRate = (growth: number) => (yearly ? annualised(growth, base.date, last.date) : growth - 1);
            const yearlyRate = (rate: number | null) =>
                rate === null || yearly ? rate : compounded(rate, base.date, last.date);

            return {
                from: base.date,
                annualised: yearly,
                totalEur: (unrealised + realised + dividends + premiums - costs) / 100,
                unrealisedEur: unrealised / 100,
                realisedEur: realised / 100,
                dividendsEur: dividends / 100,
                premiumsEur: premiums / 100,
                feesEur: costs / 100,
                irr: yearlyRate(irr),
                twr: growthRate(last.twrIndex / base.twrIndex),
                stoxx600Twr: startIndex && endIndex ? growthRate(endIndex / startIndex) : null,
                stoxx600Irr: yearlyRate(stoxx600Irr),
            };
        };

        return {
            asOf: last.date,
            since: trades[0].tradeDate,
            valueEur: last.valueCents / 100,
            dayEur: (last.valueCents + last.outflowCents - previous.valueCents - last.inflowCents) / 100,
            dayPct: last.twrIndex / previous.twrIndex - 1,
            returns: Object.fromEntries(ranges.map((range) => [range, returnsOver(range)])) as Record<
                Range,
                ReturnType<typeof returnsOver>
            >,
            estimatedDividendsEur: estimated,
            estimatedYield: estimated / (last.valueCents / 100),
        };
    })();

    const received = new Map<string, number>();

    for (const { date, value } of incomeFlows) {
        const year = date.slice(0, 4);

        received.set(year, (received.get(year) ?? 0) + value);
    }

    let investedCents = 0;
    const series = daily.map(({ date, valueCents, inflowCents, outflowCents, twrIndex }, i) => {
        investedCents += inflowCents - outflowCents;

        return {
            date,
            valueEur: valueCents / 100,
            investedEur: investedCents / 100,
            twrIndex,
            stoxx600: stoxx600[i],
            sp500: sp500[i],
        };
    });

    return {
        overview,
        series,
        asOf,
        holdings,
        dividends: [...received]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([year, cents]) => ({ year, receivedEur: cents / 100 })),
        closed,
        puts,
    };
}
