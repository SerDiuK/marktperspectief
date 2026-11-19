import { type NextRequest, NextResponse } from "next/server";
import { isSignedIn } from "@/lib/auth";

export async function proxy(request: NextRequest) {
    if (!(await isSignedIn(request.headers))) {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/((?!(?:login|api/auth|api/cron|api/mcp|\\.well-known|_next/static|_next/image)(?:/|$)|(?:favicon\\.ico|icon\\.svg|apple-icon\\.png)$).*)",
    ],
};
