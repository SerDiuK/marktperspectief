import Papa from "papaparse";
import { z } from "zod";
import { currencies } from "@/db/schema";

const ecbRate = z.object({
    CURRENCY: z.enum(currencies),
    TIME_PERIOD: z.string(),
    OBS_VALUE: z.coerce.number().positive(),
});

export async function fetchEcbRates(foreign: (typeof currencies)[number][], from: string) {
    const response = await fetch(
        `https://data-api.ecb.europa.eu/service/data/EXR/D.${foreign.join("+")}.EUR.SP00.A?startPeriod=${from}&format=csvdata`,
        { signal: AbortSignal.timeout(10_000) },
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const { data } = Papa.parse<unknown>(await response.text(), {
        header: true,
        skipEmptyLines: true,
    });

    return data.map((row) => {
        const { CURRENCY, TIME_PERIOD, OBS_VALUE } = ecbRate.parse(row);

        return { currency: CURRENCY, date: TIME_PERIOD, perEur: OBS_VALUE };
    });
}
