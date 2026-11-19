import { Change } from "@/components/change";
import { ChevronDownIcon } from "@/components/icons";
import { Money } from "@/components/money";
import { SectionHeading } from "@/components/section-heading";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/table";
import { formatDate, formatEur, formatPercent, formatPrice } from "@/lib/format";
import type { Portfolio } from "@/lib/portfolio/load";

type Put = Portfolio["puts"][number];

const outcomes: Record<Put["outcome"], string> = {
    open: "Open",
    "bought back": "Bought back",
    assigned: "Assigned",
    expired: "Expired",
};

const sum = (puts: Put[]) => puts.reduce((total, { premiumEur }) => total + premiumEur, 0);

function Contract({ put }: { put: Put }) {
    return (
        <>
            <span className="block text-base font-semibold">{put.name}</span>
            <span className="block text-xs text-muted-foreground">
                {formatPrice(put.strike, "EUR")} · {formatDate(put.expiry)}
            </span>
        </>
    );
}

function Premium({ amount }: { amount: number }) {
    return (
        <Change value={amount}>
            <Money>{formatEur(amount, { digits: 0, signed: true })}</Money>
        </Change>
    );
}

export function Options({ puts }: { puts: Put[] }) {
    const open = puts.filter((put) => put.open);
    const finished = puts.filter((put) => !put.open);

    return (
        <section className="flex flex-col gap-4">
            <SectionHeading>Options</SectionHeading>
            {open.length > 0 && (
                <Table className="min-w-225">
                    <TableHeader>
                        <TableHead>Option</TableHead>
                        <TableHead>Sold</TableHead>
                        <TableHead className="text-right">Contracts</TableHead>
                        <TableHead className="text-right">Underlying</TableHead>
                        <TableHead className="text-right">At risk</TableHead>
                        <TableHead className="text-right">Premium</TableHead>
                        <TableHead className="text-right">Result</TableHead>
                    </TableHeader>
                    <tbody>
                        {open.map((put) => {
                            const price = put.underlyingPrice;
                            const inTheMoney =
                                price === null ? null : Math.max(0, 1 - price / put.strike) * put.atRiskEur;

                            return (
                                <TableRow key={`${put.instrumentId}-${put.strike}-${put.expiry}`}>
                                    <TableCell>
                                        <Contract put={put} />
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{formatDate(put.opened)}</TableCell>
                                    <TableCell className="text-right">
                                        <Money>{put.open}</Money>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {price === null ? (
                                            "—"
                                        ) : (
                                            <>
                                                {formatPrice(price, "EUR")}
                                                <span className="block text-xs text-muted-foreground">
                                                    {formatPercent(Math.abs(price / put.strike - 1))}{" "}
                                                    {price < put.strike ? "below" : "above"} strike
                                                </span>
                                            </>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Money>{formatEur(put.atRiskEur, { digits: 0 })}</Money>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Premium amount={put.premiumEur} />
                                    </TableCell>
                                    <TableCell className="text-right font-bold">
                                        {inTheMoney === null ? "—" : <Premium amount={put.premiumEur - inTheMoney} />}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </tbody>
                </Table>
            )}
            {finished.length > 0 && (
                <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-x-6 border-b py-4 text-sm hover:bg-muted">
                        <span className="flex items-center gap-2.5">
                            <ChevronDownIcon className="size-3.5 transition group-open:rotate-180" />
                            <span className="text-base font-bold">Closed</span>
                            <span className="text-muted-foreground tabular-nums">{finished.length}</span>
                        </span>
                        <span className="ml-auto font-bold tabular-nums">
                            <Premium amount={sum(finished)} />
                        </span>
                    </summary>
                    <Table>
                        <TableHeader className="sr-only">
                            <th>Option</th>
                            <th>Outcome</th>
                            <th>Premium</th>
                        </TableHeader>
                        <tbody>
                            {finished.map((put) => (
                                <TableRow key={`${put.instrumentId}-${put.strike}-${put.expiry}`}>
                                    <TableCell className="pl-6">
                                        <Contract put={put} />
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {outcomes[put.outcome]} {put.closed && formatDate(put.closed)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Premium amount={put.premiumEur} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </tbody>
                    </Table>
                </details>
            )}
        </section>
    );
}
