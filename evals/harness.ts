import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import { type CallToolResult, Client, InMemoryTransport } from "@modelcontextprotocol/client";
import type { Db } from "@/db/connect";
import { priceDaily } from "@/db/schema";
import { freshDb } from "@/db/test-db";
import { addDays, ownerDate } from "@/lib/dates";
import { addTransaction, confirmTransaction } from "@/mcp/chat";
import { buildServer } from "@/mcp/server";

export type Call = { turn: number; name: string; input: Record<string, unknown>; result: CallToolResult };

export type Run = { db: Db; calls: Call[]; replies: string[] };

export type Case = {
    name: string;
    host: "card" | "chat";
    turns: string[];
    check: (run: Run) => Promise<string[]> | string[];
};

const anthropic = new Anthropic();

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

const text = (result: CallToolResult) =>
    result.content.map((block) => (block.type === "text" ? block.text : JSON.stringify(block))).join("\n");

export async function run({ host, turns }: Case): Promise<Run> {
    const db = await portfolio();
    const server = buildServer(db, { modelConfirms: host === "chat", now });
    const client = new Client({ name: `eval-${host}`, version: "1.0.0" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();

    await server.connect(serverSide);
    await client.connect(clientSide);

    const listed = (await client.listTools()).tools.filter(({ name, _meta }) => {
        const visibility = (_meta?.ui as { visibility?: string[] } | undefined)?.visibility ?? ["model", "app"];

        return !offline.has(name) && visibility.includes("model");
    });
    const tools: Tool[] = listed.map(({ name, description, inputSchema }, index) => ({
        name,
        description,
        input_schema: inputSchema as Tool.InputSchema,
        ...(index === listed.length - 1 && { cache_control: { type: "ephemeral" as const } }),
    }));
    const system = [
        `You are Claude. The user has connected Marktperspectief, their portfolio app, as a connector. Today is ${today}.`,
        client.getInstructions() ?? "",
    ].join("\n\n");
    const messages: MessageParam[] = [];
    const calls: Call[] = [];
    const replies: string[] = [];

    for (const [turn, message] of turns.entries()) {
        const said: string[] = [];

        messages.push({ role: "user", content: message });

        for (let step = 0; step < 8; step++) {
            const response = await anthropic.messages.create({ model, max_tokens: 2048, system, tools, messages });
            const uses = response.content.filter((block) => block.type === "tool_use");

            messages.push({ role: "assistant", content: response.content });
            said.push(...response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])));

            if (uses.length === 0) break;

            const results = [];

            for (const use of uses) {
                const input = use.input as Record<string, unknown>;
                const result = (await client.callTool({ name: use.name, arguments: input })) as CallToolResult;

                calls.push({ turn, name: use.name, input, result });
                results.push({
                    type: "tool_result" as const,
                    tool_use_id: use.id,
                    content: text(result),
                    is_error: result.isError ?? false,
                });
            }

            messages.push({ role: "user", content: results });
        }

        replies.push(said.join("\n"));
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
