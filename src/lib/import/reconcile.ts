import type { transactions } from "@/db/schema";
import { addDays } from "@/lib/dates";

type Trade = Pick<
    typeof transactions.$inferInsert,
    "source" | "broker" | "externalKey" | "instrumentId" | "side" | "tradeDate" | "quantity" | "price" | "orderRef"
>;

const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

export function planSupersede(chat: Trade[], brokerTrades: Trade[], taken: Set<string>) {
    const orders = new Map<string, Trade & { key: string; volume: number }>();

    for (const trade of brokerTrades) {
        if (trade.side !== "buy" && trade.side !== "sell") continue;

        const key = `${trade.source}:${trade.orderRef ?? trade.externalKey}`;
        const order = orders.get(key);

        if (order) {
            order.quantity += trade.quantity;
            order.volume += trade.quantity * trade.price;
        } else {
            orders.set(key, {
                ...trade,
                key,
                volume: trade.quantity * trade.price,
            });
        }
    }

    const used = new Set(taken);
    const plan = new Map<string, string>();
    const byDate = [...chat].sort(
        (a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.externalKey.localeCompare(b.externalKey),
    );

    for (const trade of byDate) {
        const [match] = [...orders.values()]
            .filter(
                (order) =>
                    !used.has(order.key) &&
                    order.broker === trade.broker &&
                    order.instrumentId === trade.instrumentId &&
                    order.side === trade.side &&
                    Math.abs(order.quantity - trade.quantity) < 1e-6 &&
                    days(order.tradeDate, trade.tradeDate) <= 3 &&
                    Math.abs(order.volume / order.quantity / trade.price - 1) <= 0.02,
            )
            .sort((a, b) => days(a.tradeDate, trade.tradeDate) - days(b.tradeDate, trade.tradeDate));

        if (!match) continue;
        used.add(match.key);
        plan.set(trade.externalKey, match.key);
    }

    return plan;
}

export function unpaired(chat: Trade[], fileTrades: Pick<Trade, "broker" | "tradeDate">[], plan: Map<string, string>) {
    const spans = new Map<string, { from: string; to: string }>();

    for (const { broker, tradeDate } of fileTrades) {
        const span = spans.get(broker) ?? { from: tradeDate, to: tradeDate };

        spans.set(broker, {
            from: tradeDate < span.from ? tradeDate : span.from,
            to: tradeDate > span.to ? tradeDate : span.to,
        });
    }

    return chat.filter(({ broker, tradeDate, externalKey }) => {
        const span = spans.get(broker);

        return span && !plan.has(externalKey) && tradeDate >= span.from && addDays(tradeDate, 3) < span.to;
    });
}
