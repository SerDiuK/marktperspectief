import { expect, it, vi } from "vitest";
import { auth, mcpResource } from "@/lib/auth";
import { POST } from "./route";

vi.mock("@/db", async () => {
    const { migratedDb } = await import("@/db/test-db");

    return { db: await migratedDb() };
});

function call(headers?: HeadersInit, method = "tools/list", params?: object) {
    return POST(
        new Request("http://localhost:3000/api/mcp", {
            method: "POST",
            headers,
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        }),
    );
}

async function token(scope: string) {
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => auth.handler(new Request(input, init)));

    const signed = await auth.api.signJWT({
        body: {
            payload: {
                iss: "http://localhost:3000/api/auth",
                aud: mcpResource,
                sub: "owner",
                azp: "https://claude.ai/client",
                scope,
            },
        },
    });

    return signed.token;
}

it("answers a call without a token with 401 and where to find the authorization server", async () => {
    const response = await call();

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
        'resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/api/mcp"',
    );
});

it("refuses a token without the portfolio scope", async () => {
    expect((await call({ authorization: `Bearer ${await token("offline_access")}` })).status).toBe(403);
});

it("answers a listen at once instead of holding a stream open", async () => {
    const response = await call(
        {
            authorization: `Bearer ${await token("portfolio")}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "mcp-protocol-version": "2026-07-28",
            "mcp-method": "subscriptions/listen",
        },
        "subscriptions/listen",
        {
            notifications: { toolsListChanged: true },
            _meta: {
                "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                "io.modelcontextprotocol/clientCapabilities": {},
            },
        },
    );

    expect(await response.json()).toMatchObject({ error: { message: "Subscription limit reached" } });
});
