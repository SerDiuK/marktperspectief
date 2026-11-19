import type { ImportReport } from "@/db/schema";
import { formatDate } from "@/lib/format";
import type { RawKind } from "@/lib/import/types";

export const kindLabels: Record<RawKind, string> = {
    binck_ledger: "Binck account statements",
    saxo_transactions: "Saxo transactions",
    degiro_transactions: "DEGIRO transactions",
    degiro_account: "DEGIRO account statement",
    chat: "Chat",
};

const units = {
    trades: ["trade", "trades"],
    transfers: ["transfer", "transfers"],
    puts: ["put trade", "put trades"],
    dividends: ["dividend", "dividends"],
    lending: ["lending payment", "lending payments"],
    fees: ["other cost", "other costs"],
    theses: ["thesis", "theses"],
    instruments: ["instrument", "instruments"],
    voided: ["undone chat trade", "undone chat trades"],
    reconciled: ["chat trade replaced", "chat trades replaced"],
    duplicates: ["already imported", "already imported"],
} as const;

export function describeRows(rows: ImportReport["rows"]) {
    const keys = Object.keys(units) as (keyof typeof units)[];
    const parts = keys
        .filter((key) => rows[key] > 0)
        .map((key) => `${rows[key]} ${units[key][rows[key] === 1 ? 0 : 1]}`);

    return parts.join(" · ") || "No rows";
}

export function describeCoverage(from: string | null, to: string | null) {
    if (!from || !to) return null;

    return from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`;
}
