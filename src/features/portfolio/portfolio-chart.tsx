"use client";

import { useCallback, useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, XAxis, YAxis } from "recharts";
import {
    type ChartConfig,
    ChartContainer,
    ChartTooltip,
    dateTicks,
    maxPoints,
    niceTicks,
    TooltipBox,
    time,
} from "@/components/chart";
import { Money } from "@/components/money";
import { Segments } from "@/components/segments";
import { type Range, rangeStart, ranges } from "@/lib/dates";
import { formatEur, formatPercent, formatPoints } from "@/lib/format";

export type ChartPoint = {
    date: string;
    valueEur: number;
    investedEur: number;
    twrIndex: number;
    stoxx600: number | null;
    sp500: number | null;
};

type PlotPoint = ChartPoint & {
    t: number;
    portfolioPct: number;
    benchmarkPct: number | null;
};

const views = { value: "Value", market: "vs market" };

type View = keyof typeof views;

const benchmarks = { stoxx600: "Stoxx 600", sp500: "S&P 500" };

type Benchmark = keyof typeof benchmarks;

const config = {
    valueEur: { color: "var(--chart-1)" },
    investedEur: { label: "Net invested", color: "var(--chart-3)" },
    portfolioPct: { label: "Portfolio", color: "var(--chart-1)" },
    benchmarkPct: { color: "var(--chart-2)" },
} satisfies ChartConfig;

const formatThousands = (value: number) => (value ? `${value < 0 ? "−" : ""}€${Math.abs(value) / 1000}k` : "€0");

type TooltipProps = { active?: boolean; payload?: { payload: PlotPoint }[] };

function ValueTooltip({ active, payload, invested }: TooltipProps & { invested: boolean }) {
    const point = payload?.[0]?.payload;

    if (!active || !point) return null;

    const euros = (amount: number, signed = false) => <Money>{formatEur(amount, { digits: 0, signed })}</Money>;
    const rows: React.ComponentProps<typeof TooltipBox>["rows"] = [["bg-chart-1", "Value", euros(point.valueEur)]];

    if (invested) {
        rows.push(
            ["bg-chart-3", "Net invested", euros(point.investedEur)],
            ["", "Gain", euros(point.valueEur - point.investedEur, true)],
        );
    }

    return <TooltipBox date={point.date} rows={rows} />;
}

function MarketTooltip({ active, payload, benchmark }: TooltipProps & { benchmark: string }) {
    const point = payload?.[0]?.payload;

    if (!active || !point) return null;

    const { portfolioPct, benchmarkPct } = point;

    return (
        <TooltipBox
            date={point.date}
            rows={[
                ["bg-chart-1", "Portfolio", formatPercent(portfolioPct, { signed: true })],
                ["bg-chart-2", benchmark, benchmarkPct === null ? "—" : formatPercent(benchmarkPct, { signed: true })],
                [
                    "",
                    "Difference",
                    benchmarkPct === null ? "—" : formatPoints(portfolioPct - benchmarkPct, { signed: true }),
                ],
            ]}
        />
    );
}

export function PortfolioChart({
    series,
    range,
    onRange,
}: {
    series: ChartPoint[];
    range: Range;
    onRange: (range: Range) => void;
}) {
    const [view, setView] = useState<View>("value");
    const [benchmark, setBenchmark] = useState<Benchmark>("stoxx600");
    const [invested, setInvested] = useState(false);
    const toggleInvested = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => setInvested(event.currentTarget.checked),
        [],
    );

    const asOf = series.at(-1)?.date ?? "";
    const { points, xTicks, xLabel, yTicks, yLabel, bands, long } = useMemo(() => {
        const start = rangeStart(range, asOf);
        const inRange = series.filter(({ date }) => date >= start);
        const step = Math.ceil(inRange.length / maxPoints);
        const base = inRange[0];
        const baseIndex = base[benchmark];
        const points: PlotPoint[] = inRange
            .filter((_, index) => index % step === 0 || index === inRange.length - 1)
            .map((point) => {
                const index = point[benchmark];

                return {
                    ...point,
                    t: time(point.date),
                    portfolioPct: point.twrIndex / base.twrIndex - 1,
                    benchmarkPct: baseIndex && index !== null ? index / baseIndex - 1 : null,
                };
            });
        const long = range === "5Y" || range === "All";
        const amounts = points.flatMap((point) =>
            view === "market"
                ? [point.portfolioPct, point.benchmarkPct ?? 0]
                : invested
                  ? [point.valueEur, point.investedEur]
                  : [point.valueEur],
        );
        const low = Math.min(...amounts);
        const high = Math.max(...amounts);
        const span = high - low;
        const yTicks = niceTicks(
            view === "market" ? low - span * 0.04 : long ? Math.min(0, low) : low - span * 0.15,
            high + span * 0.04,
        );
        const whole = yTicks.every((tick) => Math.abs(tick * 100 - Math.round(tick * 100)) < 1e-6);
        const from = points[0]?.date ?? asOf;
        const xTicks = dateTicks(range, from, asOf);
        const labels = new Map(xTicks.map(({ t, label }) => [t, label]));
        const bands: { x1: number; x2: number }[] = [];

        inRange.forEach(({ date, investedEur }, index) => {
            if (investedEur >= 0) return;

            if (index > 0 && inRange[index - 1].investedEur < 0) {
                bands[bands.length - 1].x2 = time(date);
            } else {
                bands.push({ x1: time(date), x2: time(date) });
            }
        });

        return {
            points,
            long,
            xTicks: xTicks.map(({ t }) => t),
            xLabel: (t: number) => labels.get(t) ?? "",
            yTicks,
            yLabel:
                view === "value"
                    ? formatThousands
                    : (tick: number) => formatPercent(tick, { digits: whole ? 0 : 1, signed: true }),
            bands,
        };
    }, [series, range, asOf, view, benchmark, invested]);

    return (
        <div className="flex flex-col gap-4.5">
            <div className="flex min-h-8 flex-wrap items-center gap-x-6 gap-y-3 text-note font-medium text-muted-foreground">
                <Segments
                    label="Chart view"
                    options={Object.entries(views) as [View, string][]}
                    value={view}
                    onPick={setView}
                />
                {view === "value" ? (
                    <label className="flex cursor-pointer items-center gap-2 hover:text-foreground">
                        <input
                            type="checkbox"
                            checked={invested}
                            onChange={toggleInvested}
                            className="size-3.5 cursor-pointer appearance-none ring-1 ring-input ring-inset checked:bg-primary checked:ring-primary"
                        />
                        <span className="h-0.75 w-5 bg-chart-3" />
                        {config.investedEur.label}
                    </label>
                ) : (
                    <span className="flex items-center gap-3">
                        <span className="flex items-center gap-2">
                            <span className="h-0.75 w-5 bg-chart-1" />
                            {config.portfolioPct.label}
                        </span>
                        <span className="h-0.75 w-5 bg-chart-2" />
                        <Segments
                            label="Benchmark"
                            options={Object.entries(benchmarks) as [Benchmark, string][]}
                            value={benchmark}
                            onPick={setBenchmark}
                        />
                    </span>
                )}
                <div className="ml-auto">
                    <Segments
                        label="Time range"
                        options={ranges.map((option) => [option, option])}
                        value={range}
                        onPick={onRange}
                    />
                </div>
            </div>
            {points.length < 2 ? (
                <p className="type-label">Not enough data in this range.</p>
            ) : (
                <ChartContainer
                    config={config}
                    role="img"
                    aria-label={
                        view === "value"
                            ? `Portfolio value${invested ? " and net invested" : ""}, ${range}`
                            : `Portfolio return against the ${benchmarks[benchmark]}, ${range}`
                    }
                    className="aspect-auto h-85 w-full"
                >
                    <ComposedChart data={points} margin={{ top: 20, right: 0, bottom: 0, left: 0 }}>
                        <CartesianGrid vertical={false} stroke="var(--border)" />
                        <XAxis
                            dataKey="t"
                            type="number"
                            scale="time"
                            domain={["dataMin", "dataMax"]}
                            ticks={xTicks}
                            tickFormatter={xLabel}
                            tickLine={false}
                            axisLine={false}
                            tickMargin={10}
                        />
                        <YAxis
                            orientation="left"
                            mirror
                            domain={[yTicks[0], yTicks.at(-1) ?? 0]}
                            ticks={yTicks}
                            tickFormatter={yLabel}
                            tick={{
                                className: view === "value" ? "transition private:blur-sm" : undefined,
                                dy: -8,
                            }}
                            tickLine={false}
                            axisLine={false}
                        />
                        {bands.map(({ x1, x2 }) => (
                            <ReferenceArea
                                key={x1}
                                x1={x1}
                                x2={x2}
                                fill="var(--annotation)"
                                fillOpacity={1}
                                ifOverflow="hidden"
                            />
                        ))}
                        {view === "market" && <ReferenceLine y={0} stroke="var(--foreground)" strokeWidth={2} />}
                        <ChartTooltip
                            cursor={{ stroke: "var(--foreground)", strokeWidth: 1 }}
                            content={
                                view === "value" ? (
                                    <ValueTooltip invested={invested} />
                                ) : (
                                    <MarketTooltip benchmark={benchmarks[benchmark]} />
                                )
                            }
                        />
                        {view === "value" && (
                            <Area
                                dataKey="valueEur"
                                type="linear"
                                stroke="none"
                                fill="var(--color-valueEur)"
                                fillOpacity={long ? 0.1 : 0}
                                isAnimationActive={false}
                            />
                        )}
                        {view === "value" && invested && (
                            <Line
                                dataKey="investedEur"
                                type="linear"
                                stroke="var(--color-investedEur)"
                                strokeWidth={2}
                                dot={false}
                                isAnimationActive={false}
                            />
                        )}
                        {view === "value" && (
                            <Line
                                dataKey="valueEur"
                                type="linear"
                                stroke="var(--color-valueEur)"
                                strokeWidth={2.5}
                                dot={false}
                                isAnimationActive={false}
                            />
                        )}
                        {view === "market" && (
                            <Line
                                dataKey="benchmarkPct"
                                type="linear"
                                stroke="var(--color-benchmarkPct)"
                                strokeWidth={2}
                                dot={false}
                                isAnimationActive={false}
                            />
                        )}
                        {view === "market" && (
                            <Line
                                dataKey="portfolioPct"
                                type="linear"
                                stroke="var(--color-portfolioPct)"
                                strokeWidth={2.5}
                                dot={false}
                                isAnimationActive={false}
                            />
                        )}
                    </ComposedChart>
                </ChartContainer>
            )}
        </div>
    );
}
