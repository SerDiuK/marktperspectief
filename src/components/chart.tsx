"use client";

import { cn } from "cn";
import * as React from "react";
import * as RechartsPrimitive from "recharts";
import { addDays, type Range } from "@/lib/dates";
import { formatDate } from "@/lib/format";

const INITIAL_DIMENSION = { width: 320, height: 200 } as const;

export type ChartConfig = Record<string, { label?: React.ReactNode; color?: string }>;

export function ChartContainer({
    id,
    className,
    children,
    config,
    initialDimension = INITIAL_DIMENSION,
    ...props
}: React.ComponentProps<"div"> & {
    config: ChartConfig;
    children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
    initialDimension?: {
        width: number;
        height: number;
    };
}) {
    const uniqueId = React.useId();
    const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;

    return (
        <div
            data-slot="chart"
            data-chart={chartId}
            className={cn(
                "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
                className,
            )}
            {...props}
        >
            <ChartStyle id={chartId} config={config} />
            <RechartsPrimitive.ResponsiveContainer initialDimension={initialDimension}>
                {children}
            </RechartsPrimitive.ResponsiveContainer>
        </div>
    );
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
    const colorConfig = Object.entries(config).filter(([, { color }]) => color);

    if (!colorConfig.length) {
        return null;
    }

    return (
        <style
            dangerouslySetInnerHTML={{
                __html: `[data-chart=${id}] {
${colorConfig.map(([key, { color }]) => `  --color-${key}: ${color};`).join("\n")}
}`,
            }}
        />
    );
};

export const ChartTooltip = RechartsPrimitive.Tooltip;

export const maxPoints = 300;

export const time = (date: string) => Date.parse(`${date}T00:00:00Z`);

const monthNames = new Intl.DateTimeFormat("en-IE", {
    month: "short",
    timeZone: "UTC",
});

export function dateTicks(range: Range, from: string, to: string) {
    const ticks: { t: number; label: string }[] = [];

    if (range === "1M") {
        for (let day = from; day <= to; day = addDays(day, 1)) {
            if (new Date(`${day}T00:00:00Z`).getUTCDay() === 1) {
                ticks.push({ t: time(day), label: formatDate(day).slice(0, -5) });
            }
        }

        return ticks;
    }

    const yearly = range === "5Y" || range === "All";
    const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);

    for (; cursor.getTime() <= time(to); cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
        const t = cursor.getTime();
        const month = cursor.getUTCMonth();

        if (t < time(from)) continue;
        if (yearly ? month !== 0 : range === "1Y" && month % 2) continue;

        const year = String(cursor.getUTCFullYear());

        ticks.push({
            t,
            label: yearly ? year : month ? monthNames.format(cursor) : `${monthNames.format(cursor)} ${year}`,
        });
    }

    return ticks;
}

export function niceTicks(low: number, high: number) {
    const rough = (high - low) / 4;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const step = magnitude * ([1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= rough) ?? 10);
    const ticks = [];

    for (let tick = Math.floor(low / step) * step; tick < high + step; tick += step) {
        ticks.push(tick);
    }

    return ticks;
}

export function TooltipBox({
    date,
    rows,
}: {
    date: string;
    rows: [swatch: string, label: string, amount: React.ReactNode][];
}) {
    return (
        <div className="flex min-w-52 flex-col gap-2 border-t-2 border-foreground bg-popover px-3.5 py-3 text-note tabular-nums outline outline-input">
            <span className="type-label text-foreground">{formatDate(date)}</span>
            {rows.map(([swatch, label, amount]) => (
                <span key={label} className="flex items-center gap-2">
                    <span className={`h-0.75 w-5 ${swatch}`} />
                    <span className="flex-1 text-muted-foreground">{label}</span>
                    <span className="font-bold">{amount}</span>
                </span>
            ))}
        </div>
    );
}
