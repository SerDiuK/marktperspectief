import { Client, InMemoryTransport, type Transport } from "@modelcontextprotocol/client";
import { AppBridge } from "@modelcontextprotocol/ext-apps/app-bridge";
import { JSDOM } from "jsdom";
import { expect, it, vi } from "vitest";
import { getEffectiveTrades } from "@/db/ledger";
import { priceDaily, theses } from "@/db/schema";
import { freshDb } from "@/db/test-db";
import { draftCard, draftCardUri } from "./draft-card";
import { buildServer } from "./server";

vi.mock("@/lib/import/raw-store", () => ({ putRaw: vi.fn() }));

// The host's side of the card's iframe, wired by hand because jsdom's postMessage leaves event.source unset.
function frame() {
    const host = new JSDOM("<!doctype html><body></body>", { runScripts: "dangerously" }).window;
    const iframe = host.document.createElement("iframe");

    host.document.body.append(iframe);

    const view = iframe.contentWindow as (Window & typeof globalThis) | null;

    if (!view) throw new Error("No iframe window");

    const transport: Transport = {
        start: async () => {},
        close: async () => {},
        send: async (message) => {
            view.dispatchEvent(new view.MessageEvent("message", { data: message, source: host as unknown as Window }));
        },
    };

    host.postMessage = (message: unknown) => transport.onmessage?.(structuredClone(message) as never);

    return {
        view,
        transport,
        load(html: string) {
            iframe.contentDocument?.open();
            iframe.contentDocument?.write(html);
            iframe.contentDocument?.close();
        },
    };
}

it("keeps the confirm tools from the model and saves a trade, then a thesis, only through the card's Confirm button", async () => {
    const database = await freshDb();

    await database.insert(priceDaily).values({ instrumentId: "exor", date: "2026-10-29", close: 33.2 });

    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-host", version: "1.0.0" });

    await buildServer(database).connect(serverSide);
    await client.connect(clientSide);

    const { tools } = await client.listTools();
    const meta = Object.fromEntries(tools.map(({ name, _meta }) => [name, _meta?.ui]));

    expect(meta).toMatchObject({
        add_transaction: { resourceUri: draftCardUri },
        propose_thesis: { resourceUri: draftCardUri },
        add_instrument: { resourceUri: draftCardUri },
        confirm_transaction: { visibility: ["app"] },
        confirm_thesis: { visibility: ["app"] },
        confirm_instrument: { visibility: ["app"] },
    });

    const [resource] = (await client.readResource({ uri: draftCardUri })).contents;
    const bridge = new AppBridge(
        client,
        { name: "test-host", version: "1.0.0" },
        { serverTools: {}, updateModelContext: { text: {} } },
        { hostContext: { theme: "dark", locale: "en-GB", timeZone: "Europe/Madrid" } },
    );
    const told: unknown[] = [];
    const initialized = new Promise((resolve) => {
        bridge.oninitialized = resolve;
    });
    const { view, transport, load } = frame();

    bridge.onupdatemodelcontext = async ({ content }) => {
        told.push(...(content ?? []));

        return {};
    };

    await bridge.connect(transport);
    load("text" in resource ? resource.text : draftCard);
    await initialized;

    const preview = await client.callTool({
        name: "add_transaction",
        arguments: { instrument: "EXO", broker: "degiro", side: "buy", quantity: 10, price: 3.314, feesEur: 1 },
    });

    await bridge.sendToolResult(preview);
    await vi.waitFor(() => expect(view.document.querySelector("button.primary")).not.toBeNull());

    const card = () => view.document.getElementById("card")?.textContent;

    expect(card()).toContain("Exor");
    expect(card()).toContain((preview.structuredContent as { warnings: string[] }).warnings[0]);
    expect(await getEffectiveTrades(database)).toHaveLength(0);

    view.document.querySelector<HTMLButtonElement>("button.primary")?.click();
    await vi.waitFor(() => expect(card()).toContain("Saved."));

    expect(await getEffectiveTrades(database)).toHaveLength(1);
    expect(told).toEqual([{ type: "text", text: expect.stringContaining("pressed Confirm") }]);

    const thesis = await client.callTool({
        name: "propose_thesis",
        arguments: {
            instrument: "EXO",
            type: "bargain",
            pillars: [
                { claim: "The discount to NAV closes", wrongIf: "The buybacks stop" },
                { claim: "Ferrari keeps compounding", wrongIf: "Its margin falls below 25%" },
            ],
            reason: "Cheap against its NAV",
        },
    });

    await bridge.sendToolResult(thesis);
    await vi.waitFor(() => expect(card()).toContain("Thesis"));

    view.document.querySelector<HTMLButtonElement>("button.primary")?.click();
    await vi.waitFor(() => expect(card()).toContain("Saved."));

    expect(await database.$count(theses)).toBe(1);
});
