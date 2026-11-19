import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { ConsentForm } from "@/features/auth/consent-form";
import { auth } from "@/lib/auth";

const scopes: Record<string, string> = {
    portfolio: "Read your portfolio and record the trades you confirm in chat",
    offline_access: "Stay connected until you remove the connector",
};

const host = (url: string | null) => (url && URL.canParse(url) ? new URL(url).host : url);

export default function ConsentPage({ searchParams }: PageProps<"/consent">) {
    return (
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
            <h1>
                <Logo className="h-auto w-full" />
            </h1>
            <Suspense>
                <AccessRequest searchParams={searchParams} />
            </Suspense>
        </main>
    );
}

async function AccessRequest({ searchParams }: Pick<PageProps<"/consent">, "searchParams">) {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(await searchParams)) {
        for (const item of [value ?? []].flat()) query.append(key, item);
    }

    const { secret } = await auth.$context;

    if (!(await verifyOAuthQueryParams(query.toString(), secret))) {
        return (
            <p className="mt-6 border-t-2 border-foreground pt-6 text-sm">
                This request has expired or was changed. Connect again from Claude.
            </p>
        );
    }

    return (
        <div className="mt-6 flex flex-col gap-4 border-t-2 border-foreground pt-6 text-sm">
            <p>
                <span className="font-semibold">{host(query.get("client_id"))}</span> asks to:
            </p>
            <ul className="list-disc pl-5">
                {query
                    .get("scope")
                    ?.split(" ")
                    .map((scope) => (
                        <li key={scope}>{scopes[scope] ?? scope}</li>
                    ))}
            </ul>
            <p className="text-note text-muted-foreground">Then it returns you to {host(query.get("redirect_uri"))}.</p>
            <ConsentForm />
        </div>
    );
}
