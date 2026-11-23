import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { db } from "@/db";
import { auth, mcpResource } from "@/lib/auth";
import { buildServer } from "@/mcp/server";

// A listen stream holds the function open until Vercel's timeout, and the server publishes no change events.
const handler = createMcpHandler(() => buildServer(db), { maxSubscriptions: 0 });

export const POST = requireMcpAuth(auth, (request) => handler.fetch(request), {
    resource: mcpResource,
    requiredScopes: ["portfolio"],
});
