import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { db } from "@/db";
import { auth, mcpResource } from "@/lib/auth";
import { buildServer } from "@/mcp/server";

const handler = createMcpHandler(() => buildServer(db));

export const POST = requireMcpAuth(auth, (request) => handler.fetch(request), {
    resource: mcpResource,
    requiredScopes: ["portfolio"],
});
