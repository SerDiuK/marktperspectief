import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { passkey } from "@better-auth/passkey";
import { type AuthContext, type BetterAuthPlugin, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { jwt } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/auth-schema";
import { isDemoDatabase } from "@/lib/demo/marker";
import { matchesSecret } from "./secret";

// Single-user app: there is exactly one account, identified by this label (never mailed).
const OWNER_EMAIL = "owner@marktperspectief.local";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const mcpResource = `${baseURL}/api/mcp`;

type InternalAdapter = AuthContext["internalAdapter"];

async function owner(adapter: InternalAdapter) {
    const existing = await adapter.findUserByEmail(OWNER_EMAIL);

    return (
        existing?.user ??
        (await adapter.createUser(
            { email: OWNER_EMAIL, name: process.env.OWNER_NAME ?? "Owner", emailVerified: true },
            { method: "passkey-setup" },
        ))
    );
}

const demo = {
    id: "demo",
    endpoints: {
        demoSignIn: createAuthEndpoint("/demo/sign-in", { method: "POST" }, async (ctx) => {
            if (process.env.DEMO_MODE !== "1" || !(await isDemoDatabase(db))) {
                throw new APIError("FORBIDDEN", { message: "This is not the demo" });
            }

            const user = await owner(ctx.context.internalAdapter);
            const session = await ctx.context.internalAdapter.createSession(user.id);

            await setSessionCookie(ctx, { session, user });

            return ctx.json({ ok: true });
        }),
    },
} satisfies BetterAuthPlugin;

export const auth = betterAuth({
    baseURL,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    disabledPaths: ["/token"],
    plugins: [
        passkey({
            rpID: new URL(baseURL).hostname,
            rpName: "Marktperspectief",
            origin: baseURL,
            registration: {
                requireSession: false,
                resolveUser: async ({ ctx, context }) => {
                    if (!matchesSecret(context, process.env.AUTH_SETUP_TOKEN)) {
                        throw new APIError("FORBIDDEN", {
                            message: "Invalid setup token",
                        });
                    }

                    const user = await owner(ctx.context.internalAdapter);
                    const passkeys = await ctx.context.adapter.count({
                        model: "passkey",
                        where: [{ field: "userId", value: user.id }],
                    });

                    if (passkeys > 0) {
                        throw new APIError("FORBIDDEN", {
                            message: "The owner already has a passkey",
                        });
                    }

                    return { id: user.id, name: user.name };
                },
            },
        }),
        jwt(),
        mcp({
            loginPage: "/login",
            consentPage: "/consent",
            resource: mcpResource,
            scopes: ["offline_access", "portfolio"],
        }),
        cimd({
            fetchClientMetadataResource,
            metadataProfile: "mcp-2026-07-28",
            isMetadataDocumentUrlAllowed: (url) => new URL(url).origin === "https://claude.ai",
        }),
        demo,
    ],
});

// The Host check keeps out a page whose DNS name rebinds to 127.0.0.1.
export async function isSignedIn(requestHeaders: Headers) {
    if (process.env.NODE_ENV === "development" && /^localhost(:\d+)?$/.test(requestHeaders.get("host") ?? "")) {
        return true;
    }

    return (await auth.api.getSession({ headers: requestHeaders })) !== null;
}
