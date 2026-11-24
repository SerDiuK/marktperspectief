import { Change } from "@/components/change";
import { ChevronDownIcon } from "@/components/icons";
import { Money } from "@/components/money";
import { Table, TableCell, TableHeader, TableRow } from "@/components/table";
import { formatEur, formatMonthRange, formatPercent } from "@/lib/format";
import type { Portfolio } from "@/lib/portfolio/load";
import { HoldingLink } from "./holdings-table";

export function ClosedPositions({ closed }: { closed: Portfolio["closed"] }) {
    const realised = closed.reduce((sum, { realisedEur }) => sum + realisedEur, 0);

    return (
        <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-x-6 border-b py-4 text-sm transition-colors hover:bg-accent">
                <span className="flex items-center gap-2.5">
                    <ChevronDownIcon className="size-3.5 transition group-open:rotate-180" />
                    <span className="text-base font-bold">Closed</span>
                    <span className="text-muted-foreground tabular-nums">{closed.length}</span>
                </span>
                <span className="ml-auto font-bold tabular-nums">
                    <Change value={realised}>
                        <Money>{formatEur(realised, { digits: 0, signed: true })}</Money>
                    </Change>
                </span>
            </summary>
            <Table>
                <TableHeader className="sr-only">
                    <th>Holding</th>
                    <th>Held</th>
                    <th>Realised</th>
                </TableHeader>
                <tbody>
                    {closed.map((period) => (
                        <TableRow key={`${period.instrumentId}-${period.from}`} variant="link">
                            <TableCell className="pl-6">
                                <HoldingLink instrumentId={period.instrumentId}>{period.name}</HoldingLink>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                                {formatMonthRange(period.from, period.to)}
                            </TableCell>
                            <TableCell className="text-right">
                                <Change value={period.realisedEur}>
                                    <Money>
                                        {formatEur(period.realisedEur, {
                                            digits: 0,
                                            signed: true,
                                        })}
                                    </Money>
                                    {period.realisedPct !== null && (
                                        <span className="block text-xs font-semibold">
                                            {formatPercent(period.realisedPct, {
                                                digits: 0,
                                                signed: true,
                                            })}
                                        </span>
                                    )}
                                </Change>
                            </TableCell>
                        </TableRow>
                    ))}
                </tbody>
            </Table>
        </details>
    );
}
