import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { passkey } from "@better-auth/passkey";
import { type AuthContext, type BetterAuthPlugin, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthEndpoint, createAuthMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { jwt } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/auth-schema";
import { isDemo } from "@/lib/demo/marker";
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

const accountPaths = new Set([
    "/list-sessions",
    "/revoke-session",
    "/revoke-sessions",
    "/revoke-other-sessions",
    "/update-session",
    "/update-user",
    "/delete-user",
    "/change-email",
    "/list-accounts",
    "/account-info",
    "/unlink-account",
    "/passkey/generate-register-options",
    "/passkey/verify-registration",
    "/passkey/list-user-passkeys",
    "/passkey/update-passkey",
    "/passkey/delete-passkey",
    "/oauth2/get-consent",
    "/oauth2/get-consents",
    "/oauth2/update-consent",
    "/oauth2/delete-consent",
    "/oauth2/create-client",
    "/oauth2/get-client",
    "/oauth2/get-clients",
    "/oauth2/update-client",
    "/oauth2/delete-client",
    "/oauth2/client/rotate-secret",
]);

const demo = {
    id: "demo",
    endpoints: {
        demoSignIn: createAuthEndpoint("/demo/sign-in", { method: "POST" }, async (ctx) => {
            if (!(await isDemo(db))) {
                throw new APIError("FORBIDDEN", { message: "This is not the demo" });
            }

            const user = await owner(ctx.context.internalAdapter);
            const session = await ctx.context.internalAdapter.createSession(user.id, false, {
                ipAddress: "",
                userAgent: "",
            });

            await setSessionCookie(ctx, { session, user });

            return ctx.json({ ok: true });
        }),
    },
    hooks: {
        before: [
            {
                matcher: ({ path }) => accountPaths.has(path ?? ""),
                handler: createAuthMiddleware(async () => {
                    if (await isDemo(db)) {
                        throw new APIError("FORBIDDEN", { message: "Not on the demo" });
                    }
                }),
            },
        ],
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
