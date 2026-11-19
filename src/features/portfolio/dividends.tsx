import { Money } from "@/components/money";
import { SectionHeading } from "@/components/section-heading";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/table";
import { formatEur } from "@/lib/format";
import type { Portfolio } from "@/lib/portfolio/load";

export function Dividends({ years, estimatedEur }: { years: Portfolio["dividends"]; estimatedEur: number }) {
    const received = years.reduce((sum, { receivedEur }) => sum + receivedEur, 0);
    const largest = Math.max(estimatedEur, ...years.map(({ receivedEur }) => receivedEur));
    const rows = [
        ...years.map(({ year, receivedEur }) => ({
            label: year,
            amount: receivedEur,
            bar: "bg-chart-1",
        })),
        { label: "Next 12 months", amount: estimatedEur, bar: "bg-chart-1/40" },
    ];

    return (
        <section className="flex flex-col gap-4">
            <SectionHeading
                label={
                    <>
                        <Money>{formatEur(received, { digits: 0 })}</Money> since {years[0].year}
                    </>
                }
            >
                Dividends
            </SectionHeading>
            <Table className="min-w-120">
                <TableHeader className="sr-only">
                    <TableHead>Year</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-1/2">Compared with the largest</TableHead>
                </TableHeader>
                <tbody>
                    {rows.map(({ label, amount, bar }) => (
                        <TableRow key={label}>
                            <TableCell>{label}</TableCell>
                            <TableCell className="text-right font-bold">
                                <Money>{formatEur(amount, { digits: 0 })}</Money>
                            </TableCell>
                            <TableCell className="w-1/2">
                                <span
                                    aria-hidden="true"
                                    className={`block h-2 ${bar}`}
                                    style={{ width: `${(amount / largest) * 100}%` }}
                                />
                            </TableCell>
                        </TableRow>
                    ))}
                </tbody>
            </Table>
        </section>
    );
}
