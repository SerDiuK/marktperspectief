import { randomUUID } from "node:crypto";
import { and, desc, eq, lt, lte } from "drizzle-orm";
import type { Db } from "@/db/connect";
import { getEffectiveTrades } from "@/db/ledger";
import { chatDrafts, instruments, priceDaily, transactions } from "@/db/schema";
import { addDays, ownerDate } from "@/lib/dates";
import { isDemo } from "@/lib/demo/marker";
import { held, replay } from "@/lib/engine/ledger";
import { fromMicro, toCents, toMicro } from "@/lib/engine/money";
import { ingestRaw } from "@/lib/import/ingest";
import { isinIndex } from "@/lib/import/instruments";
import { euroTrades, loadStockDividends, loadToEur } from "@/lib/portfolio/ledger";
import { refreshDerived } from "@/lib/portfolio/refresh";
import type { ChatEntry, InstrumentInput, ThesisInput, TransactionInput } from "@/lib/schemas";

async function findInstruments(db: Db, query: string) {
    const [rows, isins] = await Promise.all([db.select().from(instruments), isinIndex(db)]);
    const byIsin = isins.get(query.trim().toUpperCase());

    if (byIsin) return rows.filter(({ id }) => id === byIsin);

    const wanted = query.trim().toLowerCase();
    const bySymbol = rows.filter(({ yahooSymbol }) => {
        const symbol = yahooSymbol?.toLowerCase();

        return symbol === wanted || symbol?.split(".")[0] === wanted;
    });

    if (bySymbol.length) return bySymbol;

    return rows.filter(({ name }) => name.toLowerCase().includes(wanted));
}

async function record(db: Db, name: string, entry: string, now: Date) {
    const result = await ingestRaw(db, {
        name,
        bytes: new TextEncoder().encode(entry),
        chat: true,
    });

    if (result.status === "applied") await refreshDerived(db, ownerDate(now));

    return result;
}

async function findInstrument(db: Db, query: string) {
    const matches = await findInstruments(db, query);

    if (matches.length === 0) {
        throw new Error(`No instrument matches "${query}". Add it with add_instrument first.`);
    }

    if (matches.length > 1) {
        return {
            candidates: matches.slice(0, 5).map(({ name, isin, yahooSymbol }) => ({
                name,
                isin,
                yahooSymbol,
            })),
        };
    }

    return { instrument: matches[0] };
}

async function saveDraft(db: Db, entry: ChatEntry, now: Date) {
    const expiresAt = new Date(now.getTime() + 30 * 60_000).toISOString();

    await db.batch([
        db.delete(chatDrafts).where(lt(chatDrafts.expiresAt, now.toISOString())),
        db.insert(chatDrafts).values({ id: entry.draftId, entry: JSON.stringify(entry), expiresAt }),
    ]);

    return expiresAt;
}

const draftNames = { add: "trade", thesis: "thesis", instruments: "instrument" } as const;

async function openDraft(db: Db, draftId: string, kind: keyof typeof draftNames, now: Date) {
    const [draft] = await db.select().from(chatDrafts).where(eq(chatDrafts.id, draftId));

    if (!draft || draft.expiresAt < now.toISOString()) {
        throw new Error("No open draft with that id: drafts last 30 minutes, so make a new one");
    }

    const entry: ChatEntry = JSON.parse(draft.entry);

    if (entry.chat !== kind) {
        throw new Error(`That draft is not a ${draftNames[kind]}: confirm it with its own tool`);
    }

    return draft.entry;
}

export async function addTransaction(db: Db, input: TransactionInput, now: Date) {
    const match = await findInstrument(db, input.instrument);

    if ("candidates" in match) return match;

    const { instrument } = match;
    const tradeDate = input.tradeDate ?? ownerDate(now);

    if (tradeDate > ownerDate(now)) {
        throw new Error(`${tradeDate} is in the future`);
    }

    const trade = {
        broker: input.broker,
        isin: instrument.isin,
        side: input.side,
        tradeDate,
        quantity: input.quantity,
        price: input.price,
        currency: instrument.currency,
        feesEur: input.feesEur,
    };

    const [trades, stockDividends, toEur, [close]] = await Promise.all([
        getEffectiveTrades(db),
        loadStockDividends(db),
        loadToEur(db),
        db
            .select()
            .from(priceDaily)
            .where(and(eq(priceDaily.instrumentId, instrument.id), lte(priceDaily.date, tradeDate)))
            .orderBy(desc(priceDaily.date))
            .limit(1),
    ]);
    const amountEur = toEur(trade.quantity * trade.price, trade.currency, tradeDate);
    const totalEur = trade.side === "buy" ? amountEur + trade.feesEur : amountEur - trade.feesEur;
    const { books } = (() => {
        try {
            return replay(
                [
                    ...euroTrades(trades, toEur),
                    {
                        id: 0,
                        instrumentId: instrument.id,
                        side: trade.side,
                        date: tradeDate,
                        micro: toMicro(trade.quantity),
                        cents: toCents(totalEur),
                    },
                ],
                stockDividends,
            );
        } catch {
            throw new Error(
                `Selling ${trade.quantity} ${instrument.name} on ${tradeDate} sells more shares than are held`,
            );
        }
    })();

    const warnings: string[] = [];

    if (close && Math.abs(trade.price / close.close - 1) > 0.15) {
        warnings.push(`The price is more than 15% from the close of ${close.close} ${trade.currency} on ${close.date}`);
    }

    const similar = trades.find(
        (row) =>
            row.instrumentId === instrument.id &&
            row.side === trade.side &&
            Math.abs(row.quantity - trade.quantity) < 1e-6 &&
            row.tradeDate >= addDays(tradeDate, -3) &&
            row.tradeDate <= addDays(tradeDate, 3),
    );

    if (similar) {
        warnings.push(
            `The ledger already has a ${similar.side} of ${similar.quantity} on ${similar.tradeDate} from ${similar.source}`,
        );
    }

    const draftId = randomUUID();
    const expiresAt = await saveDraft(db, { chat: "add", draftId, trade }, now);
    const book = books.get(instrument.id);

    return {
        draftId,
        expiresAt,
        instrument: instrument.name,
        ...trade,
        totalEur: Math.round(totalEur * 100) / 100,
        sharesAfter: book ? fromMicro(held(book)) : 0,
        warnings,
    };
}

export async function confirmTransaction(db: Db, draftId: string, now: Date) {
    return record(db, `${draftId}.add.json`, await openDraft(db, draftId, "add", now), now);
}

export async function undoChatTransaction(db: Db, draftId: string, now: Date) {
    const [row] = await db
        .select()
        .from(transactions)
        .where(and(eq(transactions.source, "chat"), eq(transactions.externalKey, draftId)));

    if (!row) throw new Error("No chat trade has that id");

    if (row.supersededBy) {
        throw new Error("The broker's export has replaced this trade, so it can't be undone here");
    }

    const entry: ChatEntry = { chat: "void", draftId };

    return record(db, `${draftId}.void.json`, JSON.stringify(entry), now);
}

export async function proposeThesis(db: Db, { instrument: query, ...input }: ThesisInput, now: Date) {
    const match = await findInstrument(db, query);

    if ("candidates" in match) return match;

    const { instrument } = match;
    const thesis = { isin: instrument.isin, date: ownerDate(now), ...input };
    const draftId = randomUUID();
    const expiresAt = await saveDraft(db, { chat: "thesis", draftId, thesis }, now);

    return { draftId, expiresAt, instrument: instrument.name, ...thesis };
}

export async function confirmThesis(db: Db, draftId: string, now: Date) {
    return ingestRaw(db, {
        name: `${draftId}.thesis.json`,
        bytes: new TextEncoder().encode(await openDraft(db, draftId, "thesis", now)),
    });
}

export async function addInstrument(db: Db, { optionCode, ...input }: InstrumentInput, now: Date) {
    if (await isDemo(db)) throw new Error("The demo takes no new instruments");

    const id = input.name
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    const [rows, isins] = await Promise.all([db.select().from(instruments), isinIndex(db)]);
    const taken = [
        isins.has(input.isin) && `ISIN ${input.isin} already belongs to ${isins.get(input.isin)}`,
        rows.some((row) => row.id === id) && `The id ${id} is taken: pick another name`,
        input.yahooSymbol &&
            rows.find((row) => row.yahooSymbol === input.yahooSymbol) &&
            `Yahoo symbol ${input.yahooSymbol} is taken`,
    ].filter(Boolean);

    if (taken.length) throw new Error(taken.join("; "));

    const instrument = { id, ...input, yahooSymbol: input.yahooSymbol ?? null };
    const draftId = randomUUID();
    const expiresAt = await saveDraft(
        db,
        {
            chat: "instruments",
            draftId,
            instruments: [instrument],
            aliases: optionCode ? [{ kind: "option_code", value: optionCode, instrumentId: id }] : [],
            corporateActions: [],
        },
        now,
    );

    return { draftId, expiresAt, ...instrument, optionCode: optionCode ?? null };
}

export async function confirmInstrument(db: Db, draftId: string, now: Date) {
    return ingestRaw(db, {
        name: `${draftId}.instrument.json`,
        bytes: new TextEncoder().encode(await openDraft(db, draftId, "instruments", now)),
    });
}
