export const SHARES_PER_CONTRACT = 100;

// cents is the premium after fees, received on a sell and paid on a buy;
// an assignment or an expiry closes contracts for nothing.
export type PutTrade = {
    instrumentId: string;
    strike: number;
    expiry: string;
    side: "sell" | "buy" | "assigned" | "expired";
    date: string;
    contracts: number;
    cents: number;
};

export type PutPosition = {
    instrumentId: string;
    strike: number;
    expiry: string;
    opened: string;
    closed: string | null;
    outcome: "open" | "bought back" | "assigned" | "expired";
    sold: number;
    open: number;
    premium: number;
};

const outcomes = {
    buy: "bought back",
    assigned: "assigned",
    expired: "expired",
} as const;

export function applyPut(puts: Map<string, PutPosition>, trade: PutTrade) {
    const key = `${trade.instrumentId}|${trade.strike}|${trade.expiry}`;
    const put: PutPosition = puts.get(key) ?? {
        instrumentId: trade.instrumentId,
        strike: trade.strike,
        expiry: trade.expiry,
        opened: trade.date,
        closed: null,
        outcome: "open",
        sold: 0,
        open: 0,
        premium: 0,
    };

    if (trade.side === "sell") {
        put.sold += trade.contracts;
        put.open += trade.contracts;
        put.premium += trade.cents;
        put.outcome = "open";
        put.closed = null;
    } else {
        put.open -= trade.contracts;
        if (trade.side === "buy") put.premium -= trade.cents;

        if (put.open === 0) {
            put.outcome = outcomes[trade.side];
            put.closed = trade.date;
        }
    }

    puts.set(key, put);
}

// Trades come oldest first.
export function putPositions(trades: PutTrade[]) {
    const puts = new Map<string, PutPosition>();

    for (const trade of trades) applyPut(puts, trade);

    return [...puts.values()];
}
