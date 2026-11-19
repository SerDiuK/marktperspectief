import { defineConfig } from "drizzle-kit";
import { defaultConnection } from "./src/db/connect";

export default defineConfig({
    dialect: "turso",
    schema: ["./src/db/auth-schema.ts", "./src/db/schema.ts"],
    out: "./drizzle",
    casing: "snake_case",
    dbCredentials: defaultConnection,
});
