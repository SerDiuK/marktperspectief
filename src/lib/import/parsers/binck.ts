import Papa from "papaparse";
import { emptyParse, type ParseResult } from "../types";

// The CSV normalised once from Binck's PDF account statements, 2018–2021.
export const BINCK_HEADER =
    "date,binck_nr,kind,isin,name,quantity,price,currency,gross,fees,withholding,withholding_rate,net,order_no,position_after,note";

export function parseBinck(text: string): ParseResult {
    const result = emptyParse();
    const { data } = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
    });

    data.forEach((line, index) => {
        const externalKey = line.binck_nr;
        const origin = {
            source: "binck",
            broker: "binck",
            externalKey,
        } as const;
        const isin = line.isin || null;

        switch (line.kind) {
            case "buy":
            case "sell":
                result.trades.push({
                    ...origin,
                    isin: line.isin,
                    side: line.kind,
                    tradeDate: line.date,
                    quantity: Number(line.quantity),
                    price: Number(line.price),
                    currency: "EUR",
                    feesEur: Number(line.fees),
                    orderRef: line.order_no || null,
                });
                break;
            case "transfer_out":
                result.trades.push({
                    ...origin,
                    isin: line.isin,
                    side: "transfer_out",
                    tradeDate: line.date,
                    quantity: Number(line.quantity),
                    // Binck's average cost; the engine keeps the lots' own costs.
                    price: Number(line.price),
                    currency: "EUR",
                });
                break;
            case "dividend":
            case "lending_dividend":
                result.income.push({
                    ...origin,
                    isin,
                    kind: "dividend",
                    payDate: line.date,
                    amount: Number(line.net),
                    gross: Number(line.gross),
                    currency: "EUR",
                });
                break;
            case "lending_fee":
                result.income.push({
                    ...origin,
                    isin,
                    kind: "lending",
                    payDate: line.date,
                    amount: Number(line.net),
                    currency: "EUR",
                });
                break;
            case "interest":
                result.fees.push({
                    broker: "binck",
                    externalKey,
                    date: line.date,
                    amount: -Number(line.net),
                    currency: "EUR",
                });
                break;
            default:
                result.errors.push(`Line ${index + 2}: unknown kind "${line.kind}"`);
        }
    });

    return result;
}
