import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SectionHeading } from "@/components/section-heading";
import { sparklinePath } from "@/components/sparkline";
import { db } from "@/db";
import { ClosedPositions } from "@/features/portfolio/closed-positions";
import { Dividends } from "@/features/portfolio/dividends";
import { type HoldingRow, HoldingsTable } from "@/features/portfolio/holdings-table";
import { Options } from "@/features/portfolio/options";
import { Performance } from "@/features/portfolio/performance";
import type { ChartPoint } from "@/features/portfolio/portfolio-chart";
import { SiteHeader } from "@/features/site-header/site-header";
import { isSignedIn } from "@/lib/auth";
import { loadPortfolio, type Portfolio } from "@/lib/portfolio/load";

function toRow(holding: Portfolio["holdings"][number]): HoldingRow {
    const { recentCloses } = holding;

    return {
        instrumentId: holding.instrumentId,
        name: holding.name,
        type: holding.thesis && holding.thesis.type,
        currency: holding.currency,
        shares: holding.shares,
        avgPrice: holding.avgPrice,
        price: holding.price,
        valueEur: holding.valueEur,
        weight: holding.weight,
        dayChange: holding.dayChange,
        unrealisedEur: holding.unrealisedEur,
        unrealisedPct: holding.unrealisedPct,
        sparkline: sparklinePath(recentCloses),
        threeMonths: recentCloses.length > 1 ? recentCloses[recentCloses.length - 1] / recentCloses[0] - 1 : null,
    };
}

// Five decimals are plenty for the chart, and halve the page's compressed size.
const fiveDecimals = (index: number) => Math.round(index * 1e5) / 1e5;

function toPoint(point: Portfolio["series"][number]): ChartPoint {
    return {
        ...point,
        twrIndex: fiveDecimals(point.twrIndex),
        stoxx600: point.stoxx600 && fiveDecimals(point.stoxx600),
        sp500: point.sp500 && fiveDecimals(point.sp500),
    };
}

export default function HomeLayout({ children }: LayoutProps<"/">) {
    return (
        <>
            <SiteHeader current="/" />
            <main className="mx-auto flex w-full max-w-300 flex-col gap-14 px-4 pt-4 pb-14 md:px-10">
                <h1 className="sr-only">Portfolio</h1>
                <Suspense
                    fallback={
                        <section className="flex flex-col gap-4">
                            <p className="type-label">Loading…</p>
                        </section>
                    }
                >
                    <PortfolioSections />
                </Suspense>
            </main>
            {children}
        </>
    );
}

async function PortfolioSections() {
    if (!(await isSignedIn(await headers()))) redirect("/login");

    const { overview, series, asOf, holdings, closed, puts, dividends } = await loadPortfolio(db);

    if (!holdings.length && !closed.length && !puts.length) {
        return (
            <section className="flex flex-col gap-4">
                <SectionHeading>Holdings</SectionHeading>
                <p className="type-label">
                    No trades yet.{" "}
                    <Link href="/import" className="text-foreground underline">
                        Import a broker export
                    </Link>{" "}
                    to start.
                </p>
            </section>
        );
    }

    return (
        <>
            <Performance overview={overview} asOf={asOf} series={series.map(toPoint)} />
            <section className="flex flex-col gap-4">
                <SectionHeading>Holdings</SectionHeading>
                <HoldingsTable rows={holdings.map(toRow)} />
                {closed.length > 0 && <ClosedPositions closed={closed} />}
            </section>
            {overview && dividends.length > 0 && (
                <Dividends years={dividends} estimatedEur={overview.estimatedDividendsEur} />
            )}
            {puts.length > 0 && <Options puts={puts} />}
        </>
    );
}
