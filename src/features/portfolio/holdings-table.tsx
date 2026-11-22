"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Change } from "@/components/change";
import { Money } from "@/components/money";
import { Sparkline } from "@/components/sparkline";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/table";
import { formatEur, formatPercent, formatPrice, formatShares } from "@/lib/format";
import { HoldingType, type HoldingTypeId } from "./holding-type";

export type HoldingRow = {
    instrumentId: string;
    name: string;
    type: HoldingTypeId | null;
    currency: string;
    shares: number;
    avgPrice: number;
    price: number | null;
    valueEur: number | null;
    weight: number | null;
    dayChange: number | null;
    unrealisedEur: number | null;
    unrealisedPct: number | null;
    sparkline: string;
    threeMonths: number | null;
};

type SortKey = "name" | "value" | "day" | "unrealised";
type Sort = { key: SortKey; descending: boolean };

const sortValues = {
    value: (row: HoldingRow) => row.valueEur,
    day: (row: HoldingRow) => row.dayChange,
    unrealised: (row: HoldingRow) => row.unrealisedPct,
};

const startsDescending = (key: SortKey) => key !== "name";

// Rows without a price sort last either way.
function sortRows(rows: HoldingRow[], { key, descending }: Sort) {
    return [...rows].sort((a, b) => {
        if (key === "name") {
            return (descending ? -1 : 1) * a.name.localeCompare(b.name);
        }

        const x = sortValues[key](a);
        const y = sortValues[key](b);

        if (x === null || y === null) return (x === null ? 1 : 0) - (y === null ? 1 : 0);

        return descending ? y - x : x - y;
    });
}

function SortHeader({
    column,
    sort,
    onSort,
    className,
    children,
}: {
    column: SortKey;
    sort: Sort;
    onSort: (column: SortKey) => void;
    className?: string;
    children: React.ReactNode;
}) {
    const handleClick = useCallback(() => onSort(column), [column, onSort]);
    const active = sort.key === column;
    const descending = active ? sort.descending : startsDescending(column);

    return (
        <TableHead aria-sort={active ? (sort.descending ? "descending" : "ascending") : "none"} className={className}>
            <button
                type="button"
                onClick={handleClick}
                className="group/sort inline-flex h-10 items-center gap-1 font-bold hover:text-ring"
            >
                {children}
                <span
                    aria-hidden="true"
                    className={
                        active ? "text-primary" : "invisible group-hover/sort:visible group-focus-visible/sort:visible"
                    }
                >
                    {descending ? "↓" : "↑"}
                </span>
            </button>
        </TableHead>
    );
}

export function HoldingLink({ instrumentId, children }: { instrumentId: string; children: React.ReactNode }) {
    const [intent, setIntent] = useState(false);
    const showIntent = useCallback(() => setIntent(true), []);

    return (
        <Link
            href={`/h/${instrumentId}`}
            replace
            scroll={false}
            prefetch={intent ? true : "auto"}
            onMouseEnter={showIntent}
            onFocus={showIntent}
            className="after:absolute after:inset-0"
        >
            {children}
        </Link>
    );
}

export function HoldingsTable({ rows }: { rows: HoldingRow[] }) {
    const [sort, setSort] = useState<Sort>({ key: "value", descending: true });
    const handleSort = useCallback(
        (key: SortKey) =>
            setSort((current) =>
                current.key === key
                    ? { key, descending: !current.descending }
                    : { key, descending: startsDescending(key) },
            ),
        [],
    );
    const maxWeight = Math.max(0, ...rows.map(({ weight }) => weight ?? 0));
    const value = rows.reduce((sum, row) => sum + (row.valueEur ?? 0), 0);
    const unrealised = rows.reduce((sum, row) => sum + (row.unrealisedEur ?? 0), 0);
    const day = rows.reduce(
        (sum, row) =>
            row.valueEur === null || row.dayChange === null
                ? sum
                : sum + (row.valueEur * row.dayChange) / (1 + row.dayChange),
        0,
    );
    const yesterday = value - day;
    const cost = value - unrealised;

    return (
        <Table className="min-w-275">
            <TableHeader>
                <SortHeader column="name" sort={sort} onSort={handleSort}>
                    Holding
                </SortHeader>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Avg price</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <SortHeader column="value" sort={sort} onSort={handleSort} className="text-right">
                    Value
                </SortHeader>
                <SortHeader column="day" sort={sort} onSort={handleSort} className="text-right">
                    1D
                </SortHeader>
                <SortHeader column="unrealised" sort={sort} onSort={handleSort} className="text-right">
                    Unrealised
                </SortHeader>
                <TableHead className="text-right">3 months</TableHead>
            </TableHeader>
            <tbody>
                {sortRows(rows, sort).map((row) => (
                    <TableRow key={row.instrumentId} className="relative">
                        <TableCell>
                            <HoldingLink instrumentId={row.instrumentId}>
                                <span className="block text-base font-semibold">{row.name}</span>
                            </HoldingLink>
                        </TableCell>
                        <TableCell>{row.type && <HoldingType type={row.type} />}</TableCell>
                        <TableCell className="text-right">
                            {row.weight === null ? (
                                "—"
                            ) : (
                                <span className="flex flex-col items-end gap-1.5">
                                    {formatPercent(row.weight)}
                                    <span aria-hidden="true" className="flex h-0.75 w-18 justify-end bg-secondary">
                                        <span
                                            className="bg-chart-1"
                                            style={{
                                                width: `${(row.weight / maxWeight) * 100}%`,
                                            }}
                                        />
                                    </span>
                                </span>
                            )}
                        </TableCell>
                        <TableCell className="text-right">
                            <Money>{formatShares(row.shares)}</Money>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                            {formatPrice(row.avgPrice, row.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                            {row.price === null ? "—" : formatPrice(row.price, row.currency)}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                            {row.valueEur === null ? "—" : <Money>{formatEur(row.valueEur, { digits: 0 })}</Money>}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                            {row.dayChange === null ? (
                                "—"
                            ) : (
                                <Change value={row.dayChange}>
                                    {formatPercent(row.dayChange, {
                                        digits: 2,
                                        signed: true,
                                    })}
                                </Change>
                            )}
                        </TableCell>
                        <TableCell className="text-right">
                            {row.unrealisedEur === null || row.unrealisedPct === null ? (
                                "—"
                            ) : (
                                <Change value={row.unrealisedEur}>
                                    <Money>
                                        {formatEur(row.unrealisedEur, {
                                            digits: 0,
                                            signed: true,
                                        })}
                                    </Money>
                                    <span className="block text-xs font-semibold">
                                        {formatPercent(row.unrealisedPct, {
                                            signed: true,
                                        })}
                                    </span>
                                </Change>
                            )}
                        </TableCell>
                        <TableCell>
                            {row.threeMonths === null ? (
                                "—"
                            ) : (
                                <span className="flex items-center justify-end gap-2.5">
                                    <Sparkline
                                        path={row.sparkline}
                                        label={`3-month price trend ${formatPercent(row.threeMonths, { signed: true })}`}
                                    />
                                    <span
                                        aria-hidden="true"
                                        className="min-w-12 text-right text-xs text-muted-foreground"
                                    >
                                        {formatPercent(row.threeMonths, {
                                            signed: true,
                                        })}
                                    </span>
                                </span>
                            )}
                        </TableCell>
                    </TableRow>
                ))}
            </tbody>
            <tfoot>
                <tr className="border-t-2 border-foreground font-bold">
                    <TableCell className="text-base">Total</TableCell>
                    <TableCell colSpan={5} />
                    <TableCell className="text-right">
                        <Money>{formatEur(value, { digits: 0 })}</Money>
                    </TableCell>
                    <TableCell className="text-right">
                        {yesterday ? (
                            <Change value={day}>{formatPercent(day / yesterday, { digits: 2, signed: true })}</Change>
                        ) : (
                            "—"
                        )}
                    </TableCell>
                    <TableCell className="text-right">
                        <Money>{formatEur(unrealised, { digits: 0, signed: true })}</Money>
                        <span className="block text-xs">
                            {cost ? (
                                <Change value={unrealised}>{formatPercent(unrealised / cost, { signed: true })}</Change>
                            ) : (
                                "—"
                            )}
                        </span>
                    </TableCell>
                    <TableCell />
                </tr>
            </tfoot>
        </Table>
    );
}
