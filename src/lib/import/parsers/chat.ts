import { chatEntry } from "@/lib/schemas";
import { emptyParse, type ParseResult } from "../types";

export function parseChat(text: string): ParseResult | null {
    let json: unknown;

    try {
        json = JSON.parse(text);
    } catch {
        return null;
    }

    const parsed = chatEntry.safeParse(json);

    if (!parsed.success) return null;

    const entry = parsed.data;
    const result = emptyParse();

    if (entry.chat === "void") return { ...result, voids: [entry.draftId] };

    if (entry.chat === "instruments") {
        const { instruments, aliases, corporateActions } = entry;

        return { ...result, instruments, aliases, corporateActions };
    }

    if (entry.chat === "thesis") return { ...result, theses: [{ externalKey: entry.draftId, ...entry.thesis }] };

    return {
        ...result,
        trades: [{ source: "chat", externalKey: entry.draftId, ...entry.trade }],
    };
}
