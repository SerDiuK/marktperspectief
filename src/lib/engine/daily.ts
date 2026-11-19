import { addDays } from "@/lib/dates";
import { apply, type Book, byDate, held, type LedgerTrade, type StockDividend } from "./ledger";
import { fromMicro } from "./money";
import { applyPut, type PutPosition, type PutTrade, SHARES_PER_CONTRACT } from "./options";
import { asOf, type Point } from "./series";

const isWeekday = (date: string) => {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();

    return day !== 0 && day !== 6;
};

// Everything is in euros: a buy's cents include its fees, a sell's are its
// proceeds after fees, and cash flows are paid to the owner, fees negative.
export function dailySeries({
    trades,
    stockDividends,
    puts,
    cashFlows,
    closes,
    until,
}: {
    trades: LedgerTrade[];
    stockDividends: StockDividend[];
    puts: PutTrade[];
    cashFlows: Point[];
    closes: Map<string, Point[]>;
    until: string;
}) {
    const events = byDate(trades, stockDividends);
    const flows = new Map<string, number>();

    for (const { date, value } of cashFlows) {
        flows.set(date, (flows.get(date) ?? 0) + value);
    }

    const eventDates = new Set([...events.map(({ date }) => date), ...puts.map(({ date }) => date), ...flows.keys()]);

    if (!eventDates.size) return [];

    let date = addDays([...eventDates].sort()[0], -1);

    while (!isWeekday(date)) date = addDays(date, -1);

    const closeOn = (instrumentId: string, day: string) => {
        const close = asOf(closes.get(instrumentId) ?? [], day);

        if (close === undefined) {
            throw new Error(`No price for ${instrumentId} on or before ${day}`);
        }

        return close;
    };
    const books = new Map<string, Book>();
    const openPuts = new Map<string, PutPosition>();
    const rows = [];
    let next = 0;
    let nextPut = 0;
    let previousValue = 0;
    let carried = 0;
    let twrIndex = 1;

    for (; date <= until; date = addDays(date, 1)) {
        if (!isWeekday(date) && !eventDates.has(date)) continue;

        let inflowCents = 0;
        let outflowCents = flows.get(date) ?? 0;

        while (next < events.length && events[next].date <= date) {
            const event = events[next++];

            apply(books, event);

            if ("trade" in event && event.trade.side === "buy") {
                inflowCents += event.trade.cents;
            } else if ("trade" in event && event.trade.side === "sell") {
                outflowCents += event.trade.cents;
            }
        }

        while (nextPut < puts.length && puts[nextPut].date <= date) {
            const put = puts[nextPut++];

            applyPut(openPuts, put);
            if (put.side === "sell") outflowCents += put.cents;
            if (put.side === "buy") inflowCents += put.cents;
        }

        let valueCents = 0;

        for (const [instrumentId, book] of books) {
            if (!book.lots.length) continue;

            const close = closeOn(instrumentId, date);

            valueCents += Math.round(fromMicro(held(book)) * close * 100);
        }

        for (const { instrumentId, strike, open } of openPuts.values()) {
            if (!open) continue;

            const inTheMoney = Math.max(0, strike - closeOn(instrumentId, date));

            valueCents -= Math.round(inTheMoney * SHARES_PER_CONTRACT * open * 100);
        }

        const out = outflowCents + carried;
        const base = previousValue + inflowCents;

        if (base === 0) {
            carried = out;
        } else {
            carried = 0;
            twrIndex *= (valueCents + out) / base;
        }

        previousValue = valueCents;
        rows.push({
            date,
            valueCents,
            inflowCents,
            outflowCents,
            twrIndex,
        });
    }

    return rows;
}
