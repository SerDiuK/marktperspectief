import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const currencies = ["EUR", "USD", "GBP", "CHF"] as const;

export const holdingTypes = ["compounder", "bargain", "cigar_butt", "cyclical", "asset_play", "avoid", "core"] as const;

export const brokers = ["binck", "saxo", "degiro"] as const;

const sources = [...brokers, "chat"] as const;

export type ImportReport = {
    rows: Record<
        | "trades"
        | "transfers"
        | "puts"
        | "dividends"
        | "lending"
        | "fees"
        | "theses"
        | "instruments"
        | "voided"
        | "reconciled"
        | "duplicates",
        number
    >;
    errors: string[];
};

export const rawImports = sqliteTable("raw_imports", {
    id: integer().primaryKey({ autoIncrement: true }),
    kind: text({
        enum: ["binck_ledger", "saxo_transactions", "degiro_transactions", "degiro_account", "chat"],
    }).notNull(),
    sha256: text().notNull().unique(),
    originalName: text().notNull(),
    updatedAt: text().notNull(),
    parserVersion: integer().notNull(),
    status: text({ enum: ["applied", "failed"] }).notNull(),
    coverageFrom: text(),
    coverageTo: text(),
    report: text({ mode: "json" }).$type<ImportReport>().notNull(),
});

export const instruments = sqliteTable("instruments", {
    id: text().primaryKey(),
    isin: text().notNull().unique(),
    name: text().notNull(),
    currency: text({ enum: currencies }).notNull(),
    yahooSymbol: text().unique("instruments_yahoo_symbol_unique"),
});

export const instrumentAliases = sqliteTable(
    "instrument_aliases",
    {
        kind: text({ enum: ["isin", "option_code"] }).notNull(),
        value: text().notNull(),
        instrumentId: text()
            .notNull()
            .references(() => instruments.id),
    },
    (t) => [primaryKey({ columns: [t.kind, t.value] })],
);

export const transactions = sqliteTable(
    "transactions",
    {
        id: integer().primaryKey({ autoIncrement: true }),
        source: text({ enum: sources }).notNull(),
        broker: text({ enum: brokers }).notNull(),
        externalKey: text().notNull(),
        rawImportId: integer()
            .notNull()
            .references(() => rawImports.id),
        instrumentId: text()
            .notNull()
            .references(() => instruments.id),
        side: text({
            enum: ["buy", "sell", "transfer_in", "transfer_out"],
        }).notNull(),
        tradeDate: text().notNull(),
        tradeTime: text(),
        quantity: real().notNull(),
        price: real().notNull(),
        currency: text({ enum: currencies }).notNull(),
        feesEur: real().notNull().default(0),
        orderRef: text(),
        supersededBy: text(),
        voidedAt: text(),
    },
    (t) => [
        uniqueIndex("transactions_source_key").on(t.source, t.externalKey),
        index("transactions_instrument_date").on(t.instrumentId, t.tradeDate),
    ],
);

// amount is the cash the broker booked; gross is null when the broker does not
// show it.
export const income = sqliteTable(
    "income",
    {
        id: integer().primaryKey({ autoIncrement: true }),
        source: text({ enum: sources }).notNull(),
        broker: text({ enum: brokers }).notNull(),
        externalKey: text().notNull(),
        rawImportId: integer()
            .notNull()
            .references(() => rawImports.id),
        kind: text({ enum: ["dividend", "lending"] }).notNull(),
        instrumentId: text().references(() => instruments.id),
        payDate: text().notNull(),
        amount: real().notNull(),
        gross: real(),
        currency: text({ enum: currencies }).notNull(),
    },
    (t) => [uniqueIndex("income_source_key").on(t.source, t.externalKey)],
);

// Sold euro puts on instrument_id, 100 shares per contract. premium is per
// share; an assignment or an expiry closes contracts at no premium.
export const optionTrades = sqliteTable(
    "option_trades",
    {
        id: integer().primaryKey({ autoIncrement: true }),
        broker: text({ enum: brokers }).notNull(),
        externalKey: text().notNull(),
        rawImportId: integer()
            .notNull()
            .references(() => rawImports.id),
        instrumentId: text()
            .notNull()
            .references(() => instruments.id),
        strike: real().notNull(),
        expiry: text().notNull(),
        side: text({
            enum: ["sell", "buy", "assigned", "expired"],
        }).notNull(),
        tradeDate: text().notNull(),
        contracts: integer().notNull(),
        premium: real().notNull(),
        feesEur: real().notNull().default(0),
    },
    (t) => [uniqueIndex("option_trades_broker_key").on(t.broker, t.externalKey)],
);

// Costs not attached to a trade; trade costs live in transactions.fees_eur.
// A positive amount is a cost, a negative one a credit.
export const fees = sqliteTable(
    "fees",
    {
        id: integer().primaryKey({ autoIncrement: true }),
        broker: text({ enum: brokers }).notNull(),
        externalKey: text().notNull(),
        rawImportId: integer()
            .notNull()
            .references(() => rawImports.id),
        date: text().notNull(),
        amount: real().notNull(),
        currency: text({ enum: currencies }).notNull(),
    },
    (t) => [uniqueIndex("fees_broker_key").on(t.broker, t.externalKey)],
);

// Stock dividends: shares received at no cost.
export const corporateActions = sqliteTable("corporate_actions", {
    id: text().primaryKey(),
    broker: text({ enum: brokers }).notNull(),
    date: text().notNull(),
    instrumentId: text()
        .notNull()
        .references(() => instruments.id),
    shares: real().notNull(),
});

export const theses = sqliteTable("theses", {
    id: integer().primaryKey({ autoIncrement: true }),
    externalKey: text().notNull().unique("theses_external_key_unique"),
    rawImportId: integer()
        .notNull()
        .references(() => rawImports.id),
    instrumentId: text()
        .notNull()
        .references(() => instruments.id),
    date: text().notNull(),
    type: text({ enum: holdingTypes }).notNull(),
    pillars: text({ mode: "json" }).$type<{ claim: string; wrongIf: string }[]>().notNull(),
    reason: text().notNull(),
});

export const chatDrafts = sqliteTable("chat_drafts", {
    id: text().primaryKey(),
    entry: text().notNull(),
    expiresAt: text().notNull(),
});

// In the instrument's currency, dated on the exchange's own day.
export const priceDaily = sqliteTable(
    "price_daily",
    {
        instrumentId: text()
            .notNull()
            .references(() => instruments.id),
        date: text().notNull(),
        close: real().notNull(),
    },
    (t) => [primaryKey({ columns: [t.instrumentId, t.date] })],
);

export const dividendEvents = sqliteTable(
    "dividend_events",
    {
        instrumentId: text()
            .notNull()
            .references(() => instruments.id),
        exDate: text().notNull(),
        amount: real().notNull(),
    },
    (t) => [primaryKey({ columns: [t.instrumentId, t.exDate] })],
);

export const fxDaily = sqliteTable(
    "fx_daily",
    {
        currency: text({ enum: currencies }).notNull(),
        date: text().notNull(),
        perEur: real().notNull(),
    },
    (t) => [primaryKey({ columns: [t.currency, t.date] })],
);

export const portfolioDaily = sqliteTable("portfolio_daily", {
    date: text().primaryKey(),
    valueCents: integer().notNull(),
    inflowCents: integer().notNull(),
    outflowCents: integer().notNull(),
    twrIndex: real().notNull(),
});
