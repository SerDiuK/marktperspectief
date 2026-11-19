import { fromMicro, mulDivRound } from "./money";

export type LedgerTrade = {
    id: number;
    instrumentId: string;
    side: "buy" | "sell" | "transfer_in" | "transfer_out";
    date: string;
    micro: number;
    cents: number;
};

export type StockDividend = {
    date: string;
    instrumentId: string;
    micro: number;
};

type Lot = { acquiredOn: string; micro: number; cost: number };

// bought and sold are the cents of the current holding period's trades.
export type Book = {
    lots: Lot[];
    heldSince: string;
    bought: number;
    sold: number;
};

type ClosedPeriod = {
    instrumentId: string;
    from: string;
    to: string;
    bought: number;
    sold: number;
};

export function held(book: Book) {
    return book.lots.reduce((sum, lot) => sum + lot.micro, 0);
}

function addLot(books: Map<string, Book>, instrumentId: string, lot: Lot) {
    const book = books.get(instrumentId);

    if (book?.lots.length) {
        book.lots.push(lot);
        book.bought += lot.cost;
    } else {
        books.set(instrumentId, {
            lots: [lot],
            heldSince: lot.acquiredOn,
            bought: lot.cost,
            sold: 0,
        });
    }
}

function sell(book: Book | undefined, trade: LedgerTrade) {
    if (!book || trade.micro > held(book)) {
        throw new Error(
            `Selling ${fromMicro(trade.micro)} ${trade.instrumentId} on ${trade.date} sells more shares than are held`,
        );
    }

    let remaining = trade.micro;

    while (remaining > 0) {
        const lot = book.lots[0];
        const micro = Math.min(remaining, lot.micro);

        lot.cost -= micro === lot.micro ? lot.cost : mulDivRound(lot.cost, micro, lot.micro);
        lot.micro -= micro;
        remaining -= micro;
        if (lot.micro === 0) book.lots.shift();
    }

    book.sold += trade.cents;
    if (book.lots.length) return;

    const { heldSince, bought, sold } = book;

    return {
        instrumentId: trade.instrumentId,
        from: heldSince,
        to: trade.date,
        bought,
        sold,
    };
}

// Trades come oldest first, as getEffectiveTrades returns them.
export function byDate(trades: LedgerTrade[], stockDividends: StockDividend[]) {
    return [
        ...stockDividends.map((dividend) => ({
            date: dividend.date,
            dividend,
        })),
        ...trades.map((trade) => ({ date: trade.date, trade })),
    ].sort((a, b) => a.date.localeCompare(b.date));
}

// Returns the holding period that a sell of the last shares closes.
export function apply(books: Map<string, Book>, event: ReturnType<typeof byDate>[number]): ClosedPeriod | undefined {
    if ("dividend" in event) {
        const { date, instrumentId, micro } = event.dividend;

        addLot(books, instrumentId, { acquiredOn: date, micro, cost: 0 });
    } else if (event.trade.side === "buy") {
        const { date, instrumentId, micro, cents } = event.trade;

        addLot(books, instrumentId, { acquiredOn: date, micro, cost: cents });
    } else if (event.trade.side === "sell") {
        return sell(books.get(event.trade.instrumentId), event.trade);
    }
}

export function replay(trades: LedgerTrade[], stockDividends: StockDividend[]) {
    const books = new Map<string, Book>();
    const closed: ClosedPeriod[] = [];

    for (const event of byDate(trades, stockDividends)) {
        const period = apply(books, event);

        if (period) closed.push(period);
    }

    return { books, closed };
}
