import YahooFinance from "yahoo-finance2";
import { z } from "zod";
import { dateIn } from "@/lib/dates";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const yahooChart = z.object({
    meta: z.object({ currency: z.string(), exchangeTimezoneName: z.string() }),
    quotes: z.array(z.object({ date: z.date(), close: z.number().nullish() })),
    events: z
        .object({
            dividends: z.array(z.object({ date: z.date(), amount: z.number() })).optional(),
            splits: z
                .array(
                    z.object({
                        date: z.date(),
                        numerator: z.number(),
                        denominator: z.number(),
                    }),
                )
                .optional(),
        })
        .optional(),
});

/**
 * Undoes Yahoo's split adjustment of closes and dividends. A window's response
 * holds every split after its first bar.
 */
export async function fetchChart(symbol: string, from: string) {
    const { meta, quotes, events } = yahooChart.parse(
        await yahooFinance.chart(
            symbol,
            { period1: from, interval: "1d", events: "div|split" },
            { validateResult: false, fetchOptions: { signal: AbortSignal.timeout(10_000) } },
        ),
    );
    const localDate = dateIn(meta.exchangeTimezoneName);
    const splits = (events?.splits ?? []).map((split) => ({
        date: localDate(split.date),
        ratio: split.numerator / split.denominator,
    }));
    const unsplit = (day: string) =>
        splits.filter((split) => split.date > day).reduce((product, split) => product * split.ratio, 1);

    const dividends = new Map<string, number>();

    for (const { date, amount } of events?.dividends ?? []) {
        const day = localDate(date);

        dividends.set(day, (dividends.get(day) ?? 0) + amount * unsplit(day));
    }

    return {
        currency: meta.currency,
        closes: quotes.flatMap(({ date, close }) => {
            if (!close || close < 0) return [];

            const day = localDate(date);

            return [{ date: day, close: close * unsplit(day) }];
        }),
        dividends: [...dividends].map(([exDate, amount]) => ({
            exDate,
            amount,
        })),
    };
}
