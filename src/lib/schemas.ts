import { z } from "zod";
import { brokers, currencies, holdingTypes } from "@/db/schema";

const instrument = z.string().describe("The ISIN, the Yahoo symbol (HEIA.AS or HEIA) or part of the name");
const broker = z.enum(["degiro", "saxo"]);
const side = z.enum(["buy", "sell"]);
const tradeDate = z.iso.date();
const quantity = z.number().positive();
const price = z.number().positive();
const feesEur = z.number().nonnegative();
const currency = z.enum(currencies);
const draftId = z.uuid();
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

// ISO 6166: letters become 10–35, then the Luhn check runs over the digits.
function isValidIsin(value: string) {
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value)) return false;

    const digits = [...value].map((c) => parseInt(c, 36)).join("");
    let sum = 0;

    for (let i = 0; i < digits.length; i++) {
        let d = Number(digits[digits.length - 1 - i]);

        if (i % 2 === 1) {
            d *= 2;
            if (d > 9) d -= 9;
        }

        sum += d;
    }

    return sum % 10 === 0;
}

const isin = z.string().refine(isValidIsin, "Not a valid ISIN");
const yahooSymbol = z
    .string()
    .min(1)
    .describe("Yahoo's symbol for the listing that prices it, like HEIA.AS; none when Yahoo has no history");
const type = z
    .enum(holdingTypes)
    .describe(
        "Decides how the holding is valued and when it is sold. compounder: a great business that can reinvest at high returns for decades. bargain: a good business priced below what it is worth. cigar_butt: a mediocre business priced far below its earnings or assets. cyclical: sales and profits that rise and fall with the economy. asset_play: worth more for its assets than the market says. avoid: a bad business, or a thesis that broke and couldn't be re-underwritten. core: an index fund, held for good and sold only to move into a cheaper one.",
    );
const pillars = z
    .array(
        z.object({
            claim: z.string().min(1).describe("What must hold true, in the user's words"),
            wrongIf: z.string().min(1).describe("What would prove it wrong, so a review can check it"),
        }),
    )
    .max(4)
    .describe("Two to four pillars; avoid needs none");
const reason = z.string().min(1).describe("Why this type, or what changed since the current thesis");

export const chatEntry = z.discriminatedUnion("chat", [
    z.object({
        chat: z.literal("add"),
        draftId,
        trade: z.object({
            broker,
            isin: z.string(),
            side,
            tradeDate,
            quantity,
            price,
            currency,
            feesEur,
        }),
    }),
    z.object({ chat: z.literal("void"), draftId }),
    z.object({
        chat: z.literal("instruments"),
        draftId,
        instruments: z
            .array(z.object({ id: slug, isin, name: z.string().min(1), currency, yahooSymbol: yahooSymbol.nullable() }))
            .default([]),
        aliases: z
            .array(z.object({ kind: z.enum(["isin", "option_code"]), value: z.string().min(1), instrumentId: slug }))
            .default([]),
        corporateActions: z
            .array(
                z.object({
                    id: z.string().min(1),
                    broker: z.enum(brokers),
                    date: z.iso.date(),
                    instrumentId: slug,
                    shares: z.number(),
                }),
            )
            .default([]),
    }),
    z.object({
        chat: z.literal("thesis"),
        draftId,
        thesis: z.object({ isin: z.string(), date: z.iso.date(), type, pillars, reason }),
    }),
]);

export type ChatEntry = z.infer<typeof chatEntry>;

export const transactionInput = z.object({
    instrument,
    broker,
    side,
    tradeDate: tradeDate.optional().describe("YYYY-MM-DD; today in Madrid when left out"),
    quantity,
    price: price.describe("Per share, in the currency of the instrument's listing"),
    feesEur: feesEur.default(0),
});

export type TransactionInput = z.infer<typeof transactionInput>;

export const thesisInput = z.object({ instrument, type, pillars, reason });

export type ThesisInput = z.infer<typeof thesisInput>;

export const instrumentInput = z.object({
    isin: isin.describe("The security's current ISIN"),
    name: z.string().min(1).describe("A short name, like Heineken"),
    currency: currency.describe("The currency of the Yahoo listing"),
    yahooSymbol: yahooSymbol.optional(),
    optionCode: z
        .string()
        .min(1)
        .optional()
        .describe(
            "The code DEGIRO's option names start with, like HEI in HEI P70.00 20DEC24, when the user sells puts on it",
        ),
});

export type InstrumentInput = z.infer<typeof instrumentInput>;

export const draftInput = z.object({ draftId });
