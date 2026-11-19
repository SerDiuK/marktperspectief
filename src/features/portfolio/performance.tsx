"use client";

import { useState } from "react";
import type { Range } from "@/lib/dates";
import type { Portfolio } from "@/lib/portfolio/load";
import { Overview } from "./overview";
import { type ChartPoint, PortfolioChart } from "./portfolio-chart";

export function Performance({
    overview,
    asOf,
    series,
}: {
    overview: Portfolio["overview"];
    asOf: string | null;
    series: ChartPoint[];
}) {
    const [range, setRange] = useState<Range>("All");

    return (
        <section className="flex flex-col gap-9 border-t-2 border-foreground pt-5">
            <h2 className="sr-only">Overview</h2>
            {overview && <Overview overview={overview} asOf={asOf ?? overview.asOf} range={range} />}
            {series.length > 1 && <PortfolioChart series={series} range={range} onRange={setRange} />}
        </section>
    );
}
