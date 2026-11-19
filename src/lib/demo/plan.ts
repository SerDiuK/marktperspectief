import type { ChatEntry } from "@/lib/schemas";

type Thesis = Extract<ChatEntry, { chat: "thesis" }>["thesis"];

export const demoInstruments = [
    {
        id: "vanguard-ftse-all-world",
        isin: "IE00BK5BQT80",
        name: "Vanguard FTSE All-World (acc)",
        currency: "EUR",
        yahooSymbol: "VWCE.DE",
        product: "VANGUARD FTSE AW USDA",
        exchange: "XET",
        venue: "XETR",
        market: "Xetra - XET",
        withholding: 0,
    },
    {
        id: "microsoft",
        isin: "US5949181045",
        name: "Microsoft",
        currency: "USD",
        yahooSymbol: "MSFT",
        product: "MICROSOFT CORP",
        exchange: "NDQ",
        venue: "XNAS",
        market: "NASDAQ - NDQ",
        withholding: 0.15,
    },
    {
        id: "lvmh",
        isin: "FR0000121014",
        name: "LVMH",
        currency: "EUR",
        yahooSymbol: "MC.PA",
        product: "LVMH",
        exchange: "EPA",
        venue: "XPAR",
        market: "Euronext Paris - EPA",
        withholding: 0.128,
    },
    {
        id: "arcelormittal",
        isin: "LU1598757687",
        name: "ArcelorMittal",
        currency: "EUR",
        yahooSymbol: "MT.AS",
        product: "ARCELORMITTAL",
        exchange: "EAM",
        venue: "XAMS",
        market: "Euronext Amsterdam - EAM",
        withholding: 0.15,
    },
    {
        id: "heineken",
        isin: "NL0000009165",
        name: "Heineken",
        currency: "EUR",
        yahooSymbol: "HEIA.AS",
        product: "HEINEKEN",
        exchange: "EAM",
        venue: "XAMS",
        market: "Euronext Amsterdam - EAM",
        withholding: 0.15,
    },
    {
        id: "exor",
        isin: "NL0012059018",
        name: "Exor",
        currency: "EUR",
        yahooSymbol: "EXO.AS",
        product: "EXOR NV",
        exchange: "EAM",
        venue: "XAMS",
        market: "Euronext Amsterdam - EAM",
        withholding: 0.15,
    },
    {
        id: "philips",
        isin: "NL0000009538",
        name: "Philips",
        currency: "EUR",
        yahooSymbol: "PHIA.AS",
        product: "KONINKLIJKE PHILIPS NV",
        exchange: "EAM",
        venue: "XAMS",
        market: "Euronext Amsterdam - EAM",
        withholding: 0.15,
    },
    {
        id: "bayer",
        isin: "DE000BAY0017",
        name: "Bayer",
        currency: "EUR",
        yahooSymbol: "BAYN.DE",
        product: "BAYER AG",
        exchange: "XET",
        venue: "XETR",
        market: "Xetra - XET",
        withholding: 0.26375,
    },
] as const;

export type DemoInstrumentId = (typeof demoInstruments)[number]["id"];

export const monthlyBuy = { id: "vanguard-ftse-all-world", from: "2021-02-01", euros: 400 } as const;

// A negative quantity sells.
export const demoTrades: { date: string; id: DemoInstrumentId; quantity: number }[] = [
    { date: "2021-01-15", id: "arcelormittal", quantity: 150 },
    { date: "2021-03-10", id: "microsoft", quantity: 15 },
    { date: "2021-04-20", id: "philips", quantity: 60 },
    { date: "2021-06-15", id: "lvmh", quantity: 5 },
    { date: "2022-01-31", id: "philips", quantity: -60 },
    { date: "2022-03-08", id: "heineken", quantity: 40 },
    { date: "2022-03-02", id: "arcelormittal", quantity: -80 },
    { date: "2022-07-05", id: "exor", quantity: 30 },
    { date: "2022-10-26", id: "microsoft", quantity: 10 },
    { date: "2023-03-20", id: "arcelormittal", quantity: 60 },
    { date: "2023-10-20", id: "lvmh", quantity: 3 },
    { date: "2024-03-12", id: "bayer", quantity: 150 },
    { date: "2024-11-19", id: "exor", quantity: 20 },
    { date: "2025-07-31", id: "microsoft", quantity: -5 },
    { date: "2026-04-14", id: "bayer", quantity: 100 },
];

export const putCode = "HEI";

export const demoPuts = [
    { date: "2023-06-12", outOfTheMoney: 0.06, premium: 1.85, expiry: "2023-09-15" },
    { date: "2024-08-05", outOfTheMoney: 0.06, premium: 2.4, expiry: "2024-12-20" },
    { date: "2026-05-11", outOfTheMoney: 0.08, premium: 1.6, expiry: "2026-12-18" },
];

export const demoTheses: (Omit<Thesis, "isin"> & { id: DemoInstrumentId })[] = [
    {
        id: "vanguard-ftse-all-world",
        date: "2021-02-01",
        type: "core",
        pillars: [],
        reason: "The base of the portfolio: the whole world market for 0.22% a year, bought every month whatever the news.",
    },
    {
        id: "microsoft",
        date: "2021-03-10",
        type: "compounder",
        pillars: [
            {
                claim: "Azure keeps growing faster than the cloud market",
                wrongIf: "Azure grows slower than AWS and Google Cloud for four quarters in a row",
            },
            {
                claim: "Office and Windows stay the default at work, so prices can rise",
                wrongIf: "Commercial seat growth turns negative",
            },
            {
                claim: "Management buys back shares and keeps a fortress balance sheet",
                wrongIf: "Net debt or a large acquisition paid in shares",
            },
        ],
        reason: "One of the few businesses that can reinvest at high returns for decades.",
    },
    {
        id: "lvmh",
        date: "2021-06-15",
        type: "compounder",
        pillars: [
            {
                claim: "Louis Vuitton and Dior keep pricing power through a downturn",
                wrongIf: "Fashion & Leather Goods margin below 35% for two years",
            },
            {
                claim: "The Arnault family allocates capital well",
                wrongIf: "A large acquisition outside luxury",
            },
        ],
        reason: "The strongest portfolio of brands in luxury, run by an owner.",
    },
    {
        id: "heineken",
        date: "2022-03-08",
        type: "bargain",
        pillars: [
            {
                claim: "Premiumisation keeps revenue per hectolitre rising",
                wrongIf: "Revenue per hectolitre falls in two years out of three",
            },
            {
                claim: "Margins recover to their pre-Covid level",
                wrongIf: "Operating margin below 14% in 2026",
            },
        ],
        reason: "A good business at about 18 times earnings, below its own history. Selling puts to add lower.",
    },
    {
        id: "arcelormittal",
        date: "2021-01-15",
        type: "cyclical",
        pillars: [
            {
                claim: "Steel spreads recover from the Covid low",
                wrongIf: "European hot-rolled coil below €500 a tonne for a year",
            },
            {
                claim: "Debt keeps falling, so the next downturn can't force a rights issue",
                wrongIf: "Net debt rises two years in a row",
            },
        ],
        reason: "Bought near the bottom of the cycle; sell into the next peak, not at a target price.",
    },
    {
        id: "exor",
        date: "2022-07-05",
        type: "asset_play",
        pillars: [
            {
                claim: "The discount to net asset value narrows from about 50%",
                wrongIf: "The discount is wider in three years",
            },
            {
                claim: "Buybacks at the discount add value per share",
                wrongIf: "No buybacks for two years",
            },
        ],
        reason: "Ferrari alone is worth most of the market value; the rest comes for free.",
    },
    {
        id: "philips",
        date: "2022-01-28",
        type: "avoid",
        pillars: [],
        reason: "The sleep-apnea recall keeps growing and the litigation has no ceiling. The thesis broke, so sell.",
    },
    {
        id: "bayer",
        date: "2024-03-12",
        type: "cigar_butt",
        pillars: [
            {
                claim: "The glyphosate cases get settled or capped",
                wrongIf: "A new wave of verdicts above €10bn",
            },
            {
                claim: "The pharma pipeline replaces Xarelto",
                wrongIf: "Pharma sales fall for three years",
            },
        ],
        reason: "A mediocre business at four times earnings. One more puff, then out.",
    },
];
