import { expect, it, vi } from "vitest";
import { db } from "@/db";
import { draftId, instrumentsFile, json } from "@/lib/demo/marker";
import { ingestRaw } from "@/lib/import/ingest";
import { uploadImports } from "./actions";

vi.mock("@/db", async () => {
    const { freshDb } = await import("@/db/test-db");

    return { db: await freshDb() };
});
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/auth", () => ({ isSignedIn: async () => true }));
vi.mock("@/lib/import/raw-store", () => ({ putRaw: vi.fn() }));
vi.mock("@/lib/portfolio/refresh", () => ({ refreshDerived: vi.fn() }));

const upload = (n: number, isin: string) => {
    const form = new FormData();
    const entry = json({
        chat: "instruments",
        draftId: draftId(500 + n),
        instruments: [{ id: `x${n}`, isin, name: "X", currency: "USD", yahooSymbol: null }],
        aliases: [],
        corporateActions: [],
    });

    form.append("files", new File([entry], `x${n}.json`));

    return uploadImports([], form);
};

it("refuses every upload on the public demo, and only there", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    expect((await upload(1, "US0378331005")).map(({ status }) => status)).toEqual(["applied"]);

    await ingestRaw(db, instrumentsFile);

    expect((await upload(2, "US88160R1014")).map(({ status }) => status)).toEqual(["rejected"]);
});
