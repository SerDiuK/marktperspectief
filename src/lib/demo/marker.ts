import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/connect";
import { rawImports } from "@/db/schema";
import type { ChatEntry } from "@/lib/schemas";
import { demoInstruments, putCode } from "./plan";

// Fixed ids, so a file's hash, and so its raw_imports row, only changes with its content.
export const draftId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export function json(entry: ChatEntry) {
    return new TextEncoder().encode(`${JSON.stringify(entry, null, 4)}\n`);
}

export const instrumentsFile = {
    name: "instruments.json",
    bytes: json({
        chat: "instruments",
        draftId: draftId(1),
        instruments: demoInstruments.map(({ id, isin, name, currency, yahooSymbol }) => ({
            id,
            isin,
            name,
            currency,
            yahooSymbol,
        })),
        aliases: [{ kind: "option_code", value: putCode, instrumentId: "heineken" }],
        corporateActions: [],
    }),
};

const marker = createHash("sha256").update(instrumentsFile.bytes).digest("hex");

async function isDemoDatabase(db: Db) {
    return (await db.$count(rawImports, eq(rawImports.sha256, marker))) > 0;
}

export async function isDemo(db: Db) {
    return process.env.DEMO_MODE === "1" && isDemoDatabase(db);
}

export async function canLoadDemo(db: Db) {
    return (await db.$count(rawImports)) === 0 || isDemoDatabase(db);
}
