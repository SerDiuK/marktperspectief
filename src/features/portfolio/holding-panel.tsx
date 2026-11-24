import { Change } from "@/components/change";
import { Clamp } from "@/components/clamp";
import { Money } from "@/components/money";
import {
    formatDate,
    formatEur,
    formatListing,
    formatMonthRange,
    formatPercent,
    formatPrice,
    formatShares,
} from "@/lib/format";
import type { Holding } from "@/lib/portfolio/holding";
import { HoldingAsk } from "./holding-ask";
import { HoldingChart } from "./holding-chart";
import { HoldingType } from "./holding-type";

type Entry = Holding["entries"][number];

const kinds: Record<Entry["kind"], string> = {
    buy: "Buy",
    sell: "Sell",
    transfer_in: "Transfer in",
    transfer_out: "Transfer out",
    stock_dividend: "Stock dividend",
    dividend: "Dividend",
};

const brokers: Record<Entry["broker"], string> = {
    binck: "Binck",
    degiro: "DEGIRO",
    saxo: "Saxo",
};

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex min-w-0 flex-col gap-1.5 border-t border-input pt-2.5">
            <dt className="type-label">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{children}</dd>
        </div>
    );
}

export function HoldingPanel({
    holding: { instrumentId, name, symbol, currency, closes, entries, position, periods },
    askable,
}: {
    holding: Holding;
    askable: boolean;
}) {
    const listing = formatListing(symbol);
    const last = closes.at(-1);
    const previous = closes.at(-2);
    const priced = closes.length > 1;
    const trades = entries.flatMap(({ date, kind, price }) =>
        (kind === "buy" || kind === "sell") && price !== null ? [{ date, side: kind, price }] : [],
    );
    const realised = periods.reduce((sum, { realisedEur }) => sum + realisedEur, 0);
    const thesis = position?.thesis;
    const details = (
        <>
            {last && (
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border-t-2 border-foreground pt-3.5">
                    <span className="type-kpi tabular-nums">{formatPrice(last.close, currency)}</span>
                    {previous && (
                        <span className="font-semibold tabular-nums">
                            <Change value={last.close - previous.close}>
                                {formatPercent(last.close / previous.close - 1, {
                                    digits: 2,
                                    signed: true,
                                })}
                            </Change>
                        </span>
                    )}
                </div>
            )}
            {priced && (
                <div className="shrink-0">
                    <HoldingChart name={name} currency={currency} closes={closes} trades={trades} />
                </div>
            )}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4.5 sm:grid-cols-3">
                {position ? (
                    <>
                        <Stat label="Value">
                            {position.valueEur === null ? (
                                "—"
                            ) : (
                                <Money>{formatEur(position.valueEur, { digits: 0 })}</Money>
                            )}
                        </Stat>
                        <Stat label="Shares">
                            <Money>{formatShares(position.shares)}</Money>
                        </Stat>
                        <Stat label="Avg cost">{formatPrice(position.avgPrice, currency)}</Stat>
                        <Stat label="Unrealised">
                            {position.unrealisedEur === null || position.unrealisedPct === null ? (
                                "—"
                            ) : (
                                <Change value={position.unrealisedEur}>
                                    <Money>{formatEur(position.unrealisedEur, { digits: 0, signed: true })}</Money>{" "}
                                    {formatPercent(position.unrealisedPct, { signed: true })}
                                </Change>
                            )}
                        </Stat>
                        <Stat label="Weight">{position.weight === null ? "—" : formatPercent(position.weight)}</Stat>
                        <Stat label="Est. dividend">
                            {position.estimatedDividendEur ? (
                                <Money>{formatEur(position.estimatedDividendEur, { digits: 0 })}</Money>
                            ) : (
                                "—"
                            )}
                        </Stat>
                    </>
                ) : (
                    <>
                        <Stat label="Realised">
                            <Change value={realised}>
                                <Money>{formatEur(realised, { digits: 0, signed: true })}</Money>
                            </Change>
                        </Stat>
                        <Stat label="Held">
                            {periods.map(({ from, to }) => (
                                <span key={from} className="block">
                                    {formatMonthRange(from, to)}
                                </span>
                            ))}
                        </Stat>
                    </>
                )}
            </dl>
            {thesis && (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                        <h3>
                            <HoldingType type={thesis.type} size="large" />
                        </h3>
                        <span className="type-label">{formatDate(thesis.date)}</span>
                    </div>
                    <Clamp>{thesis.reason}</Clamp>
                    {thesis.pillars.length > 0 && (
                        <table className="w-full text-note">
                            <thead className="type-label text-left">
                                <tr>
                                    <th className="w-1/2 pb-2 font-semibold">Pillar</th>
                                    <th className="w-1/2 pb-2 pl-3 font-semibold">Wrong if</th>
                                </tr>
                            </thead>
                            <tbody>
                                {thesis.pillars.map(({ claim, wrongIf }) => (
                                    <tr key={claim} className="border-t align-top">
                                        <td className="py-2.5">{claim}</td>
                                        <td className="py-2.5 pl-3 text-muted-foreground">{wrongIf}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
            <div className="flex min-h-60 flex-1 flex-col gap-2">
                <h3 className="type-subsection">Transactions</h3>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    <table className="w-full text-note tabular-nums">
                        <thead className="sr-only">
                            <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Shares and price</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((entry, index) => (
                                <tr key={`${entry.date}-${index}`} className="border-t">
                                    <td className="py-2.5 text-muted-foreground">
                                        {formatDate(entry.date)}
                                        <span className="block text-xs">{brokers[entry.broker]}</span>
                                    </td>
                                    <td
                                        className={`py-2.5 pl-3 font-semibold ${entry.kind === "buy" ? "text-foreground" : "text-muted-foreground"}`}
                                    >
                                        {kinds[entry.kind]}
                                    </td>
                                    <td className="py-2.5 pl-3 text-right">
                                        {entry.shares !== null && <Money>{formatShares(entry.shares)}</Money>}
                                        {entry.price !== null && ` × ${formatPrice(entry.price, currency)}`}
                                    </td>
                                    <td className="py-2.5 pl-3 text-right font-bold">
                                        {entry.eur !== null && <Money>{formatEur(entry.eur)}</Money>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );

    const title = (
        <div className="flex min-w-0 flex-1 flex-col gap-2">
            {listing && <span className="type-label">{listing}</span>}
            <h2 className="type-section">{name}</h2>
        </div>
    );

    return askable ? (
        <HoldingAsk title={title} instrumentId={instrumentId} name={name} hasThesis={Boolean(thesis)}>
            {details}
        </HoldingAsk>
    ) : (
        <>
            <div className="flex pr-12">{title}</div>
            {details}
        </>
    );
}
