"use client";

import { CartesianGrid, Line, LineChart, ReferenceDot, XAxis, YAxis } from "recharts";
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
import type { Range } from "@/lib/dates";
import { formatDate, formatPrice } from "@/lib/format";

type Close = { date: string; close: number };
type Trade = { date: string; side: "buy" | "sell"; price: number };

const DAY = 86_400_000;

const config = {
    close: { label: "Price", color: "var(--foreground)" },
} satisfies ChartConfig;

function tickRange(from: string, to: string): Range {
    const days = (time(to) - time(from)) / DAY;

    return days > 365 ? "All" : days > 183 ? "1Y" : days > 31 ? "6M" : "1M";
}

function PriceTooltip({
    active,
    payload,
    currency,
}: {
    active?: boolean;
    payload?: { payload: Close }[];
    currency: string;
}) {
    const point = payload?.[0]?.payload;

    if (!active || !point) return null;

    return <TooltipBox date={point.date} rows={[["bg-foreground/75", "Price", formatPrice(point.close, currency)]]} />;
}

function TradeMarker({
    cx = 0,
    cy = 0,
    trade,
    currency,
}: {
    cx?: number;
    cy?: number;
    trade: Trade;
    currency: string;
}) {
    return (
        <g className="stroke-popover stroke-2">
            <title>
                {`${trade.side === "buy" ? "Bought" : "Sold"} at ${formatPrice(trade.price, currency)}, ${formatDate(trade.date)}`}
            </title>
            {trade.side === "buy" ? (
                <circle cx={cx} cy={cy} r={6} className="fill-chart-1" />
            ) : (
                <rect
                    x={cx - 5.5}
                    y={cy - 5.5}
                    width={11}
                    height={11}
                    transform={`rotate(45 ${cx} ${cy})`}
                    className="fill-chart-2"
                />
            )}
        </g>
    );
}

export function HoldingChart({
    name,
    currency,
    closes,
    trades,
}: {
    name: string;
    currency: string;
    closes: Close[];
    trades: Trade[];
}) {
    const step = Math.ceil(closes.length / maxPoints);
    const points = closes
        .filter((_, index) => index % step === 0 || index === closes.length - 1)
        .map((point) => ({ ...point, t: time(point.date) }));
    const prices = [...closes.map(({ close }) => close), ...trades.map(({ price }) => price)];
    const yTicks = niceTicks(Math.min(...prices) * 0.97, Math.max(...prices) * 1.02);
    const from = [closes[0].date, ...trades.map(({ date }) => date)].sort()[0];
    const to = closes[closes.length - 1].date;
    const xTicks = dateTicks(tickRange(from, to), from, to);
    const labels = new Map(xTicks.map(({ t, label }) => [t, label]));
    const xLabel = (t: number) => labels.get(t) ?? "";
    const yLabel = (tick: number) => formatPrice(tick, currency).replace(/\.00$/, "");

    return (
        <ChartContainer
            config={config}
            role="img"
            aria-label={`${name} share price since ${formatDate(from)}, with your trades marked`}
            className="aspect-auto h-47.5 w-full"
        >
            <LineChart data={points} margin={{ top: 20, right: 7, bottom: 0, left: 7 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={[time(from), time(to)]}
                    ticks={xTicks.map(({ t }) => t)}
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
                    tick={{ dy: -8 }}
                    tickLine={false}
                    axisLine={false}
                />
                <ChartTooltip
                    cursor={{ stroke: "var(--foreground)", strokeWidth: 1 }}
                    content={<PriceTooltip currency={currency} />}
                />
                <Line
                    dataKey="close"
                    type="linear"
                    stroke="var(--color-close)"
                    strokeOpacity={0.75}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                />
                {trades.map((trade, index) => (
                    <ReferenceDot
                        key={`${trade.date}-${index}`}
                        x={time(trade.date)}
                        y={trade.price}
                        shape={<TradeMarker trade={trade} currency={currency} />}
                    />
                ))}
            </LineChart>
        </ChartContainer>
    );
}
