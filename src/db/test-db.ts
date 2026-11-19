import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/libsql/migrator";
import { connect, type Db } from "./connect";
import { instrumentAliases, instruments, rawImports } from "./schema";
import { seed } from "./seed";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function migratedDb() {
    const db = connect({ url: ":memory:" });

    await migrate(db, { migrationsFolder });

    return db;
}

const testInstruments: (typeof instruments.$inferInsert)[] = [
    { id: "ackermans", isin: "BE0003764785", name: "Ackermans & van Haaren", currency: "EUR", yahooSymbol: "ACKB.BR" },
    { id: "arcelormittal", isin: "LU1598757687", name: "ArcelorMittal", currency: "EUR", yahooSymbol: "MT.AS" },
    { id: "bayer", isin: "DE000BAY0017", name: "Bayer", currency: "EUR", yahooSymbol: "BAYN.DE" },
    { id: "exor", isin: "NL0012059018", name: "Exor", currency: "EUR", yahooSymbol: "EXO.AS" },
    { id: "heineken", isin: "NL0000009165", name: "Heineken", currency: "EUR", yahooSymbol: "HEIA.AS" },
    { id: "kbc", isin: "BE0003565737", name: "KBC", currency: "EUR", yahooSymbol: "KBC.BR" },
    { id: "lvmh", isin: "FR0000121014", name: "LVMH", currency: "EUR", yahooSymbol: "MC.PA" },
    { id: "microsoft", isin: "US5949181045", name: "Microsoft", currency: "USD", yahooSymbol: "MSFT" },
    { id: "nestle", isin: "CH0038863350", name: "Nestlé", currency: "CHF", yahooSymbol: "NESN.SW" },
    { id: "philips", isin: "NL0000009538", name: "Philips", currency: "EUR", yahooSymbol: "PHIA.AS" },
    { id: "telenet", isin: "BE0003826436", name: "Telenet", currency: "EUR", yahooSymbol: null },
];

// The seed's benchmarks plus the securities the tests trade.
export async function freshDb() {
    const db = await migratedDb();

    await seed(db);
    await db.insert(instruments).values(testInstruments);
    await db.insert(instrumentAliases).values({ kind: "option_code", value: "HEI", instrumentId: "heineken" });

    return db;
}

export async function insertRawImport(db: Db) {
    const [{ id }] = await db
        .insert(rawImports)
        .values({
            kind: "binck_ledger",
            sha256: "0".repeat(64),
            originalName: "test.csv",
            uploadedAt: "2026-10-26T00:00:00.000Z",
            updatedAt: "2026-10-26T00:00:00.000Z",
            parserVersion: 1,
            status: "applied",
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
                errors: [],
            },
        })
        .returning({ id: rawImports.id });

    return id;
}
