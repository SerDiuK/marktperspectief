import { emptyParse, type ParseResult } from "../types";

export const SAXO_TRANSACTIONS_HEADER =
    "Gebruikersnaam,Transactiedatum,Valutadatum,Type,Instrument,Instrument ISIN,Instrumentvaluta,Uitwisselingsbeschrijving,Instrumentsymbool,Acties,Boekingsbedrag,Order-ID,Omrekeningskoers,From Derivative,Underlying asset type";

const TRADE = /^(Koop|Verkoop|Transfer in) (-?\d+) @ (\d+(?:\.\d+)?) EUR$/;

const sides = {
    Koop: "buy",
    Verkoop: "sell",
    "Transfer in": "transfer_in",
} as const;

const cashLines: Record<string, "net dividend" | "dividend" | "fee"> = {
    Cashdividend: "net dividend",
    Kapitaaluitkering: "dividend",
    Keuzedividend: "dividend",
    Herbeleggingsdividend: "dividend",
    Bonusuitgifte: "fee",
    Afsplitsing: "fee",
    "Corporate actions - Fracties": "fee",
    "Debetrente, creditrente en/of bewaarrente": "fee",
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export function parseSaxoTransactions(rows: unknown[][]): ParseResult {
    const result = emptyParse();
    const occurrences = new Map<string, number>();
    const keyed = (key: string) => {
        const occurrence = occurrences.get(key) ?? 0;

        occurrences.set(key, occurrence + 1);

        return `${key}:${occurrence}`;
    };

    rows.slice(1).forEach((cells, index) => {
        const [, date, valueDate, type, , isin, , , , action, booked, orderId] = cells;

        if (type === "Storting/opname") return;

        if (type !== "Transactie") {
            const line = cashLines[String(action)];

            if (!line || !(date instanceof Date) || !(valueDate instanceof Date)) {
                result.errors.push(`Row ${index + 2}: unknown line "${action}"`);

                return;
            }

            const amount = Number(booked);

            if (!amount) return;

            const payDate = isoDate(valueDate);
            const externalKey = keyed(`${isoDate(date)}|${payDate}|${isin || ""}|${action}|${amount}`);

            if (line === "fee") {
                result.fees.push({
                    broker: "saxo",
                    externalKey,
                    date: payDate,
                    amount: -amount,
                    currency: "EUR",
                });
            } else {
                result.income.push({
                    source: "saxo",
                    broker: "saxo",
                    externalKey,
                    isin: isin ? String(isin) : null,
                    kind: "dividend",
                    payDate,
                    amount,
                    gross: line === "dividend" ? amount : null,
                    currency: "EUR",
                });
            }

            return;
        }

        const match = TRADE.exec(String(action));

        if (!match || !(date instanceof Date)) {
            result.errors.push(`Row ${index + 2}: unreadable trade "${action}"`);

            return;
        }

        const [, verb, quantityText, priceText] = match;
        const side = sides[verb as keyof typeof sides];
        const quantity = Math.abs(Number(quantityText));
        const price = Number(priceText);
        const tradeDate = isoDate(date);
        const total = Math.abs(Number(booked));

        result.trades.push({
            source: "saxo",
            broker: "saxo",
            externalKey: keyed(`${orderId}|${tradeDate}|${isin}|${quantity}|${price}`),
            isin: String(isin),
            side,
            tradeDate,
            quantity,
            price,
            currency: "EUR",
            ...(side !== "transfer_in" && {
                feesEur: Math.round(Math.abs(total - quantity * price) * 100) / 100,
            }),
            orderRef: String(orderId),
        });
    });

    return result;
}
