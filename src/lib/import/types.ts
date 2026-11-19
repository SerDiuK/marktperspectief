import type {
    corporateActions,
    fees,
    ImportReport,
    income,
    instrumentAliases,
    instruments,
    optionTrades,
    rawImports,
    theses,
    transactions,
} from "@/db/schema";

export type RawKind = (typeof rawImports.$inferSelect)["kind"];

type Row<T> = Omit<T, "id" | "rawImportId" | "instrumentId">;

export type ParseResult = {
    trades: (Row<typeof transactions.$inferInsert> & { isin: string })[];
    puts: (Row<typeof optionTrades.$inferInsert> & { optionCode: string })[];
    income: (Row<typeof income.$inferInsert> & { isin: string | null })[];
    fees: Row<typeof fees.$inferInsert>[];
    theses: (Row<typeof theses.$inferInsert> & { isin: string })[];
    instruments: (typeof instruments.$inferInsert)[];
    aliases: (typeof instrumentAliases.$inferInsert)[];
    corporateActions: (typeof corporateActions.$inferInsert)[];
    voids: string[];
    errors: string[];
};

export function emptyParse(): ParseResult {
    return {
        trades: [],
        puts: [],
        income: [],
        fees: [],
        theses: [],
        instruments: [],
        aliases: [],
        corporateActions: [],
        voids: [],
        errors: [],
    };
}

export type IngestResult = {
    name: string;
    status: "applied" | "failed" | "duplicate" | "rejected";
    kind: RawKind | null;
    coverageFrom: string | null;
    coverageTo: string | null;
    report: ImportReport;
};
