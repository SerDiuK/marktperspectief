import Papa from "papaparse";
import { currencies } from "@/db/schema";
import { toCents } from "@/lib/engine/money";
import { emptyParse, type ParseResult } from "../types";

export const DEGIRO_TRANSACTIONS_HEADER =
    "Date,Time,Product,ISIN,Reference exchange,Venue,Quantity,Price,,Local value,,Value EUR,Exchange rate,AutoFX Fee,Transaction and/or third party fees EUR,Total EUR,Order ID";
export const DEGIRO_ACCOUNT_HEADER = "Date,Time,Value date,Product,ISIN,Description,FX,Change,,Balance,,Order Id";

const amount = (value: string) => Number(value.replace(",", "."));
const isoDate = (date: string) => date.split("-").reverse().join("-");

const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
// An option as DEGIRO names it: "HEI P70.00 20DEC24".
const optionName = new RegExp(`^(\\S+) ([PC])(\\d+(?:\\.\\d+)?) (\\d{2})(${months.join("|")})(\\d{2})$`);

function toRow(cells: string[], index: number) {
    const [
        date,
        time,
        product,
        isin,
        exchange,
        ,
        quantity,
        price,
        currency,
        localValue,
        ,
        ,
        ,
        autoFx,
        fees,
        ,
        orderId,
    ] = cells;

    return {
        line: index + 2,
        date: isoDate(date),
        time,
        product,
        isin,
        exchange,
        quantity: amount(quantity),
        price: amount(price),
        currency,
        localValue: amount(localValue),
        feesEur: Math.abs(amount(autoFx)) + Math.abs(amount(fees)),
        orderId,
    };
}

type Row = ReturnType<typeof toRow>;

function nonCashPairs(rows: Row[]) {
    const groups = Map.groupBy(
        rows.filter(({ orderId }) => !orderId),
        ({ date, time, quantity, price }) => `${date}|${time}|${Math.abs(quantity)}|${price}`,
    );

    return new Set(
        [...groups.values()].filter((group) => group.length === 2 && group[0].quantity === -group[1].quantity).flat(),
    );
}

const rowKey = (row: Row) => `${row.orderId}|${row.date}|${row.time}|${row.quantity}|${row.price}`;

// Identical rows, such as two fills of one order, get their own keys.
function externalKeys() {
    const occurrences = new Map<string, number>();

    return (key: string) => {
        const occurrence = occurrences.get(key) ?? 0;

        occurrences.set(key, occurrence + 1);

        return `${key}:${occurrence}`;
    };
}

function readPut(row: Row, stockRows: Row[]) {
    const match = optionName.exec(row.product);

    if (!match) return `Line ${row.line}: unknown option ${row.product}`;

    const [, optionCode, right, strike, day, month, year] = match;

    if (right !== "P") return `Line ${row.line}: only puts are read`;
    if (row.currency !== "EUR") return `Line ${row.line}: only euro puts are read`;

    const contracts = Math.abs(row.quantity);

    if (toCents(Math.abs(row.localValue)) !== toCents(contracts * row.price * 100)) {
        return `Line ${row.line}: ${row.product} is not 100 shares a contract`;
    }

    const assigned = stockRows.some(
        (stock) => stock.date === row.date && stock.quantity === contracts * 100 && stock.price === Number(strike),
    );
    const side: ParseResult["puts"][number]["side"] =
        row.quantity < 0 ? "sell" : row.price > 0 ? "buy" : assigned ? "assigned" : "expired";

    return {
        optionCode,
        strike: Number(strike),
        expiry: `20${year}-${String(months.indexOf(month) + 1).padStart(2, "0")}-${day}`,
        side,
        contracts,
    };
}

export function parseDegiroTransactions(text: string): ParseResult {
    const result = emptyParse();
    const [, ...lines] = Papa.parse<string[]>(text, {
        skipEmptyLines: true,
    }).data;
    const rows = lines.map(toRow);
    const stockRows = rows.filter(({ exchange, price }) => exchange !== "LFF" && price !== 0);
    const pairs = nonCashPairs(stockRows);
    const tradeKey = externalKeys();
    const putKey = externalKeys();

    for (const row of stockRows) {
        if (pairs.has(row)) continue;

        const currency = currencies.find((code) => code === row.currency);

        if (!currency) {
            result.errors.push(`Line ${row.line}: unknown currency ${row.currency}`);
            continue;
        }

        result.trades.push({
            source: "degiro",
            broker: "degiro",
            externalKey: tradeKey(rowKey(row)),
            isin: row.isin,
            side: row.quantity > 0 ? "buy" : "sell",
            tradeDate: row.date,
            tradeTime: row.time,
            quantity: Math.abs(row.quantity),
            price: row.price,
            currency,
            feesEur: row.feesEur,
            orderRef: row.orderId || null,
        });
    }

    for (const row of rows.filter(({ exchange }) => exchange === "LFF")) {
        const put = readPut(row, stockRows);

        if (typeof put === "string") {
            result.errors.push(put);
            continue;
        }

        result.puts.push({
            ...put,
            broker: "degiro",
            externalKey: putKey(rowKey(row)),
            tradeDate: row.date,
            premium: row.price,
            feesEur: row.feesEur,
        });
    }

    return result;
}

type CashLine = "dividend" | "withholding" | "lending" | "fee";

const skipped = [
    /^(?:[^:]+: ?)?(?:Compra|Venta) /,
    /^Transferir (?:a|desde) su Cuenta de Efectivo /,
    /^(?:Degiro Cash Sweep Transfer|flatex Deposit|flatex Withdrawal|Processed Flatex Withdrawal|Ingreso|Ingreso Cambio de Divisa|Retirada Cambio de Divisa)$/,
];
const TRADE_COSTS = "Costes de transacción y/o externos de DEGIRO";

const cashLines: Record<string, CashLine> = {
    Dividendo: "dividend",
    "Corrección del dividendo": "dividend",
    "Retención del dividendo": "withholding",
    "Impuesto de transacción Francés": "fee",
    "Acciones corporativas liquidación por diferencias": "fee",
    "Comisión de Ejercicio de Opciones o Futuros": "fee",
    "Compensación DEGIRO": "fee",
    "Promoción DEGIRO reembolso": "fee",
    Interés: "fee",
    "Flatex Interest": "fee",
    "Flatex Interest Income": "fee",
};

function cashLine(description: string): CashLine | undefined {
    if (description.startsWith("Comisión de conectividad con el mercado ")) {
        return "fee";
    }

    if (description.startsWith("Ingresos por Préstamo de Valores")) {
        return "lending";
    }

    return cashLines[description];
}

export function parseDegiroAccount(text: string): ParseResult {
    const result = emptyParse();
    const [, ...lines] = Papa.parse<string[]>(text, {
        skipEmptyLines: true,
    }).data;
    const rows: {
        line: number;
        date: string;
        time: string;
        valueDate: string;
        isin: string;
        description: string;
        currency: string;
        change: string;
        orderId: string;
    }[] = [];

    lines.forEach((cells, index) => {
        const [date, time, valueDate, , isin, description, , currency, change, , , orderId] = cells;
        const previous = rows.at(-1);

        if (!date && previous) {
            previous.description += ` ${description}`;

            return;
        }

        rows.push({
            line: index + 2,
            date,
            time,
            valueDate: isoDate(valueDate),
            isin,
            description,
            currency,
            change,
            orderId,
        });
    });

    const lineKey = externalKeys();

    for (const row of rows) {
        if (skipped.some((pattern) => pattern.test(row.description))) continue;
        if (row.orderId && row.description === TRADE_COSTS) continue;

        const line = cashLine(row.description);

        if (!line) {
            result.errors.push(`Line ${row.line}: unknown line "${row.description}"`);
            continue;
        }

        const currency = currencies.find((code) => code === row.currency);

        if (!currency) {
            result.errors.push(`Line ${row.line}: unknown currency ${row.currency}`);
            continue;
        }

        const change = amount(row.change);

        if (!change) continue;

        const externalKey = lineKey(
            `${row.date}|${row.time}|${row.valueDate}|${row.isin}|${row.description}|${currency}|${row.change}`,
        );
        const origin = { source: "degiro", broker: "degiro", externalKey } as const;

        if (line === "dividend" || line === "withholding") {
            result.income.push({
                ...origin,
                isin: row.isin,
                kind: "dividend",
                payDate: row.valueDate,
                amount: change,
                gross: line === "dividend" ? change : 0,
                currency,
            });
        } else if (line === "lending") {
            result.income.push({
                ...origin,
                isin: null,
                kind: "lending",
                payDate: row.valueDate,
                amount: change,
                currency,
            });
        } else {
            result.fees.push({
                broker: "degiro",
                externalKey,
                date: row.valueDate,
                amount: -change,
                currency,
            });
        }
    }

    return result;
}
