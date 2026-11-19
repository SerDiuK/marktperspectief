"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/button";
import { authClient } from "@/lib/auth-client";

export function ConsentForm() {
    const [error, setError] = useState<string>();
    const [pending, setPending] = useState(false);

    const answer = useCallback(async (event: React.MouseEvent<HTMLButtonElement>) => {
        setError(undefined);
        setPending(true);

        const { error } = await authClient.oauth2.consent({
            accept: event.currentTarget.value === "allow",
        });

        if (error) {
            setError(error.message);
            setPending(false);
        }
    }, []);

    return (
        <>
            <div className="flex gap-3">
                <Button variant="primary" value="allow" onClick={answer} disabled={pending} className="flex-1">
                    Allow
                </Button>
                <Button value="deny" onClick={answer} disabled={pending} className="flex-1">
                    Deny
                </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
        </>
    );
}
