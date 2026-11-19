import { afterEach, expect, it, vi } from "vitest";
import { db } from "@/db";
import { insertRawImport } from "@/db/test-db";
import { GET } from "./route";

vi.mock("@/db", async () => {
    const { migratedDb } = await import("@/db/test-db");

    return { db: await migratedDb() };
});
vi.mock("@/lib/demo/load", () => ({ loadDemo: vi.fn() }));
vi.mock("@/lib/market/sync", () => ({ syncMarketData: vi.fn(async () => ({})) }));
vi.mock("@/lib/portfolio/refresh", () => ({
    refreshDerived: vi.fn(async () => ({})),
}));

afterEach(() => {
    vi.unstubAllEnvs();
});

const status = async (authorization: string) =>
    (
        await GET(
            new Request("https://marktperspectief.vercel.app/api/cron/daily", {
                headers: { authorization },
            }),
        )
    ).status;

it("runs only with the cron secret, and never while the secret is unset", async () => {
    vi.stubEnv("CRON_SECRET", undefined);
    expect(await status("Bearer undefined")).toBe(401);

    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(await status("Bearer wrong!")).toBe(401);
    expect(await status("Bearer s3cret")).toBe(200);
});

it("never loads the demo over a database that holds anything else", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.stubEnv("DEMO_MODE", "1");
    await insertRawImport(db);

    expect(await status("Bearer s3cret")).toBe(409);
});
