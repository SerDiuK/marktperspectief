import { createHash } from "node:crypto";
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { readSheet } from "read-excel-file/node";
import type { Db, Tx } from "@/db/connect";
import { getEffectiveTrades, getPendingChatTrades } from "@/db/ledger";
import {
    corporateActions,
    fees,
    type ImportReport,
    income,
    instrumentAliases,
    instruments,
    optionTrades,
    rawImports,
    theses,
    transactions,
} from "@/db/schema";
import { seed } from "@/db/seed";
import { replay } from "@/lib/engine/ledger";
import { toMicro } from "@/lib/engine/money";
import { toStockDividends } from "@/lib/portfolio/ledger";
import { isinIndex, optionCodeIndex } from "./instruments";
import { BINCK_HEADER, parseBinck } from "./parsers/binck";
import { parseChat } from "./parsers/chat";
import {
    DEGIRO_ACCOUNT_HEADER,
    DEGIRO_TRANSACTIONS_HEADER,
    parseDegiroAccount,
    parseDegiroTransactions,
} from "./parsers/degiro";
import { parseSaxoTransactions, SAXO_TRANSACTIONS_HEADER } from "./parsers/saxo";
import { getRaw, listRaw, putRaw } from "./raw-store";
import { planSupersede, unpaired } from "./reconcile";
import type { IngestResult, ParseResult, RawKind } from "./types";

const textFormats = [
    { kind: "binck_ledger", header: BINCK_HEADER, parse: parseBinck },
    {
        kind: "degiro_transactions",
        header: DEGIRO_TRANSACTIONS_HEADER,
        parse: parseDegiroTransactions,
    },
    {
        kind: "degiro_account",
        header: DEGIRO_ACCOUNT_HEADER,
        parse: parseDegiroAccount,
    },
] as const;
const parserVersion = 4;

function blobPath(kind: RawKind, sha256: string, name: string) {
    const env = process.env.VERCEL_ENV ?? "development";
    const safeName = name.replace(/[^\w.-]+/g, "_").slice(-100) || "upload";

    return `${env}/raw/${kind}/${sha256}/${safeName}`;
}

function decode(bytes: Uint8Array) {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        return null;
    }
}

async function readUpload(bytes: Uint8Array): Promise<{ kind: RawKind; parsed: ParseResult } | undefined> {
    const text = decode(bytes);

    if (text !== null) {
        const chat = parseChat(text);

        if (chat) return { kind: "chat", parsed: chat };

        const header = text.split(/\r?\n/, 1)[0].trim();
        const format = textFormats.find((candidate) => candidate.header === header);

        return format && { kind: format.kind, parsed: format.parse(text) };
    }

    const rows = await readSheet(Buffer.from(bytes)).catch(() => null);

    if (rows?.[0]?.join(",") === SAXO_TRANSACTIONS_HEADER) {
        return {
            kind: "saxo_transactions",
            parsed: parseSaxoTransactions(rows),
        };
    }
}

// A result for a file that wrote nothing, not even its raw_imports row.
export function notImported(name: string, status: "failed" | "rejected", error: string): IngestResult {
    return {
        name,
        status,
        kind: null,
        coverageFrom: null,
        coverageTo: null,
        report: {
            rows: {
                trades: 0,
                transfers: 0,
                puts: 0,
                dividends: 0,
                lending: 0,
                fees: 0,
                theses: 0,
                instruments: 0,
                voided: 0,
                reconciled: 0,
                duplicates: 0,
            },
            errors: [error],
        },
    };
}

function unseen<T extends { externalKey: string }>(rows: T[], known: { key: string }[]) {
    const keys = new Set(known.map(({ key }) => key));

    return rows.filter(({ externalKey }) => !keys.has(externalKey));
}

async function supersedes(
    db: Tx,
    trades: Parameters<typeof planSupersede>[0],
    covered: Pick<ParseResult["trades"][number], "source" | "broker" | "tradeDate">[],
) {
    const [pending, brokerTrades, taken] = await Promise.all([
        getPendingChatTrades(db),
        db.select().from(transactions).where(ne(transactions.source, "chat")),
        db.select({ order: transactions.supersededBy }).from(transactions).where(isNotNull(transactions.supersededBy)),
    ]);
    const chat = [...pending, ...trades.filter(({ source }) => source === "chat")];
    const plan = planSupersede(
        chat,
        [...brokerTrades, ...trades.filter(({ source }) => source !== "chat")],
        new Set(taken.flatMap(({ order }) => (order ? [order] : []))),
    );

    return {
        plan,
        unpaired: unpaired(
            chat,
            covered.filter(({ source }) => source !== "chat"),
            plan,
        ),
    };
}

async function oversold(
    db: Tx,
    added: Pick<
        typeof transactions.$inferInsert,
        "source" | "externalKey" | "instrumentId" | "side" | "tradeDate" | "tradeTime" | "quantity"
    >[],
    removed: Set<string>,
    actions: ParseResult["corporateActions"],
) {
    const [effective, stored] = await Promise.all([getEffectiveTrades(db), db.select().from(corporateActions)]);
    const filed = new Set(actions.map(({ id }) => id));
    const trades = [
        ...effective.filter(({ source, externalKey }) => source !== "chat" || !removed.has(externalKey)),
        ...added,
    ].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || (a.tradeTime ?? "").localeCompare(b.tradeTime ?? ""));

    try {
        replay(
            trades.map(({ instrumentId, side, tradeDate, quantity }, id) => ({
                id,
                instrumentId,
                side,
                date: tradeDate,
                micro: toMicro(quantity),
                cents: 0,
            })),
            toStockDividends([...stored.filter(({ id }) => !filed.has(id)), ...actions]),
        );

        return [];
    } catch (error) {
        return [error instanceof Error ? error.message : String(error)];
    }
}

async function apply(
    db: Tx,
    raw: {
        kind: RawKind;
        parsed: ParseResult;
        sha256: string;
        originalName: string;
        uploadedAt: string;
    },
): Promise<IngestResult> {
    const { parsed } = raw;
    const rows = [...parsed.trades, ...parsed.income, ...parsed.theses];

    const [instrumentIds, underlyings, stored, knownTrades, knownPuts, knownIncome, knownFees, knownTheses] =
        await Promise.all([
            isinIndex(db),
            optionCodeIndex(db),
            db.select({ id: instruments.id, yahooSymbol: instruments.yahooSymbol }).from(instruments),
            db
                .select({ key: transactions.externalKey })
                .from(transactions)
                .where(inArray(transactions.source, [...new Set(parsed.trades.map(({ source }) => source))])),
            db
                .select({ key: optionTrades.externalKey })
                .from(optionTrades)
                .where(inArray(optionTrades.broker, [...new Set(parsed.puts.map(({ broker }) => broker))])),
            db
                .select({ key: income.externalKey })
                .from(income)
                .where(inArray(income.source, [...new Set(parsed.income.map(({ source }) => source))])),
            db
                .select({ key: fees.externalKey })
                .from(fees)
                .where(inArray(fees.broker, [...new Set(parsed.fees.map(({ broker }) => broker))])),
            db
                .select({ key: theses.externalKey })
                .from(theses)
                .where(
                    inArray(
                        theses.externalKey,
                        parsed.theses.map(({ externalKey }) => externalKey),
                    ),
                ),
        ]);
    const filed = new Set(parsed.instruments.map(({ id }) => id));
    const clashes = parsed.instruments.flatMap(({ id, isin, yahooSymbol }) => [
        ...(instrumentIds.has(isin) && instrumentIds.get(isin) !== id
            ? [`ISIN ${isin} already belongs to ${instrumentIds.get(isin)}`]
            : []),
        ...stored.flatMap((row) =>
            row.id !== id && yahooSymbol && row.yahooSymbol === yahooSymbol
                ? [`Yahoo symbol ${yahooSymbol} already belongs to ${row.id}`]
                : [],
        ),
    ]);
    const known = new Set([...filed, ...stored.map(({ id }) => id)]);
    const orphans = [...parsed.aliases, ...parsed.corporateActions].flatMap(({ instrumentId }) =>
        known.has(instrumentId) ? [] : [`Unknown instrument ${instrumentId}`],
    );

    for (const { id, isin } of parsed.instruments) instrumentIds.set(isin, id);

    for (const { kind, value, instrumentId } of parsed.aliases) {
        if (kind === "isin") instrumentIds.set(value, instrumentId);
        else underlyings.set(value, instrumentId);
    }

    const unknown = new Set(rows.flatMap(({ isin }) => (isin !== null && !instrumentIds.has(isin) ? [isin] : [])));
    const unknownCodes = new Set(
        parsed.puts.flatMap(({ optionCode }) => (underlyings.has(optionCode) ? [] : [optionCode])),
    );
    const parseErrors = [
        ...parsed.errors,
        ...clashes,
        ...new Set(orphans),
        ...[...unknown].map((isin) => `Unknown ISIN ${isin}: add the instrument first`),
        ...[...unknownCodes].map((code) => `Unknown option code ${code}: add it to its instrument first`),
    ];

    const instrumentId = (isin: string) => {
        const id = instrumentIds.get(isin);

        if (!id) throw new Error(`Unknown ISIN ${isin}`);

        return id;
    };
    const underlying = (optionCode: string) => {
        const id = underlyings.get(optionCode);

        if (!id) throw new Error(`Unknown option code ${optionCode}`);

        return id;
    };
    const newTrades = unseen(parsed.trades, knownTrades);
    const newPuts = unseen(parsed.puts, knownPuts);
    const newIncome = unseen(parsed.income, knownIncome);
    const newFees = unseen(parsed.fees, knownFees);
    const newTheses = unseen(parsed.theses, knownTheses);
    const ledgerTrades = parseErrors.length
        ? []
        : newTrades.map(({ isin, ...row }) => ({
              ...row,
              instrumentId: instrumentId(isin),
          }));
    const { plan: superseded, unpaired: stale } =
        !parseErrors.length && parsed.trades.length
            ? await supersedes(db, ledgerTrades, parsed.trades)
            : { plan: new Map<string, string>(), unpaired: [] };
    const errors = [
        ...parseErrors,
        ...stale.map(
            ({ side, quantity, instrumentId, tradeDate, externalKey }) =>
                `The chat ${side} of ${quantity} ${instrumentId} on ${tradeDate} (${externalKey}) matches no order in this file: undo it, then upload the file again`,
        ),
    ];

    if (!errors.length && (ledgerTrades.length || parsed.voids.length || parsed.corporateActions.length)) {
        const removed = new Set([...superseded.keys(), ...parsed.voids]);

        errors.push(...(await oversold(db, ledgerTrades, removed, parsed.corporateActions)));
    }

    const trades = newTrades.filter(({ side }) => side === "buy" || side === "sell").length;
    const dividends = newIncome.filter(({ kind }) => kind === "dividend").length;
    const report: ImportReport = {
        rows: {
            trades,
            transfers: newTrades.length - trades,
            puts: newPuts.length,
            dividends,
            lending: newIncome.length - dividends,
            fees: newFees.length,
            theses: newTheses.length,
            instruments: parsed.instruments.length,
            voided: parsed.voids.length,
            reconciled: superseded.size,
            duplicates:
                rows.length +
                parsed.puts.length +
                parsed.fees.length -
                newTrades.length -
                newPuts.length -
                newIncome.length -
                newFees.length -
                newTheses.length,
        },
        errors,
    };

    const dates = [
        ...parsed.trades.map(({ tradeDate }) => tradeDate),
        ...parsed.puts.map(({ tradeDate }) => tradeDate),
        ...parsed.income.map(({ payDate }) => payDate),
        ...parsed.fees.map(({ date }) => date),
        ...parsed.theses.map(({ date }) => date),
    ].sort();
    const status = errors.length ? "failed" : "applied";
    const result = {
        name: raw.originalName,
        status,
        kind: raw.kind,
        coverageFrom: dates[0] ?? null,
        coverageTo: dates.at(-1) ?? null,
        report,
    } as const;

    const upsert = db
        .insert(rawImports)
        .values({
            kind: raw.kind,
            sha256: raw.sha256,
            originalName: raw.originalName,
            updatedAt: raw.uploadedAt,
            parserVersion,
            status,
            coverageFrom: result.coverageFrom,
            coverageTo: result.coverageTo,
            report,
        })
        .onConflictDoUpdate({
            target: rawImports.sha256,
            set: {
                updatedAt: raw.uploadedAt,
                parserVersion,
                status,
                coverageFrom: result.coverageFrom,
                coverageTo: result.coverageTo,
                report,
            },
        });

    if (status === "failed") {
        await upsert;

        return result;
    }

    const rawImportId = sql<number>`(select ${rawImports.id} from ${rawImports} where ${rawImports.sha256} = ${raw.sha256})`;
    const chatTrade = (externalKey: string) =>
        and(eq(transactions.source, "chat"), eq(transactions.externalKey, externalKey));

    for (const statement of [
        upsert,
        ...parsed.instruments.map((row) =>
            db.insert(instruments).values(row).onConflictDoUpdate({ target: instruments.id, set: row }),
        ),
        ...parsed.aliases.map((row) =>
            db
                .insert(instrumentAliases)
                .values(row)
                .onConflictDoUpdate({ target: [instrumentAliases.kind, instrumentAliases.value], set: row }),
        ),
        ...parsed.corporateActions.map((row) =>
            db.insert(corporateActions).values(row).onConflictDoUpdate({ target: corporateActions.id, set: row }),
        ),
        ...(ledgerTrades.length
            ? [db.insert(transactions).values(ledgerTrades.map((row) => ({ ...row, rawImportId })))]
            : []),
        ...[...superseded].map(([externalKey, order]) =>
            db.update(transactions).set({ supersededBy: order }).where(chatTrade(externalKey)),
        ),
        ...parsed.voids.map((externalKey) =>
            db.update(transactions).set({ voidedAt: raw.uploadedAt }).where(chatTrade(externalKey)),
        ),
        ...(newPuts.length
            ? [
                  db.insert(optionTrades).values(
                      newPuts.map(({ optionCode, ...row }) => ({
                          ...row,
                          rawImportId,
                          instrumentId: underlying(optionCode),
                      })),
                  ),
              ]
            : []),
        ...(newIncome.length
            ? [
                  db.insert(income).values(
                      newIncome.map(({ isin, ...row }) => ({
                          ...row,
                          rawImportId,
                          instrumentId: isin && instrumentId(isin),
                      })),
                  ),
              ]
            : []),
        ...(newFees.length ? [db.insert(fees).values(newFees.map((row) => ({ ...row, rawImportId })))] : []),
        ...(newTheses.length
            ? [
                  db.insert(theses).values(
                      newTheses.map(({ isin, ...row }) => ({
                          ...row,
                          rawImportId,
                          instrumentId: instrumentId(isin),
                      })),
                  ),
              ]
            : []),
    ]) {
        await statement;
    }

    return result;
}

function applyRaw(db: Db, raw: Parameters<typeof apply>[1]) {
    return db.transaction((tx) => apply(tx, raw));
}

export async function ingestRaw(
    db: Db,
    upload: { name: string; bytes: Uint8Array; chat?: boolean },
): Promise<IngestResult> {
    const sha256 = createHash("sha256").update(upload.bytes).digest("hex");
    const [stored] = await db.select().from(rawImports).where(eq(rawImports.sha256, sha256));

    if (stored?.status === "applied" && stored.parserVersion === parserVersion) {
        const { kind, coverageFrom, coverageTo, report } = stored;

        return {
            name: upload.name,
            status: "duplicate",
            kind,
            coverageFrom,
            coverageTo,
            report,
        };
    }

    const read = await readUpload(upload.bytes);

    if (!read) return notImported(upload.name, "rejected", "This is not a file the importer knows");

    if (read.kind === "chat" && (read.parsed.trades.length || read.parsed.voids.length) && !upload.chat) {
        return notImported(upload.name, "rejected", "A chat trade is recorded in chat, not uploaded");
    }

    await putRaw(blobPath(read.kind, sha256, upload.name), upload.bytes);

    return applyRaw(db, {
        ...read,
        sha256,
        originalName: upload.name,
        uploadedAt: new Date().toISOString(),
    });
}

export async function clearLedger(db: Db) {
    const [first, ...rest] = [
        transactions,
        optionTrades,
        income,
        fees,
        corporateActions,
        theses,
        rawImports,
        instrumentAliases,
    ].map((table) => db.delete(table));

    await db.batch([first, ...rest]);
    await seed(db);
}

export async function rebuild(db: Db) {
    await clearLedger(db);

    const blobs = await listRaw("production/raw/");

    blobs.sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime());

    const files = await Promise.all(
        blobs.map(async ({ pathname, uploadedAt }) => {
            const bytes = await getRaw(pathname);

            return {
                name: pathname.slice(pathname.lastIndexOf("/") + 1),
                uploadedAt,
                bytes,
                read: await readUpload(bytes),
            };
        }),
    );
    const definesInstruments = ({ read }: (typeof files)[number]) =>
        Boolean(
            read && read.parsed.instruments.length + read.parsed.aliases.length + read.parsed.corporateActions.length,
        );
    const results: IngestResult[] = [];

    let pending = [...files.filter(definesInstruments), ...files.filter((file) => !definesInstruments(file))].map(
        (file, index) => ({ ...file, index }),
    );

    while (pending.length) {
        for (const { index, name, uploadedAt, bytes, read } of pending) {
            results[index] = read
                ? await applyRaw(db, {
                      ...read,
                      sha256: createHash("sha256").update(bytes).digest("hex"),
                      originalName: name,
                      uploadedAt: uploadedAt.toISOString(),
                  })
                : notImported(name, "rejected", "This is not a file the importer knows");
        }

        const failed = pending.filter(({ index }) => results[index].status === "failed");

        if (failed.length === pending.length) break;

        pending = failed;
    }

    return results;
}
