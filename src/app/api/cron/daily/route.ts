import { db } from "@/db";
import { ownerDate } from "@/lib/dates";
import { loadDemo } from "@/lib/demo/load";
import { canLoadDemo } from "@/lib/demo/marker";
import { syncMarketData } from "@/lib/market/sync";
import { refreshDerived } from "@/lib/portfolio/refresh";
import { matchesSecret } from "@/lib/secret";

export async function GET(request: Request) {
    const secret = process.env.CRON_SECRET;

    if (!matchesSecret(request.headers.get("authorization"), secret && `Bearer ${secret}`)) {
        return new Response("Unauthorized", { status: 401 });
    }

    const today = ownerDate(new Date());

    if (process.env.DEMO_MODE === "1") {
        if (!(await canLoadDemo(db))) return new Response("This database is not the demo", { status: 409 });

        const { sync, results } = await loadDemo(db, today);

        return Response.json({ ...sync, files: results.map(({ name, status, report }) => ({ name, status, report })) });
    }

    const sync = await syncMarketData(db);
    const derived = await refreshDerived(db, today);

    return Response.json({ ...sync, ...derived });
}
