import { Change } from "@/components/change";
import { Money } from "@/components/money";
import { InfoTooltip } from "@/components/tooltip";
import type { Range } from "@/lib/dates";
import { formatDate, formatEur, formatPercent, formatPoints } from "@/lib/format";
import type { Portfolio } from "@/lib/portfolio/load";

function Kpi({
    label,
    info,
    value,
    note,
}: {
    label: string;
    info?: React.ReactNode;
    value: React.ReactNode;
    note?: React.ReactNode;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <span className="type-label flex items-center gap-1.5">
                {label}
                {info}
            </span>
            <span className="type-kpi tabular-nums">{value}</span>
            {note && <span className="text-note text-muted-foreground">{note}</span>}
        </div>
    );
}

export function Overview({
    overview,
    asOf,
    range,
}: {
    overview: NonNullable<Portfolio["overview"]>;
    asOf: string;
    range: Range;
}) {
    const returns = overview.returns[range];
    const signed = (amount: number) => <Money>{formatEur(amount, { digits: 0, signed: true })}</Money>;
    const vs = returns.stoxx600Twr === null ? null : returns.twr - returns.stoxx600Twr;
    const parts: [string, number][] = [
        ["Realised", returns.realisedEur],
        ["Unrealised", returns.unrealisedEur],
        ["Dividends", returns.dividendsEur],
        ["Put premiums", returns.premiumsEur],
        ["Fees", -returns.feesEur],
    ];

    return (
        <div className="grid gap-x-6 gap-y-7 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi
                label="Total value"
                value={<Money>{formatEur(overview.valueEur, { digits: 0 })}</Money>}
                note={formatDate(asOf)}
            />
            <Kpi
                label="Total return"
                info={
                    <InfoTooltip label="Total return in parts">
                        {parts.map(([label, amount]) => (
                            <span key={label} className="flex justify-between gap-4">
                                <span className="text-muted-foreground">{label}</span>
                                <span className="font-bold">{signed(amount)}</span>
                            </span>
                        ))}
                    </InfoTooltip>
                }
                value={<Change value={returns.totalEur}>{signed(returns.totalEur)}</Change>}
            />
            <Kpi
                label={returns.annualised ? "Annualised return" : "Return"}
                value={
                    returns.irr === null ? (
                        "—"
                    ) : (
                        <Change value={returns.irr}>{formatPercent(returns.irr, { signed: true })}</Change>
                    )
                }
                note={returns.stoxx600Irr === null ? undefined : `Stoxx 600 ${formatPercent(returns.stoxx600Irr)}`}
            />
            {vs !== null && returns.stoxx600Twr !== null && (
                <Kpi
                    label="Time-weighted"
                    value={<Change value={vs}>{formatPoints(vs, { signed: true })}</Change>}
                    note={`${formatPercent(returns.twr)} vs ${formatPercent(returns.stoxx600Twr)}`}
                />
            )}
            <Kpi
                label="Estimated dividends"
                value={<Money>{formatEur(overview.estimatedDividendsEur, { digits: 0 })}</Money>}
                note={`${formatPercent(overview.estimatedYield)} yield`}
            />
        </div>
    );
}
