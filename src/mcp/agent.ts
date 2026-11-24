import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool, ToolResultBlockParam, ToolUnion } from "@anthropic-ai/sdk/resources/messages";
import { type CallToolResult, Client, InMemoryTransport, type Tool as McpTool } from "@modelcontextprotocol/client";
import type { McpServer } from "@modelcontextprotocol/server";
import type { Db } from "@/db/connect";
import { addDays, ownerDate } from "@/lib/dates";
import { isDemo } from "@/lib/demo/marker";
import { type Holding, loadHolding } from "@/lib/portfolio/holding";
import { buildServer } from "./server";

export type Step =
    | { type: "text"; text: string }
    | { type: "source"; url: string; title: string }
    | { type: "status"; tool: string | null }
    | { type: "tool"; name: string; input: Record<string, unknown>; result: CallToolResult };

type Call = (name: string, input: Record<string, unknown>) => Promise<CallToolResult>;

const text = (result: CallToolResult) =>
    result.content.map((block) => (block.type === "text" ? block.text : JSON.stringify(block))).join("\n");

export async function connect(server: McpServer, keep: (tool: McpTool) => boolean) {
    const client = new Client({ name: "marktperspectief", version: "1.0.0" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();

    await server.connect(serverSide);
    await client.connect(clientSide);

    const tools: Tool[] = (await client.listTools()).tools.filter(keep).map(({ name, description, inputSchema }) => ({
        name,
        description,
        input_schema: inputSchema as Tool.InputSchema,
    }));
    const listed = new Set(tools.map(({ name }) => name));
    const call: Call = async (name, input) =>
        listed.has(name)
            ? ((await client.callTool({ name, arguments: input })) as CallToolResult)
            : { content: [{ type: "text", text: `There is no tool named ${name}` }], isError: true };

    return { client, tools, call };
}

/** Appends every model turn and tool result to `messages`, so a caller can continue the conversation. */
export async function* converse({
    model,
    system,
    tools,
    call,
    messages,
}: {
    model: string;
    system: string;
    tools: ToolUnion[];
    call: Call;
    messages: MessageParam[];
}): AsyncGenerator<Step> {
    const anthropic = new Anthropic();
    let wrote = false;
    let last: string | undefined;

    for (let step = 0; step < 8; step++) {
        const stream = anthropic.messages.stream({
            model,
            max_tokens: 16000,
            system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
            tools,
            messages,
        });

        for await (const event of stream) {
            if (event.type === "content_block_start") {
                const block = event.content_block;

                if (block.type !== "text") {
                    yield {
                        type: "status",
                        tool: block.type === "tool_use" || block.type === "server_tool_use" ? block.name : null,
                    };
                } else if (wrote && last !== "text") {
                    yield { type: "text", text: "\n\n" };
                }

                last = block.type;
            } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                wrote = true;
                yield { type: "text", text: event.delta.text };
            } else if (
                event.type === "content_block_delta" &&
                event.delta.type === "citations_delta" &&
                event.delta.citation.type === "web_search_result_location"
            ) {
                const { url, title } = event.delta.citation;

                yield { type: "source", url, title: title ?? url };
            }
        }

        const message = await stream.finalMessage();

        messages.push({ role: "assistant", content: message.content });

        if (message.stop_reason === "refusal") throw new Error("Claude declined to answer");
        if (message.stop_reason === "pause_turn") continue;
        if (message.stop_reason !== "tool_use") return;

        const results: ToolResultBlockParam[] = [];

        for (const block of message.content) {
            if (block.type !== "tool_use") continue;

            const input = block.input as Record<string, unknown>;
            const result = await call(block.name, input);

            yield { type: "tool", name: block.name, input, result };
            results.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: text(result),
                is_error: result.isError,
            });
        }

        messages.push({ role: "user", content: results });
    }
}

function prompt(holding: Holding, today: string) {
    const yearAgo = addDays(today, -365);

    return [
        `You are Lens, the analyst inside Marktperspectief, the owner's portfolio app, built on Claude. Today is ${today}. The owner has opened the panel of one holding, ${holding.name}, and asks you about it, so "it" means ${holding.name}.`,
        "Its data follows as JSON, with the last year of closes. Closes and prices are in the listing's currency, other amounts in EUR at ECB rates, and entries come newest first. portfolio_summary gives the whole portfolio.",
        "web_search is for news and recent events about the company, never for the holding's own figures, which are here. Give each news item its date.",
        "Nothing can be recorded here: no trades, no theses. Answer in a few short paragraphs of plain text, without Markdown.",
        JSON.stringify({ ...holding, closes: holding.closes.filter(({ date }) => date >= yearAgo) }),
    ].join("\n\n");
}

export async function ask(
    db: Db,
    { instrumentId, messages }: { instrumentId: string; messages: MessageParam[] },
    now: Date,
    chosen?: string,
) {
    const holding = await loadHolding(db, instrumentId);

    if (!holding) return null;

    const model = chosen ?? ((await isDemo(db)) ? "claude-haiku-5-5" : "claude-opus-5-5");
    const { client, tools, call } = await connect(
        buildServer(db, { now: () => now }),
        ({ name }) => name === "portfolio_summary",
    );
    const system = prompt(holding, ownerDate(now));

    return (async function* () {
        try {
            yield* converse({
                model,
                system,
                tools: [...tools, { type: "web_search_20250305", name: "web_search", max_uses: 3 }],
                call,
                messages: [...messages],
            });
        } finally {
            await client.close();
        }
    })();
}
