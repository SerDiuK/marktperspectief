import type { Db } from "../connect";
import { instruments } from "../schema";
import { instrumentSeed } from "./instruments";

// Upserts the seed and never deletes, so price rows keep their instrument.
export async function seed(db: Db) {
    const [first, ...rest] = instrumentSeed.map((row) =>
        db.insert(instruments).values(row).onConflictDoUpdate({ target: instruments.id, set: row }),
    );

    await db.batch([first, ...rest]);

    return { instruments: instrumentSeed.length };
}
