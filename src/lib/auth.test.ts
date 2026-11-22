import { afterEach, describe, expect, it, vi } from "vitest";
import { passkey, session, user } from "@/db/auth-schema";
import { instrumentsFile } from "@/lib/demo/marker";
import { ingestRaw } from "@/lib/import/ingest";
import { auth, isSignedIn } from "./auth";

const db = await vi.hoisted(async () => {
    const { migratedDb } = await import("@/db/test-db");

    return migratedDb();
});

vi.mock("@/db", () => ({ db }));
vi.mock("@/lib/import/raw-store", () => ({ putRaw: vi.fn() }));

afterEach(() => {
    vi.unstubAllEnvs();
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

it("keeps demo visitors out of the shared account: no session list, and no IP stored", async () => {
    const base = "http://localhost:3000";

    vi.stubEnv("DEMO_MODE", "1");
    await ingestRaw(db, instrumentsFile);

    const signIn = await auth.handler(
        new Request(`${base}/api/auth/demo/sign-in`, {
            method: "POST",
            headers: { "content-type": "application/json", origin: base, "x-forwarded-for": "203.0.113.7" },
            body: "{}",
        }),
    );
    const cookie = signIn.headers.get("set-cookie")?.split(";")[0] ?? "";
    const sessions = await auth.handler(new Request(`${base}/api/auth/list-sessions`, { headers: { cookie } }));

    expect(sessions.status).toBe(403);
    expect(await db.select({ ip: session.ipAddress }).from(session)).not.toContainEqual({ ip: "203.0.113.7" });
});
