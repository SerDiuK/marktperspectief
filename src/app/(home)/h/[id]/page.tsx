import { cacheLife } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Sheet } from "@/components/sheet";
import { db } from "@/db";
import { HoldingPanel } from "@/features/portfolio/holding-panel";
import { isSignedIn } from "@/lib/auth";
import { loadHolding } from "@/lib/portfolio/holding";

async function signedIn() {
    "use cache: private";

    cacheLife({ stale: 30 });

    return isSignedIn(await headers());
}

async function privateHolding(id: string) {
    "use cache: private";

    cacheLife({ stale: 30 });

    return loadHolding(db, id);
}

export default function HoldingPage({ params }: PageProps<"/h/[id]">) {
    return (
        <Sheet label="Holding details" closeHref="/">
            <Suspense fallback={<p className="type-label">Loading…</p>}>
                <HoldingDetails params={params} />
            </Suspense>
        </Sheet>
    );
}

async function HoldingDetails({ params }: Pick<PageProps<"/h/[id]">, "params">) {
    if (!(await signedIn())) redirect("/login");

    const holding = await privateHolding((await params).id);

    return holding ? <HoldingPanel holding={holding} /> : <p className="type-label">No such holding.</p>;
}
