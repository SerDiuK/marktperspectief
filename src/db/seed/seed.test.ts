import { expect, it } from "vitest";
import { instruments } from "../schema";
import { migratedDb } from "../test-db";
import { seed } from ".";
import { instrumentSeed } from "./instruments";

it("migrates, then seeding twice keeps one row per seed entry", async () => {
    const db = await migratedDb();

    await seed(db);
    await seed(db);
    expect(await db.$count(instruments)).toBe(instrumentSeed.length);
});
