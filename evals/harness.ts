import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { CallToolResult } from "@modelcontextprotocol/client";
import type { Db } from "@/db/connect";
import { priceDaily } from "@/db/schema";
import { freshDb } from "@/db/test-db";
import { addDays, ownerDate } from "@/lib/dates";
import { ask, connect, converse, type Step } from "@/mcp/agent";
import { addTransaction, confirmTransaction } from "@/mcp/chat";
import { buildServer } from "@/mcp/server";

export type Call = { turn: number; name: string; input: Record<string, unknown>; result: CallToolResult };

export type Run = { db: Db; calls: Call[]; replies: string[] };

export type Case = {
    name: string;
    host: "card" | "chat" | "panel";
    turns: string[];
    check: (run: Run) => Promise<string[]> | string[];
};

export const model = process.env.EVAL_MODEL ?? "claude-sonnet-5-5";

const offline = new Set(["refresh_prices"]);

function lastTuesdayToFriday(date: string) {
    let day = date;

    while (![2, 3, 4, 5].includes(new Date(`${day}T00:00:00Z`).getUTCDay())) day = addDays(day, -1);

    return day;
}

const today = lastTuesdayToFriday(ownerDate(new Date()));
const now = () => new Date(`${today}T12:00:00Z`);

const seeds = [
    { instrument: "EXO", broker: "degiro", quantity: 40, price: 31.5, tradeDate: addDays(today, -28) },
    { instrument: "HEIA", broker: "saxo", quantity: 25, price: 80, tradeDate: addDays(today, -56) },
] as const;

export const seededTrades = seeds.length;

async function portfolio() {
    const db = await freshDb();

    await db.insert(priceDaily).values([
        { instrumentId: "heineken", date: addDays(today, -56), close: 80 },
        { instrumentId: "exor", date: addDays(today, -28), close: 31.5 },
        { instrumentId: "exor", date: addDays(today, -1), close: 33.2 },
        { instrumentId: "heineken", date: addDays(today, -1), close: 78.4 },
    ]);

    for (const trade of seeds) {
        const preview = await addTransaction(db, { ...trade, side: "buy", feesEur: 2 }, now());

        if (!("draftId" in preview)) throw new Error(`No draft for ${trade.instrument}`);

        const { status } = await confirmTransaction(db, preview.draftId, now());

        if (status !== "applied") throw new Error(`Seeding ${trade.instrument} was ${status}`);
    }

    return db;
}

async function collect(steps: AsyncIterable<Step>, turn: number, calls: Call[]) {
    let reply = "";

    for await (const step of steps) {
        if (step.type === "text") reply += step.text;
        else if (step.type === "tool") calls.push({ turn, name: step.name, input: step.input, result: step.result });
    }

    return reply;
}

export async function run({ host, turns }: Case): Promise<Run> {
    const db = await portfolio();
    const calls: Call[] = [];
    const replies: string[] = [];

    if (host === "panel") {
        const messages: MessageParam[] = [];

        for (const [turn, message] of turns.entries()) {
            messages.push({ role: "user", content: message });

            const steps = await ask(db, { instrumentId: "exor", messages }, now(), model);

            if (!steps) throw new Error("No Exor holding");

            const reply = await collect(steps, turn, calls);

            replies.push(reply);
            messages.push({ role: "assistant", content: reply });
        }

        return { db, calls, replies };
    }

    const { client, tools, call } = await connect(
        buildServer(db, { modelConfirms: host === "chat", now }),
        ({ name, _meta }) => {
            const visibility = (_meta?.ui as { visibility?: string[] } | undefined)?.visibility ?? ["model", "app"];

            return !offline.has(name) && visibility.includes("model");
        },
    );
    const system = [
        `You are Claude. The user has connected Marktperspectief, their portfolio app, as a connector. Today is ${today}.`,
        client.getInstructions() ?? "",
    ].join("\n\n");
    const messages: MessageParam[] = [];

    for (const [turn, message] of turns.entries()) {
        messages.push({ role: "user", content: message });
        replies.push(await collect(converse({ model, system, tools, call, messages }), turn, calls));
    }

    await client.close();

    return { db, calls, replies };
}

export const draftOf = (call: Call | undefined) =>
    (call?.result.structuredContent as { draftId?: string } | undefined)?.draftId;

export function confirmedOnlyAfterAnswer({ calls }: Run) {
    return calls
        .filter(({ name }) => name.startsWith("confirm_"))
        .filter(({ turn, input }) => {
            const preview = calls.find((call) => !call.name.startsWith("confirm_") && draftOf(call) === input.draftId);

            return !preview || preview.turn >= turn;
        })
        .map(({ name, turn }) => `${name} in turn ${turn + 1} confirmed a draft the user hadn't answered`);
}
