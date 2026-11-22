import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db, Tx } from "./connect";
import { optionTrades, transactions } from "./schema";

export function getEffectiveTrades(db: Db | Tx) {
    return db
        .select()
        .from(transactions)
        .where(and(isNull(transactions.voidedAt), isNull(transactions.supersededBy)))
        .orderBy(asc(transactions.tradeDate), asc(transactions.tradeTime), asc(transactions.id));
}

export function getPendingChatTrades(db: Db | Tx) {
    return db
        .select()
        .from(transactions)
        .where(and(eq(transactions.source, "chat"), isNull(transactions.voidedAt), isNull(transactions.supersededBy)));
}

export function getOptionTrades(db: Db) {
    return db.select().from(optionTrades).orderBy(asc(optionTrades.tradeDate), asc(optionTrades.id));
}
