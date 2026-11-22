import { eq } from "drizzle-orm";
import type { Db, Tx } from "@/db/connect";
import { instrumentAliases, instruments } from "@/db/schema";

// Maps current and old ISINs to instrument ids.
export async function isinIndex(db: Db | Tx) {
    const [current, old] = await Promise.all([
        db.select({ isin: instruments.isin, id: instruments.id }).from(instruments),
        db
            .select({
                isin: instrumentAliases.value,
                id: instrumentAliases.instrumentId,
            })
            .from(instrumentAliases)
            .where(eq(instrumentAliases.kind, "isin")),
    ]);

    return new Map([...old, ...current].map(({ isin, id }) => [isin, id]));
}

export async function optionCodeIndex(db: Db | Tx) {
    const rows = await db
        .select({
            code: instrumentAliases.value,
            id: instrumentAliases.instrumentId,
        })
        .from(instrumentAliases)
        .where(eq(instrumentAliases.kind, "option_code"));

    return new Map(rows.map(({ code, id }) => [code, id]));
}
