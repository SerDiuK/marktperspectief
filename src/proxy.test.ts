import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it, vi } from "vitest";
import { config } from "./proxy";

vi.mock("@/lib/auth", () => ({ isSignedIn: vi.fn() }));

const guarded = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("proxy matcher", () => {
    it.each(["/", "/import", "/api/dashboard", "/api/mcp-x", "/h/x.png"])("guards %s", (url) => {
        expect(guarded(url)).toBe(true);
    });

    it.each([
        "/login",
        "/api/auth/get-session",
        "/api/cron/daily",
        "/api/mcp",
        "/.well-known/oauth-protected-resource",
        "/_next/static/chunks/main.js",
        "/favicon.ico",
        "/icon.svg",
        "/apple-icon.png",
    ])("leaves %s to its own auth", (url) => {
        expect(guarded(url)).toBe(false);
    });
});
