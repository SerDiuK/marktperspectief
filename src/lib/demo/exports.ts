import { addDays } from "@/lib/dates";
import { DEGIRO_ACCOUNT_HEADER, DEGIRO_TRANSACTIONS_HEADER } from "@/lib/import/parsers/degiro";
import { type DemoInstrumentId, demoInstruments, demoPuts, demoTrades, monthlyBuy, putCode } from "./plan";

type Close = { date: string; close: number };

export type DemoMarket = {
    closes: Map<string, Close[]>;
    dividends: Map<string, { exDate: string; amount: number }[]>;
    usdPerEur: Close[];
};

type Row = {
    date: string;
    time: string;
    id: DemoInstrumentId;
    quantity: number;
    price: number;
    order: boolean;
};

const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const round = (value: number) => Math.round(value * 100) / 100;
const instrument = (id: DemoInstrumentId) => demoInstruments.find((row) => row.id === id)!;

// DEGIRO writes 25-07-2022 and "1234,56".
const day = (date: string) => date.split("-").reverse().join("-");
const number = (value: number, digits = 2) => `"${value.toFixed(digits).replace(".", ",")}"`;

function lastOnOrBefore(series: Close[], date: string) {
    return series.findLast((close) => close.date <= date);
}

function firstOnOrAfter(series: Close[], date: string) {
    return series.find((close) => close.date >= date);
}

function monthStarts(from: string, today: string) {
    const dates: string[] = [];

    for (let date = from; date <= today; ) {
        dates.push(date);

        const next = new Date(`${date}T00:00:00Z`);

        next.setUTCMonth(next.getUTCMonth() + 1);
        date = next.toISOString().slice(0, 10);
    }

    return dates;
}

function nextWeekday(date: string) {
    const weekend = new Date(`${date}T00:00:00Z`).getUTCDay();

    return weekend === 6 ? addDays(date, 2) : weekend === 0 ? addDays(date, 1) : date;
}

function orderFee(id: DemoInstrumentId, date: string, value: number) {
    const before2023 = date < "2023-01-01";

    if (id === monthlyBuy.id) return before2023 ? 0 : 1;
    if (instrument(id).currency === "USD") return before2023 ? 0.5 : 2;

    return before2023 ? round(2 + value * 0.0003) : 3;
}

export function demoExports(market: DemoMarket, today: string) {
    const closesOf = (id: DemoInstrumentId) => market.closes.get(id) ?? [];
    const fill = (id: DemoInstrumentId, date: string, index: number) => {
        const close = firstOnOrAfter(closesOf(id), date);

        if (!close || close.date > today) return undefined;

        const nudge = 1 + (((index * 37) % 11) - 5) / 1000;
        const minute = String((index * 13) % 60).padStart(2, "0");
        const hour = instrument(id).currency === "USD" ? 15 + (index % 4) : 9 + (index % 7);

        return {
            date: close.date,
            time: `${String(hour).padStart(2, "0")}:${minute}`,
            price: round(close.close * nudge),
        };
    };

    const stockRows: Row[] = [];
    const putRows: string[][] = [];

    monthStarts(monthlyBuy.from, today).forEach((date, index) => {
        const filled = fill(monthlyBuy.id, date, index);

        if (filled) {
            stockRows.push({
                ...filled,
                id: monthlyBuy.id,
                quantity: Math.floor(monthlyBuy.euros / filled.price),
                order: true,
            });
        }
    });

    demoTrades.forEach(({ date, id, quantity }, index) => {
        const filled = fill(id, date, index + 100);

        if (filled) stockRows.push({ ...filled, id, quantity, order: true });
    });

    demoPuts.forEach(({ date, outOfTheMoney, premium, expiry }, index) => {
        const sold = fill("heineken", date, index + 200);

        if (!sold) return;

        const strike = Math.floor(sold.price * (1 - outOfTheMoney));
        const [year, month, dayOfMonth] = expiry.split("-");
        const product = `${putCode} P${strike.toFixed(2)} ${dayOfMonth}${months[Number(month) - 1]}${year.slice(2)}`;
        const isin = `NLEN${String(9_100_000 + index).padStart(8, "0")}`;
        const put = (date: string, time: string, quantity: number, price: number, fee: number, order: string) => [
            day(date),
            time,
            product,
            isin,
            "LFF",
            order ? "XEUE" : "",
            String(quantity),
            number(price, 4),
            "EUR",
            number(-quantity * price * 100),
            "EUR",
            number(-quantity * price * 100),
            number(0, 4),
            number(0),
            fee ? number(-fee) : "",
            number(-quantity * price * 100 - fee),
            order,
        ];

        putRows.push(put(sold.date, sold.time, -1, premium, 0.75, `demo-put-${index + 1}`));

        const settled = lastOnOrBefore(closesOf("heineken"), expiry);

        if (expiry > today || !settled) return;

        putRows.push(put(expiry, "00:00", 1, 0, 0, ""));

        if (settled.close < strike) {
            stockRows.push({ date: expiry, time: "00:00", id: "heineken", quantity: 100, price: strike, order: false });
        }
    });

    stockRows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    const account: string[][] = [];
    const accountLine = (date: string, valueDate: string, cells: string[]) =>
        account.push([day(date), "07:30", day(valueDate), ...cells]);

    const transactions = stockRows.map((row, index): string[] => {
        const { currency, product, isin, exchange, venue } = instrument(row.id);
        const local = -row.quantity * row.price;
        const rate = currency === "USD" ? (lastOnOrBefore(market.usdPerEur, row.date)?.close ?? 1) : 1;
        const euros = round(local / rate);
        const autoFx = currency === "USD" ? round(Math.abs(euros) * 0.0025) : 0;
        const fee = row.order ? orderFee(row.id, row.date, Math.abs(euros)) : 0;
        const order = row.order ? `demo-order-${index + 1}` : "";

        if (isin.startsWith("FR") && row.quantity > 0 && row.order) {
            const tax = round(Math.abs(euros) * (row.date < "2025-04-01" ? 0.003 : 0.004));

            accountLine(addDays(row.date, 2), row.date, [
                product,
                isin,
                "Impuesto de transacción Francés",
                "",
                "EUR",
                number(-tax),
                "",
                "",
                "",
            ]);
        }

        return [
            day(row.date),
            row.time,
            product,
            isin,
            exchange,
            row.order ? venue : "",
            String(row.quantity),
            number(row.price, 4),
            currency,
            number(local),
            currency,
            number(euros),
            number(currency === "USD" ? rate : 0, 4),
            number(-autoFx),
            fee ? number(-fee) : "",
            number(euros - autoFx - fee),
            order,
        ];
    });

    for (const { id, currency, product, isin, withholding } of demoInstruments) {
        for (const { exDate, amount } of market.dividends.get(id) ?? []) {
            const shares = stockRows
                .filter((row) => row.id === id && row.date < exDate)
                .reduce((sum, row) => sum + row.quantity, 0);
            const payDate = nextWeekday(addDays(exDate, 21));

            if (!shares || payDate > today) continue;

            const gross = round(shares * amount);
            const line = (description: string, change: number) =>
                accountLine(payDate, payDate, [product, isin, description, "", currency, number(change), "", "", ""]);

            line("Dividendo", gross);
            if (withholding) line("Retención del dividendo", -round(gross * withholding));
        }
    }

    const firstYear = Number(stockRows[0]?.date.slice(0, 4) ?? today.slice(0, 4));

    for (let year = firstYear; year <= Number(today.slice(0, 4)); year++) {
        const charged = nextWeekday(`${year}-02-20`);
        const held = (id: DemoInstrumentId) =>
            stockRows.some((row) => row.id === id && row.date.startsWith(String(year))) ||
            stockRows
                .filter((row) => row.id === id && row.date < `${year}`)
                .reduce((sum, row) => sum + row.quantity, 0) > 0;
        const markets = new Set<string>(demoInstruments.filter(({ id }) => held(id)).map(({ market }) => market));

        if (charged > today) continue;
        if (putRows.some((row) => row[0].endsWith(String(year)))) markets.add("Euronext Derivatives - LFF");

        for (const name of [...markets].sort()) {
            accountLine(charged, `${year}-01-31`, [
                "",
                "",
                `Comisión de conectividad con el mercado ${year} (${name})`,
                "",
                "EUR",
                number(-2.5),
                "",
                "",
                "",
            ]);
        }
    }

    const newestFirst = (rows: string[][]) =>
        rows
            .map((cells) => ({ key: `${day(cells[0])} ${cells[1]}`, line: cells.join(",") }))
            .sort((a, b) => b.key.localeCompare(a.key))
            .map(({ line }) => line);

    return {
        transactions: [DEGIRO_TRANSACTIONS_HEADER, ...newestFirst([...transactions, ...putRows])].join("\n"),
        account: [DEGIRO_ACCOUNT_HEADER, ...newestFirst(account)].join("\n"),
    };
}
