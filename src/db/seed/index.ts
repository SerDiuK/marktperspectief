import type { Db } from "../connect";
import { instruments } from "../schema";
import { instrumentSeed } from "./instruments";

export async function seed(db: Db) {
    const [first, ...rest] = instrumentSeed.map((row) =>
        db.insert(instruments).values(row).onConflictDoUpdate({ target: instruments.id, set: row }),
    );

    await db.batch([first, ...rest]);

    return { instruments: instrumentSeed.length };
}
