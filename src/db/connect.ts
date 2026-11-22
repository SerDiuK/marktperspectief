import { drizzle } from "drizzle-orm/libsql";

export type Db = ReturnType<typeof connect>;

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const localConnection = { url: "file:.data/dev.db" };

export function tursoConnection() {
    const url = process.env.TURSO_DATABASE_URL;

    if (!url) throw new Error("TURSO_DATABASE_URL is not set");

    return { url, authToken: process.env.TURSO_AUTH_TOKEN };
}

const deployed = process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";

export const defaultConnection = deployed ? tursoConnection() : localConnection;

export function connect(connection: { url: string; authToken?: string }) {
    return drizzle({ connection, casing: "snake_case" });
}

// Rows per insert, well under SQLite's limit on bound parameters.
export function chunks<T>(rows: T[]) {
    const out: T[][] = [];

    for (let start = 0; start < rows.length; start += 500) {
        out.push(rows.slice(start, start + 500));
    }

    return out;
}
