import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import {
    dividendEvents,
    fees,
    fxDaily,
    income,
    optionTrades,
    portfolioDaily,
    priceDaily,
    transactions,
} from "@/db/schema";
import { freshDb, insertRawImport } from "@/db/test-db";
import { loadLedger } from "./ledger";
import { loadPortfolio } from "./load";
import { refreshDerived } from "./refresh";

const trade = {
    source: "saxo",
    broker: "saxo",
    instrumentId: "kbc",
    currency: "EUR",
} as const;

it("prices a holding at its last close and that day's rate, averages it before fees, and nets a put's fees from its premium", async () => {
    const db = await freshDb();

    const rawImportId = await insertRawImport(db);

    await db.insert(transactions).values({
        source: "degiro",
        broker: "degiro",
        externalKey: "msft",
        rawImportId,
        instrumentId: "microsoft",
        side: "buy",
        tradeDate: "2025-04-17",
        quantity: 10,
        price: 150,
        currency: "USD",
        feesEur: 2,
    });
    await db.insert(optionTrades).values({
        broker: "degiro",
        externalKey: "heineken-put",
        rawImportId,
        instrumentId: "heineken",
        strike: 22,
        expiry: "2025-06-20",
        side: "sell",
        tradeDate: "2025-04-17",
        contracts: 1,
        premium: 2.55,
        feesEur: 0.75,
    });
    await db.insert(fxDaily).values([
        { currency: "USD", date: "2025-04-16", perEur: 1.25 },
        { currency: "USD", date: "2025-04-18", perEur: 1.28 },
    ]);
    await db.insert(priceDaily).values([
        { instrumentId: "microsoft", date: "2025-04-17", close: 150 },
        { instrumentId: "microsoft", date: "2025-04-18", close: 160 },
    ]);

    const { holdings, puts } = await loadPortfolio(db);

    expect(holdings).toMatchObject([{ instrumentId: "microsoft", avgPrice: 150, valueEur: 1250 }]);
    expect(puts).toMatchObject([{ premiumEur: 254.25 }]);
});

it("grosses up a net dividend from Yahoo's dividend and the shares held at that broker before the ex-date, and keeps it as booked without a match or when negative", async () => {
    const db = await freshDb();

    const rawImportId = await insertRawImport(db);

    await db.insert(transactions).values([
        {
            ...trade,
            externalKey: "1",
            rawImportId,
            side: "buy",
            tradeDate: "2023-01-10",
            quantity: 130,
            price: 90,
        },
        {
            ...trade,
            externalKey: "2",
            rawImportId,
            side: "buy",
            tradeDate: "2025-05-09",
            quantity: 10,
            price: 75,
        },
        {
            ...trade,
            source: "degiro",
            broker: "degiro",
            externalKey: "3",
            rawImportId,
            side: "buy",
            tradeDate: "2023-01-10",
            quantity: 40,
            price: 90,
        },
    ]);
    await db.insert(dividendEvents).values({ instrumentId: "kbc", exDate: "2025-05-09", amount: 5 });

    const payout = { ...trade, rawImportId, kind: "dividend" } as const;

    await db.insert(income).values([
        { ...payout, externalKey: "a", payDate: "2025-05-13", amount: 455 },
        { ...payout, externalKey: "b", payDate: "2025-08-01", amount: 10 },
        { ...payout, externalKey: "c", payDate: "2025-05-20", amount: -2 },
    ]);

    const { incomeFlows } = await loadLedger(db);

    expect(incomeFlows.map(({ value }) => value)).toEqual([65000, 1000, -200]);
});

it("sums a payment's lines before grossing it up: a correction joins its net dividend, a full reversal leaves nothing, a fully withheld one keeps its gross, and a payout with its gross stays apart", async () => {
    const db = await freshDb();
    const rawImportId = await insertRawImport(db);

    await db.insert(transactions).values({
        ...trade,
        externalKey: "1",
        rawImportId,
        side: "buy",
        tradeDate: "2023-01-10",
        quantity: 100,
        price: 90,
    });
    await db.insert(dividendEvents).values([
        { instrumentId: "kbc", exDate: "2025-05-09", amount: 5 },
        { instrumentId: "kbc", exDate: "2025-11-07", amount: 0.6 },
    ]);

    const line = { ...trade, rawImportId, kind: "dividend" } as const;

    await db.insert(income).values([
        { ...line, externalKey: "a", payDate: "2025-05-13", amount: 350 },
        { ...line, externalKey: "b", payDate: "2025-05-13", amount: 0.05 },
        { ...line, externalKey: "c", payDate: "2025-05-13", amount: 12, gross: 12 },
        { ...line, externalKey: "d", payDate: "2025-11-12", amount: 45.1 },
        { ...line, externalKey: "e", payDate: "2025-11-12", amount: 0.2 },
        { ...line, externalKey: "f", payDate: "2025-11-12", amount: -45.3 },
        { ...line, externalKey: "g", payDate: "2025-12-01", amount: 8, gross: 8 },
        { ...line, externalKey: "h", payDate: "2025-12-01", amount: -8, gross: 0 },
    ]);

    expect((await loadLedger(db)).incomeFlows).toEqual([
        { date: "2025-05-13", value: 50000 },
        { date: "2025-05-13", value: 1200 },
        { date: "2025-12-01", value: 800 },
    ]);
});

it("sums the overview: realised after a part sale, a day's change without that day's buy, total return and a year of dividends", async () => {
    const db = await freshDb();

    const rawImportId = await insertRawImport(db);

    await db.insert(transactions).values([
        {
            ...trade,
            externalKey: "1",
            rawImportId,
            side: "buy",
            tradeDate: "2025-01-02",
            quantity: 10,
            price: 100,
        },
        {
            ...trade,
            externalKey: "2",
            rawImportId,
            side: "sell",
            tradeDate: "2025-07-01",
            quantity: 4,
            price: 150,
        },
    ]);
    await db.insert(income).values({
        ...trade,
        rawImportId,
        externalKey: "a",
        kind: "dividend",
        payDate: "2025-05-13",
        amount: 7,
        gross: 10,
    });
    await db.insert(fees).values({
        broker: "saxo",
        rawImportId,
        externalKey: "b",
        date: "2025-06-02",
        amount: 2,
        currency: "EUR",
    });
    await db.insert(dividendEvents).values({ instrumentId: "kbc", exDate: "2025-05-09", amount: 5 });

    const day = { outflowCents: 0, twrIndex: 1 };

    await db.insert(portfolioDaily).values([
        { ...day, date: "2024-12-31", valueCents: 0, inflowCents: 0 },
        { ...day, date: "2025-10-02", valueCents: 90000, inflowCents: 0 },
        { ...day, date: "2025-10-03", valueCents: 96000, inflowCents: 5000 },
    ]);

    const { overview } = await loadPortfolio(db);

    expect(overview).toMatchObject({
        dayEur: 10,
        returns: { All: { realisedEur: 200, totalEur: 568 } },
        estimatedDividendsEur: 30,
    });
});

it("nets every kind of flow into the invested line, so its gap to the value grows by a range's total return, and realises a sale in the range against its cost", async () => {
    const db = await freshDb();

    const rawImportId = await insertRawImport(db);

    await db.insert(transactions).values([
        {
            ...trade,
            externalKey: "1",
            rawImportId,
            side: "buy",
            tradeDate: "2025-01-02",
            quantity: 10,
            price: 100,
            feesEur: 3,
        },
        {
            ...trade,
            externalKey: "2",
            rawImportId,
            side: "sell",
            tradeDate: "2025-07-01",
            quantity: 4,
            price: 150,
            feesEur: 3,
        },
    ]);

    const put = {
        broker: "degiro",
        rawImportId,
        instrumentId: "heineken",
        strike: 22,
        expiry: "2025-06-20",
        contracts: 1,
    } as const;

    await db.insert(optionTrades).values([
        {
            ...put,
            externalKey: "sold",
            side: "sell",
            tradeDate: "2025-04-17",
            premium: 2.55,
            feesEur: 0.75,
        },
        {
            ...put,
            externalKey: "expired",
            side: "expired",
            tradeDate: "2025-06-20",
            premium: 0,
        },
    ]);
    await db.insert(income).values({
        ...trade,
        rawImportId,
        externalKey: "a",
        kind: "dividend",
        payDate: "2025-05-13",
        amount: 7,
        gross: 10,
    });
    await db.insert(fees).values({
        broker: "saxo",
        rawImportId,
        externalKey: "b",
        date: "2025-06-02",
        amount: 2,
        currency: "EUR",
    });
    await db.insert(priceDaily).values([
        { instrumentId: "kbc", date: "2025-01-02", close: 100 },
        { instrumentId: "kbc", date: "2025-10-03", close: 160 },
        { instrumentId: "heineken", date: "2025-04-17", close: 25 },
    ]);
    await refreshDerived(db, "2025-10-03");

    const { overview, series } = await loadPortfolio(db);
    const last = series.at(-1)!;
    const base = series.find(({ date }) => date === overview!.returns["6M"].from)!;

    expect(last.valueEur - last.investedEur).toBeCloseTo(overview!.returns.All.totalEur);
    expect(overview!.returns["6M"]).toMatchObject({
        totalEur: expect.closeTo(last.valueEur - last.investedEur - (base.valueEur - base.investedEur)),
        realisedEur: expect.closeTo(4 * 150 - 3 - 4 * 100.3),
    });
});

it("gives a portfolio that only holds the Stoxx 600 ETF and takes its dividend out the index's return, day by day and money-weighted, over every range", async () => {
    const db = await freshDb();

    const rawImportId = await insertRawImport(db);
    const etf = { ...trade, rawImportId, instrumentId: "ishares-stoxx-600" };

    await db.insert(transactions).values({
        ...etf,
        externalKey: "1",
        side: "buy",
        tradeDate: "2025-01-02",
        quantity: 10,
        price: 500,
    });
    await db.insert(dividendEvents).values({
        instrumentId: "ishares-stoxx-600",
        exDate: "2025-06-02",
        amount: 5,
    });
    await db.insert(income).values({
        ...etf,
        externalKey: "a",
        kind: "dividend",
        payDate: "2025-06-02",
        amount: 50,
        gross: 50,
    });
    await db.insert(priceDaily).values([
        { instrumentId: "ishares-stoxx-600", date: "2024-12-31", close: 500 },
        { instrumentId: "ishares-stoxx-600", date: "2025-01-02", close: 500 },
        { instrumentId: "ishares-stoxx-600", date: "2025-06-02", close: 550 },
        { instrumentId: "ishares-stoxx-600", date: "2026-01-02", close: 600 },
    ]);
    await refreshDerived(db, "2026-01-02");

    const { overview, series } = await loadPortfolio(db);
    const [first] = series;

    expect(series.map(({ twrIndex }) => twrIndex / first.twrIndex)).toEqual(
        series.map(({ stoxx600 }) => expect.closeTo(stoxx600! / first.stoxx600!, 12)),
    );

    for (const { twr, stoxx600Twr, irr, stoxx600Irr } of Object.values(overview!.returns)) {
        expect(twr).toBeCloseTo(stoxx600Twr!, 12);
        expect(stoxx600Irr).toBeCloseTo(irr!, 9);
    }
});

it("pays a put's buyback in with its fees, and nets it from the premium", async () => {
    const db = await freshDb();
    const put = {
        broker: "degiro",
        rawImportId: await insertRawImport(db),
        instrumentId: "heineken",
        strike: 22,
        expiry: "2025-06-20",
        contracts: 1,
        feesEur: 0.75,
    } as const;

    await db.insert(transactions).values({
        ...trade,
        externalKey: "1",
        rawImportId: put.rawImportId,
        side: "buy",
        tradeDate: "2025-04-17",
        quantity: 1,
        price: 100,
    });
    await db.insert(optionTrades).values([
        { ...put, externalKey: "sold", side: "sell", tradeDate: "2025-04-17", premium: 2.55 },
        { ...put, externalKey: "bought", side: "buy", tradeDate: "2025-05-02", premium: 1 },
    ]);
    await db.insert(priceDaily).values([
        { instrumentId: "heineken", date: "2025-04-17", close: 25 },
        { instrumentId: "kbc", date: "2025-04-17", close: 100 },
    ]);
    await refreshDerived(db, "2025-05-02");

    expect(await db.select().from(portfolioDaily).where(eq(portfolioDaily.date, "2025-05-02"))).toMatchObject([
        { inflowCents: 10075 },
    ]);
    expect((await loadPortfolio(db)).puts).toMatchObject([{ premiumEur: 153.5 }]);
});

it("grosses up a dividend at the broker shares moved to", async () => {
    const db = await freshDb();
    const shares = {
        rawImportId: await insertRawImport(db),
        instrumentId: "kbc",
        quantity: 100,
        price: 90,
        currency: "EUR",
    } as const;

    await db.insert(transactions).values([
        { ...shares, source: "binck", broker: "binck", externalKey: "buy", side: "buy", tradeDate: "2023-01-10" },
        {
            ...shares,
            source: "binck",
            broker: "binck",
            externalKey: "out",
            side: "transfer_out",
            tradeDate: "2024-03-01",
        },
        { ...shares, source: "saxo", broker: "saxo", externalKey: "in", side: "transfer_in", tradeDate: "2024-03-01" },
    ]);
    await db.insert(dividendEvents).values({ instrumentId: "kbc", exDate: "2025-05-09", amount: 5 });
    await db.insert(income).values({
        source: "saxo",
        broker: "saxo",
        rawImportId: shares.rawImportId,
        externalKey: "a",
        kind: "dividend",
        instrumentId: "kbc",
        payDate: "2025-05-13",
        amount: 350,
        currency: "EUR",
    });

    expect((await loadLedger(db)).incomeFlows.map(({ value }) => value)).toEqual([50000]);
});
