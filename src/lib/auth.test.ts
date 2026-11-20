import { createHash, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/mcp/route";
import { passkey, user } from "@/db/auth-schema";
import { instrumentsFile } from "@/lib/demo/marker";
import { ingestRaw } from "@/lib/import/ingest";
import { auth, isSignedIn, mcpResource } from "./auth";

const db = await vi.hoisted(async () => {
    const { migratedDb } = await import("@/db/test-db");

    return migratedDb();
});

const claude = {
    client_id: "https://claude.ai/oauth/mcp-oauth-client-metadata",
    client_name: "Claude",
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    token_endpoint_auth_method: "none",
};

vi.mock("@/db", () => ({ db }));
vi.mock("@/lib/import/raw-store", () => ({ putRaw: vi.fn() }));
vi.mock("@better-auth/cimd/node", () => ({ fetchClientMetadataResource: async () => Response.json(claude) }));

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe("isSignedIn", () => {
    it.each([
        ["production", "localhost:3000"],
        ["development", "rebound.example:3000"],
    ])("needs a session under NODE_ENV %s for host %s", async (env, host) => {
        vi.stubEnv("NODE_ENV", env);

        expect(await isSignedIn(new Headers({ host }))).toBe(false);
    });
});

it("opens passkey setup only with the token, and only while the owner has no passkey", async () => {
    vi.stubEnv("AUTH_SETUP_TOKEN", "setup-token");

    const registerOptions = (context: string) =>
        auth.api.generatePasskeyRegistrationOptions({ query: { context }, headers: new Headers() });

    await expect(registerOptions("wrong-token")).rejects.toThrow("Invalid setup token");

    await registerOptions("setup-token");

    const [owner] = await db.select().from(user);

    await db.insert(passkey).values({
        id: "passkey-1",
        publicKey: "key",
        userId: owner.id,
        credentialID: "credential-1",
        counter: 0,
        deviceType: "multiDevice",
        backedUp: true,
    });

    await expect(registerOptions("setup-token")).rejects.toThrow("The owner already has a passkey");
});

it("signs a visitor in to the demo only under DEMO_MODE and on the demo's database", async () => {
    const demoSignIn = () => auth.api.demoSignIn({ headers: new Headers() });

    vi.stubEnv("DEMO_MODE", "1");
    await expect(demoSignIn()).rejects.toThrow("This is not the demo");

    await ingestRaw(db, instrumentsFile);

    expect(await demoSignIn()).toEqual({ ok: true });

    vi.stubEnv("DEMO_MODE", "");
    await expect(demoSignIn()).rejects.toThrow("This is not the demo");
});

it("lets a demo visitor connect Claude: the one-click sign-in carries Claude's request on to consent and a token", async () => {
    const base = "http://localhost:3000";
    const call = (path: string, init?: RequestInit) => auth.handler(new Request(new URL(path, base), init));
    const post = (path: string, body: object, cookie = "") =>
        call(path, {
            method: "POST",
            headers: { "content-type": "application/json", origin: base, cookie },
            body: JSON.stringify(body),
        });
    const verifier = randomBytes(32).toString("base64url");
    const authorize = new URLSearchParams({
        response_type: "code",
        client_id: claude.client_id,
        redirect_uri: claude.redirect_uris[0],
        scope: "portfolio offline_access",
        state: "state",
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256",
        resource: mcpResource,
    });

    vi.stubEnv("DEMO_MODE", "1");
    await ingestRaw(db, instrumentsFile);

    const login = new URL((await call(`/api/auth/oauth2/authorize?${authorize}`)).headers.get("location") ?? "", base);
    const signIn = await post("/api/auth/demo/sign-in", { oauth_query: login.search.slice(1) });
    const consentPage = new URL((await signIn.json()).url, base);
    const cookie = signIn.headers.get("set-cookie")?.split(";")[0];
    const consent = await post(
        "/api/auth/oauth2/consent",
        { accept: true, oauth_query: consentPage.search.slice(1) },
        cookie,
    );
    const callback = new URL((await consent.json()).url);
    const token = await call("/api/auth/oauth2/token", {
        method: "POST",
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code: callback.searchParams.get("code") ?? "",
            redirect_uri: claude.redirect_uris[0],
            client_id: claude.client_id,
            code_verifier: verifier,
            resource: mcpResource,
        }),
    });
    const { access_token } = await token.json();

    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => auth.handler(new Request(input, init)));

    const tools = await POST(
        new Request(mcpResource, {
            method: "POST",
            headers: {
                authorization: `Bearer ${access_token}`,
                "content-type": "application/json",
                accept: "application/json, text/event-stream",
            },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
        }),
    );

    expect([login.pathname, consentPage.pathname, callback.origin + callback.pathname]).toEqual([
        "/login",
        "/consent",
        claude.redirect_uris[0],
    ]);
    expect(tools.status).toBe(200);
});
