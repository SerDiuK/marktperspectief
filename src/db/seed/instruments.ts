import type { instruments } from "../schema";

// The benchmarks the overview compares with. Holdings come from instruments
// files and add_instrument, which Blob keeps like any other import.
export const instrumentSeed: (typeof instruments.$inferInsert)[] = [
    {
        id: "ishares-sp500",
        isin: "IE00B5BMR087",
        name: "iShares Core S&P 500 (acc)",
        currency: "EUR",
        yahooSymbol: "SXR8.DE",
    },
    {
        id: "ishares-stoxx-600",
        isin: "DE0002635307",
        name: "iShares STOXX Europe 600 (dist)",
        currency: "EUR",
        yahooSymbol: "EXSA.DE",
    },
];
