const dateFormat = new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
});
const monthFormat = new Intl.DateTimeFormat("en-IE", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
});

// Takes a stored YYYY-MM-DD date.
export function formatDate(date: string) {
    return dateFormat.format(new Date(`${date}T00:00:00Z`));
}

function formatMonth(date: string) {
    return monthFormat.format(new Date(`${date}T00:00:00Z`));
}

export function formatMonthRange(from: string, to: string) {
    const start = formatMonth(from);
    const end = formatMonth(to);

    return start === end ? start : `${start} – ${end}`;
}

const numberFormats = new Map<string, Intl.NumberFormat>();

function numberFormat(options: Intl.NumberFormatOptions) {
    const key = JSON.stringify(options);
    const cached = numberFormats.get(key);

    if (cached) return cached;

    const format = new Intl.NumberFormat("en-IE", options);

    numberFormats.set(key, format);

    return format;
}

// Intl writes a hyphen; the design sets a minus sign.
const withMinus = (text: string) => text.replace("-", "−");

type Options = { digits?: number; signed?: boolean };

export function formatEur(amount: number, { digits = 2, signed = false }: Options = {}) {
    return withMinus(
        numberFormat({
            style: "currency",
            currency: "EUR",
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
            signDisplay: signed ? "exceptZero" : "negative",
        }).format(amount),
    );
}

export function formatPercent(ratio: number, { digits = 1, signed = false }: Options = {}) {
    return withMinus(
        numberFormat({
            style: "percent",
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
            signDisplay: signed ? "exceptZero" : "negative",
        }).format(ratio),
    );
}

export function formatPoints(ratio: number, { digits = 1, signed = false }: Options = {}) {
    const points = numberFormat({
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
        signDisplay: signed ? "exceptZero" : "negative",
    }).format(ratio * 100);

    return `${withMinus(points)} pts`;
}

export function formatPrice(amount: number, currency: string) {
    return withMinus(
        numberFormat({
            style: "currency",
            currency,
            currencyDisplay: "narrowSymbol",
        }).format(amount),
    );
}

export function formatShares(shares: number) {
    return numberFormat({ maximumFractionDigits: 4 }).format(shares);
}

const exchanges: Record<string, string> = {
    AS: "Euronext Amsterdam",
    BR: "Euronext Brussels",
    DE: "Xetra",
    MI: "Euronext Milan",
    PA: "Euronext Paris",
    SW: "SIX Swiss Exchange",
};

export function formatListing(yahooSymbol: string | null) {
    if (!yahooSymbol) return null;

    const [ticker, suffix] = yahooSymbol.split(".");

    return suffix ? `${ticker} · ${exchanges[suffix] ?? suffix}` : ticker;
}
