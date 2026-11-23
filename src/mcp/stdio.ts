import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { db } from "@/db";
import { buildServer } from "./server";

serveStdio(() => buildServer(db, { modelConfirms: true }));
