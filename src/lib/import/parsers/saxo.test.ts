import { expect, it } from "vitest";
import { parseSaxoTransactions, SAXO_TRANSACTIONS_HEADER } from "./saxo";

const day = (date: string) => new Date(`${date}T00:00:00Z`);

const row = (
    date: string,
    type: string,
    isin: string,
    action: string,
    booked: number,
    orderId: string,
    valueDate = date,
) => [
    "10000001",
    day(date),
    day(valueDate),
    type,
    "Instrument",
    isin,
    "EUR",
    "Euronext Amsterdam",
    "SYM:xams",
    action,
    booked,
    orderId,
    1,
    "No",
    null,
];

const rows = [
    SAXO_TRANSACTIONS_HEADER.split(","),
    row("2022-03-08", "Transactie", "NL0013654783", "Koop 15 @ 61.40 EUR", -926.0, "5001"),
    row("2021-11-23", "Transactie", "GB00B03MLX29", "Verkoop -120 @ 17.85 EUR", 2137.0, "5002"),
    row("2021-10-07", "Transactie", "GB00B03MLX29", "Transfer in 400 @ 15.20 EUR", 0, "4900"),
    row("2021-10-07", "Transactie", "NL0013654783", "Transfer in 60 @ 79.10 EUR", 0, "4900"),
    row("2021-12-20", "Corporate action", "GB00B03MLX29", "Herbeleggingsdividend", 12.4, "5003"),
    row("2022-04-04", "Transactie", "US5949181045", "Koop 8 @ 131.00 USD", -1048, "5004"),
];

it("maps Saxo's trades and transfers in, and rejects a trade in another currency", () => {
    const { trades, errors } = parseSaxoTransactions(rows);

    expect(trades).toMatchObject([
        { side: "buy", tradeDate: "2022-03-08", quantity: 15, price: 61.4 },
        { side: "sell", quantity: 120 },
        { side: "transfer_in", quantity: 400 },
        { side: "transfer_in", quantity: 60 },
    ]);
    expect(errors).toEqual([expect.stringMatching(/^Row 7\b/)]);
});

it("keys each trade the same way whatever order the export lists it in", () => {
    const keyed = (input: unknown[][]) =>
        new Map(parseSaxoTransactions(input).trades.map((trade) => [trade.externalKey, trade.isin]));
    const reversed = keyed([rows[0], ...rows.slice(1).reverse()]);

    expect(reversed).toEqual(keyed(rows));
    expect(reversed.size).toBe(4);
});

it("books each of Saxo's cash lines on its value date, a cash dividend as net, and fractions and interest as fees", () => {
    const { income, fees, errors } = parseSaxoTransactions([
        rows[0],
        row("2024-06-12", "Corporate action", "FR0000121014", "Cashdividend", 96, ""),
        row("2024-12-03", "Corporate action", "FR0000121014", "Cashdividend", 0.05, "", "2024-06-12"),
        row("2022-10-04", "Corporate action", "NL0013654783", "Kapitaaluitkering", 9.6, ""),
        row("2022-06-08", "Cashbedrag", "FR0014008VX5", "Corporate actions - Fracties", 1.74, ""),
        row("2025-01-31", "Cashbedrag", "", "Debetrente, creditrente en/of bewaarrente", -4.12, ""),
        row("2025-03-01", "Storting/opname", "", "Storting", 1000, ""),
        row("2025-03-02", "Corporate action", "NL0013654783", "Claimemissie", 0, ""),
    ]);

    expect(income).toMatchObject([
        { payDate: "2024-06-12", amount: 96, gross: null },
        { payDate: "2024-06-12", amount: 0.05, gross: null },
        { payDate: "2022-10-04", amount: 9.6, gross: 9.6 },
    ]);
    expect(fees).toMatchObject([{ amount: -1.74 }, { amount: 4.12 }]);
    expect(errors).toEqual([expect.stringMatching(/^Row 8\b.*Claimemissie/)]);
});
