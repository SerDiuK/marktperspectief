import { expect, it, vi } from "vitest";
import { auth, mcpResource } from "@/lib/auth";
import { POST } from "./route";

vi.mock("@/db", async () => {
    const { migratedDb } = await import("@/db/test-db");

    return { db: await migratedDb() };
});

function call(headers?: HeadersInit) {
    return POST(
        new Request("http://localhost:3000/api/mcp", {
            method: "POST",
            headers,
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "tools/list",
            }),
        }),
    );
}

it("answers a call without a token with 401 and where to find the authorization server", async () => {
    const response = await call();

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
        'resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/api/mcp"',
    );
});

it("refuses a token without the portfolio scope", async () => {
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => auth.handler(new Request(input, init)));

    const { token } = await auth.api.signJWT({
        body: {
            payload: {
                iss: "http://localhost:3000/api/auth",
                aud: mcpResource,
                sub: "owner",
                azp: "https://claude.ai/client",
                scope: "offline_access",
            },
        },
    });

    expect((await call({ authorization: `Bearer ${token}` })).status).toBe(403);
});
