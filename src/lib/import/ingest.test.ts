import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { getEffectiveTrades } from "@/db/ledger";
import { corporateActions, optionTrades, rawImports, transactions } from "@/db/schema";
import { freshDb } from "@/db/test-db";
import { loadLedger } from "@/lib/portfolio/ledger";
import { ingestRaw, rebuild } from "./ingest";
import { BINCK_HEADER } from "./parsers/binck";
import { DEGIRO_ACCOUNT_HEADER, DEGIRO_TRANSACTIONS_HEADER } from "./parsers/degiro";
import { getRaw, listRaw, putRaw } from "./raw-store";

vi.mock("./raw-store", () => ({ putRaw: vi.fn(), listRaw: vi.fn(), getRaw: vi.fn() }));

const buy = "2019-01-02,1,buy,LU1598757687,ArcelorMittal,10,100.5,EUR,1005.0,7.25,,,1012.25,1,10,";
const sell = "2019-08-01,2,sell,LU1598757687,ArcelorMittal,4,150.0,EUR,600.0,7.25,,,592.75,2,6,";
const dividend = "2019-04-01,3,dividend,LU1598757687,ArcelorMittal,10,1.0,EUR,10.0,,1.5,15,8.5,,10,";
const interest = "2019-07-06,4,interest,,,,,EUR,,,,,-0.26,,,";

function upload(lines: string[], name = "binck.csv") {
    const text = [BINCK_HEADER, ...lines].join("\n");

    return { name, bytes: new TextEncoder().encode(text) };
}

const trade =
    '03-01-2023,10:00,KONINKLIJKE PHILIPS NV,NL0000009538,EAM,XAMS,5,"1300,0000",EUR,"-6500,00",EUR,"-6500,00","0,0000","0,00","-4,90","-6504,90",order-1';
const later =
    '04-03-2024,11:00,KONINKLIJKE PHILIPS NV,NL0000009538,EAM,XAMS,-5,"1400,0000",EUR,"7000,00",EUR,"7000,00","0,0000","0,00","-4,90","6995,10",order-2';

function degiro(lines: string[]) {
    return {
        name: "Transactions.csv",
        bytes: new TextEncoder().encode([DEGIRO_TRANSACTIONS_HEADER, ...lines].join("\n")),
    };
}

function chat(draftId: string, tradeDate: string, price = 1300, side = "buy", quantity = 5) {
    return {
        name: `${draftId}.add.json`,
        bytes: new TextEncoder().encode(
            JSON.stringify({
                chat: "add",
                draftId,
                trade: {
                    broker: "degiro",
                    isin: "NL0000009538",
                    side,
                    tradeDate,
                    quantity,
                    price,
                    currency: "EUR",
                    feesEur: 0,
                },
            }),
        ),
        chat: true,
    };
}

function undo(draftId: string) {
    return {
        name: `${draftId}.void.json`,
        bytes: new TextEncoder().encode(JSON.stringify({ chat: "void", draftId })),
        chat: true,
    };
}

function bonus(shares: number) {
    return {
        name: "instruments.json",
        bytes: new TextEncoder().encode(
            JSON.stringify({
                chat: "instruments",
                draftId: "00000000-0000-4000-8000-000000000002",
                aliases: [],
                corporateActions: [
                    { id: "philips-bonus", broker: "degiro", date: "2023-02-01", instrumentId: "philips", shares },
                ],
            }),
        ),
    };
}

function entry(draft: number, rest: object) {
    return {
        name: `${draft}.json`,
        bytes: new TextEncoder().encode(
            JSON.stringify({ draftId: `00000000-0000-4000-8000-${String(draft).padStart(12, "0")}`, ...rest }),
        ),
    };
}

beforeEach(() => {
    vi.mocked(putRaw).mockClear();
});

it("refuses an instrument whose ISIN is another instrument's old ISIN", async () => {
    const db = await freshDb();

    await ingestRaw(
        db,
        entry(20, { chat: "instruments", aliases: [{ kind: "isin", value: "US0378331005", instrumentId: "philips" }] }),
    );

    const result = await ingestRaw(
        db,
        entry(21, {
            chat: "instruments",
            instruments: [{ id: "foo", isin: "US0378331005", name: "Foo", currency: "USD", yahooSymbol: null }],
        }),
    );

    expect(result.report.errors).toEqual(["ISIN US0378331005 already belongs to philips"]);
});

it("never applies two sells confirmed at once that together sell more than is held", async () => {
    const db = await freshDb();

    await ingestRaw(db, degiro([trade]));
    await Promise.allSettled([
        ingestRaw(db, chat("00000000-0000-4000-8000-000000000031", "2023-02-01", 1300, "sell", 4)),
        ingestRaw(db, chat("00000000-0000-4000-8000-000000000032", "2023-02-02", 1300, "sell", 4)),
    ]);

    expect((await getEffectiveTrades(db)).filter(({ side }) => side === "sell")).toHaveLength(1);
});

it("refuses an uploaded thesis with fewer than two pillars unless it is avoid", async () => {
    const db = await freshDb();
    const thesis = (type: string) => ({ isin: "NL0000009538", date: "2024-01-01", type, pillars: [], reason: "Why" });

    expect((await ingestRaw(db, entry(40, { chat: "thesis", thesis: thesis("bargain") }))).status).toBe("rejected");
    expect((await ingestRaw(db, entry(41, { chat: "thesis", thesis: thesis("avoid") }))).status).toBe("applied");
});

it("stores a file and applies it once", async () => {
    const db = await freshDb();
    const first = await ingestRaw(db, upload([buy, sell]));
    const again = await ingestRaw(db, upload([buy, sell], "renamed.csv"));

    expect([first.status, again.status]).toEqual(["applied", "duplicate"]);
    expect(await db.$count(transactions)).toBe(2);
    expect(putRaw).toHaveBeenCalledOnce();
    expect(putRaw).toHaveBeenCalledWith(
        expect.stringMatching(/^development\/raw\/binck_ledger\/[0-9a-f]{64}\/binck\.csv$/),
        expect.anything(),
    );
});

it("applies a file again after a parser upgrade, skipping the rows it already added and dating the update", async () => {
    const db = await freshDb();
    const before = "2026-10-26T00:00:00.000Z";

    await ingestRaw(db, upload([dividend, interest]));
    await db.update(rawImports).set({ parserVersion: 1, updatedAt: before });

    const again = await ingestRaw(db, upload([dividend, interest]));

    expect(again.status).toBe("applied");
    expect(again.report.rows).toMatchObject({
        dividends: 0,
        fees: 0,
        duplicates: 2,
    });

    const [{ updatedAt }] = await db.select({ updatedAt: rawImports.updatedAt }).from(rawImports);

    expect(updatedAt).not.toBe(before);
});

it("writes no ledger rows from a file with an error", async () => {
    const db = await freshDb();
    const unknown = buy.replace(",1,buy,LU1598757687,", ",2,buy,US0378331005,");
    const result = await ingestRaw(db, upload([buy, unknown]));

    expect(result.status).toBe("failed");
    expect(result.report.errors).toEqual([expect.stringContaining("US0378331005")]);
    expect(await db.$count(transactions)).toBe(0);
});

it("rejects a file it doesn't know, or a chat trade or undo uploaded as a file, before storing it", async () => {
    const db = await freshDb();
    const draftId = "11111111-1111-4111-8111-111111111111";
    const result = await ingestRaw(db, {
        name: "notes.csv",
        bytes: new TextEncoder().encode("a,b\n1,2"),
    });
    const uploaded = await ingestRaw(db, { ...chat(draftId, "2023-01-02"), chat: false });
    const undone = await ingestRaw(db, { ...undo(draftId), chat: false });

    expect([result.status, uploaded.status, undone.status]).toEqual(["rejected", "rejected", "rejected"]);
    expect(putRaw).not.toHaveBeenCalled();
    expect(await db.$count(rawImports)).toBe(0);
});

it("adds only the new trades of an overlapping DEGIRO export", async () => {
    const db = await freshDb();

    await ingestRaw(db, degiro([trade]));

    const result = await ingestRaw(db, degiro([later, trade]));

    expect(result.report.rows).toMatchObject({ trades: 1, duplicates: 1 });
    expect(await db.$count(transactions)).toBe(2);
});

it("adds a dividend's reversal and rebooking from a later, overlapping DEGIRO statement to the lines it already has", async () => {
    const db = await freshDb();
    const statement = (lines: string[]) => ({
        name: "Account.csv",
        bytes: new TextEncoder().encode([DEGIRO_ACCOUNT_HEADER, ...lines].join("\n")),
    });
    const paid = [
        '08-05-2026,07:15,07-05-2026,LVMH MOET HENNESSY,FR0000121014,Retención del dividendo,,EUR,"-25,00",EUR,"60,00",',
        '08-05-2026,07:15,07-05-2026,LVMH MOET HENNESSY,FR0000121014,Dividendo,,EUR,"100,00",EUR,"85,00",',
    ];
    const rebooked = [
        '05-06-2026,13:49,07-05-2026,LVMH MOET HENNESSY,FR0000121014,Retención del dividendo,,EUR,"-30,00",EUR,"175,00",',
        '05-06-2026,13:49,07-05-2026,LVMH MOET HENNESSY,FR0000121014,Dividendo,,EUR,"120,00",EUR,"205,00",',
        '05-06-2026,13:48,07-05-2026,LVMH MOET HENNESSY,FR0000121014,Retención del dividendo,,EUR,"25,00",EUR,"85,00",',
        '05-06-2026,13:48,07-05-2026,LVMH MOET HENNESSY,FR0000121014,Dividendo,,EUR,"-100,00",EUR,"60,00",',
    ];

    await ingestRaw(db, statement(paid));
    await ingestRaw(db, statement([...rebooked, ...paid]));

    expect((await loadLedger(db)).incomeFlows).toEqual([{ date: "2026-05-07", value: 12000 }]);
});

it("adds a DEGIRO export's puts once, on their underlying", async () => {
    const db = await freshDb();
    const sold =
        '06-02-2024,15:14,HEI P18.00 15MAR24,NLEN00000002,LFF,XEUE,-1,"1,5500",EUR,"155,00",EUR,"155,00","0,0000","0,00","-0,75","154,25",order-3';
    const bought =
        '08-03-2024,13:12,HEI P18.00 15MAR24,NLEN00000002,LFF,XEUE,1,"0,5000",EUR,"-50,00",EUR,"-50,00","0,0000","0,00","-0,75","-50,75",order-4';

    await ingestRaw(db, degiro([sold]));

    const result = await ingestRaw(db, degiro([bought, sold]));

    expect(result.report.rows).toMatchObject({ puts: 1, duplicates: 1 });
    expect(await db.select({ instrumentId: optionTrades.instrumentId }).from(optionTrades)).toEqual([
        { instrumentId: "heineken" },
        { instrumentId: "heineken" },
    ]);
});

it("refuses a file, an undo or a lower stock dividend that would sell more shares than are held", async () => {
    const db = await freshDb();
    const draftId = "11111111-1111-4111-8111-111111111111";
    const file = await ingestRaw(db, degiro([later]));

    await ingestRaw(db, chat(draftId, "2023-01-02"));
    await ingestRaw(db, bonus(2));
    await ingestRaw(db, degiro([later.replace(",-5,", ",-7,")]));

    const lowered = await ingestRaw(db, bonus(1));
    const undone = await ingestRaw(db, undo(draftId));

    expect([file, lowered, undone].map(({ status, report }) => [status, report.errors])).toEqual(
        Array(3).fill(["failed", [expect.stringContaining("sells more shares than are held")]]),
    );
});

it("replaces a chat trade with the broker's order for it, its fills summed, within 3 days", async () => {
    const db = await freshDb();
    const matched = "11111111-1111-4111-8111-111111111111";
    const earlier = "22222222-2222-4222-8222-222222222222";

    await ingestRaw(db, chat(matched, "2023-01-02"));
    await ingestRaw(db, chat(earlier, "2022-12-29"));

    const fills = [
        trade.replace(',5,"1300,0000",', ',3,"1300,0000",'),
        trade.replace(',5,"1300,0000",', ',2,"1310,0000",'),
    ].map((line) => line.replace("03-01-2023,10:00", "05-01-2023,10:00"));

    const result = await ingestRaw(db, degiro(fills));

    expect(result.report.rows.reconciled).toBe(1);
    expect(
        await db
            .select({
                externalKey: transactions.externalKey,
                supersededBy: transactions.supersededBy,
            })
            .from(transactions)
            .where(eq(transactions.source, "chat")),
    ).toEqual([
        { externalKey: matched, supersededBy: "degiro:order-1" },
        { externalKey: earlier, supersededBy: null },
    ]);
});

it("refuses an export that covers a chat trade's date, rows it already added included, without an order for it", async () => {
    const db = await freshDb();
    const draftId = "33333333-3333-4333-8333-333333333333";

    await ingestRaw(db, degiro([trade]));
    await ingestRaw(db, chat(draftId, "2023-01-03", 1400));

    const result = await ingestRaw(db, degiro([trade, later]));

    expect(result.status).toBe("failed");
    expect(result.report.errors).toEqual([expect.stringContaining(draftId)]);
});

it("rebuilds the ledger from production's files alone, instruments first, then oldest upload first, retrying a file that needs a later one", async () => {
    const db = await freshDb();

    await ingestRaw(db, upload([buy, sell]));

    const instrumentsFile = {
        chat: "instruments",
        draftId: "00000000-0000-4000-8000-000000000001",
        aliases: [{ kind: "isin", value: "NL0000000000", instrumentId: "philips" }],
        corporateActions: [
            { id: "philips-bonus", broker: "degiro", date: "2023-02-01", instrumentId: "philips", shares: 1 },
        ],
    };
    const files = [
        { ...degiro([trade.replace("NL0000009538", "NL0000000000")]), name: "old.csv", uploadedAt: "2026-01-05" },
        { ...degiro([later]), name: "sell.csv", uploadedAt: "2026-01-04" },
        {
            name: "instruments.json",
            bytes: new TextEncoder().encode(JSON.stringify(instrumentsFile)),
            uploadedAt: "2026-03-05",
        },
    ].map(({ name, bytes, uploadedAt }) => ({
        pathname: `production/raw/degiro_transactions/${name}`,
        bytes,
        uploadedAt: new Date(uploadedAt),
    }));

    vi.mocked(listRaw).mockResolvedValue([files[1], files[2], files[0]]);
    vi.mocked(getRaw).mockImplementation(async (pathname) => files.find((file) => file.pathname === pathname)!.bytes);

    const results = await rebuild(db);

    expect(results.map(({ name, status, report }) => [name, status, report.rows.duplicates])).toEqual([
        ["instruments.json", "applied", 0],
        ["sell.csv", "applied", 0],
        ["old.csv", "applied", 0],
    ]);
    expect(await db.$count(rawImports)).toBe(3);
    expect(await db.$count(corporateActions)).toBe(1);
});
