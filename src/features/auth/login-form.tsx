"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { Button } from "@/components/button";
import { authClient } from "@/lib/auth-client";

function SetupForm({ onRegister }: { onRegister: (setupToken: string) => void }) {
    const [setupToken, setSetupToken] = useState("");
    const handleSubmit = useCallback(
        (event: React.SubmitEvent<HTMLFormElement>) => {
            event.preventDefault();
            onRegister(setupToken);
        },
        [onRegister, setupToken],
    );
    const handleChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => setSetupToken(event.currentTarget.value),
        [],
    );

    if (!useSearchParams().has("setup")) return null;

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <input
                type="password"
                value={setupToken}
                onChange={handleChange}
                placeholder="Setup token"
                autoComplete="off"
                className="h-10 border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground"
            />
            <Button type="submit">Register passkey</Button>
        </form>
    );
}

export function LoginForm({ demo }: { demo: boolean }) {
    const router = useRouter();
    const [error, setError] = useState<string>();

    const signIn = useCallback(async () => {
        setError(undefined);

        const { data, error } = await authClient.signIn.passkey();

        if (error) return setError(error.message);
        if (!("redirect" in data)) router.replace("/");
    }, [router]);

    const enterDemo = useCallback(async () => {
        setError(undefined);

        const { data, error } = await authClient.$fetch<{ ok: true }>("/demo/sign-in", { method: "POST", body: {} });

        if (error) return setError(error.message);
        if (!("redirect" in data)) router.replace("/");
    }, [router]);

    const registerPasskey = useCallback(
        async (setupToken: string) => {
            setError(undefined);

            const { error } = await authClient.passkey.addPasskey({
                context: setupToken,
                createSession: true,
            });

            if (error) return setError(error.message);
            router.replace("/");
        },
        [router],
    );

    return (
        <div className="mt-6 flex flex-col gap-4 border-t-2 border-foreground pt-6">
            {demo ? (
                <Button variant="primary" onClick={enterDemo}>
                    Enter the demo
                </Button>
            ) : (
                <Button variant="primary" onClick={signIn}>
                    Sign in with passkey
                </Button>
            )}
            <Suspense>
                <SetupForm onRegister={registerPasskey} />
            </Suspense>
            {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
    );
}
