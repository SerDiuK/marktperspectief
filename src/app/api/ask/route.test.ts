import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { db } from "@/db";
import { instrumentsFile } from "@/lib/demo/marker";
import { ingestRaw } from "@/lib/import/ingest";
import { addTransaction, confirmTransaction } from "@/mcp/chat";
import { POST } from "./route";

type Request = { model: string; tools: { name: string }[]; messages: { content: unknown }[] };

const { signedIn, requests, script } = vi.hoisted(() => ({
    signedIn: vi.fn(),
    requests: [] as Request[],
    script: [
        {
            content: [
                {
                    type: "tool_use",
                    id: "toolu_1",
                    name: "add_transaction",
                    input: { instrument: "EXO", broker: "degiro", side: "buy", quantity: 1, price: 31.5, feesEur: 0 },
                },
            ],
            stop_reason: "tool_use",
        },
        {
            content: [{ type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "Exor" } }],
            stop_reason: "pause_turn",
        },
        {
            content: [
                { type: "text", text: "At DEGIRO" },
                {
                    type: "text",
                    text: ", after Exor's buyback.",
                    citations: [
                        {
                            type: "web_search_result_location",
                            url: "https://example.com/exor",
                            title: "Exor buyback",
                            cited_text: "Exor buys back shares",
                            encrypted_index: "index",
                        },
                    ],
                },
            ],
            stop_reason: "end_turn",
        },
    ] as const,
}));

vi.mock("@/db", async () => {
    const { freshDb } = await import("@/db/test-db");

    return { db: await freshDb() };
});
vi.mock("@/lib/auth", () => ({ isSignedIn: signedIn }));
vi.mock("@/lib/import/raw-store", () => ({ putRaw: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
    default: class {
        messages = {
            stream(params: Request) {
                const message = script[requests.length % script.length];

                requests.push({ ...params, messages: [...params.messages] });

                return Object.assign(
                    (async function* () {
                        for (const block of message.content) {
                            if (block.type !== "text") {
                                yield { type: "content_block_start", index: 0, content_block: block };
                                continue;
                            }

                            yield { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } };
                            yield {
                                type: "content_block_delta",
                                index: 0,
                                delta: { type: "text_delta", text: block.text },
                            };

                            for (const citation of "citations" in block ? block.citations : []) {
                                yield {
                                    type: "content_block_delta",
                                    index: 0,
                                    delta: { type: "citations_delta", citation },
                                };
                            }
                        }
                    })(),
                    { finalMessage: async () => message },
                );
            },
        };
    },
}));

afterEach(() => {
    vi.unstubAllEnvs();
});

beforeAll(async () => {
    const now = new Date("2026-11-20T12:00:00Z");
    const preview = await addTransaction(
        db,
        {
            instrument: "EXO",
            broker: "degiro",
            side: "buy",
            quantity: 40,
            price: 31.5,
            feesEur: 2,
            tradeDate: "2026-10-23",
        },
        now,
    );

    if (!("draftId" in preview)) throw new Error("No draft for Exor");

    await confirmTransaction(db, preview.draftId, now);
});

const ask = () =>
    POST(
        new Request("http://localhost:3000/api/ask", {
            method: "POST",
            body: JSON.stringify({
                instrumentId: "exor",
                messages: [{ role: "user", content: "Where did I buy it?" }],
            }),
        }),
    );

it("answers only a signed-in owner", async () => {
    signedIn.mockResolvedValue(false);

    expect((await ask()).status).toBe(401);
});

it("streams what Claude is doing and its answer with sources, reading the portfolio and the web but writing nothing", async () => {
    signedIn.mockResolvedValue(true);

    const steps = (await (await ask()).text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));

    expect(steps).toEqual([
        { type: "status", tool: "add_transaction" },
        { type: "status", tool: "web_search" },
        { type: "text", text: "At DEGIRO" },
        { type: "text", text: ", after Exor's buyback." },
        { type: "source", url: "https://example.com/exor", title: "Exor buyback" },
    ]);
    expect(requests[0].tools.map(({ name }) => name)).toEqual(["portfolio_summary", "web_search"]);
    expect(requests[1].messages.at(-1)?.content).toMatchObject([{ type: "tool_result", is_error: true }]);
});

it("asks Haiku on the demo, where visitors spend the key", async () => {
    signedIn.mockResolvedValue(true);
    vi.stubEnv("DEMO_MODE", "1");
    await ingestRaw(db, instrumentsFile);
    await (await ask()).text();

    expect(requests.at(-1)?.model).toBe("claude-haiku-5-5");
});
