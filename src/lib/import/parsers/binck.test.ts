import { describe, expect, it } from "vitest";
import { BINCK_HEADER, parseBinck } from "./binck";

const ledger = [
    BINCK_HEADER,
    "2019-01-02,1,buy,LU1598757687,ArcelorMittal,10,100.5,EUR,1005.0,7.25,,,1012.25,1,10,NYSE Euronext",
    "2019-04-01,2,dividend,LU1598757687,ArcelorMittal,10,1.0,EUR,10.0,,1.5,15,8.5,,0,",
    "2019-05-01,3,lending_dividend,LU1598757687,ArcelorMittal,10,0.5,EUR,5.0,,0,,5.0,,0,",
    "2019-06-01,4,lending_fee,,,,,EUR,,,,,1.1,,,",
    "2019-07-06,5,interest,,,,,EUR,,,,,-0.26,,,",
    "2019-08-01,6,sell,LU1598757687,ArcelorMittal,4,150.0,EUR,600.0,7.25,,,592.75,2,6,NYSE Euronext",
    "2021-10-02,7,transfer_out,LU1598757687,ArcelorMittal,6,100.5,EUR,,,,,,,0,to Saxo Bank",
].join("\n");

describe("parseBinck", () => {
    it("maps each kind of Binck line to the ledger", () => {
        const { trades, income, fees, errors } = parseBinck(ledger);

        expect(errors).toEqual([]);
        expect(trades).toMatchObject([
            { side: "buy", quantity: 10, price: 100.5, feesEur: 7.25 },
            { side: "sell", quantity: 4, price: 150, feesEur: 7.25 },
            { side: "transfer_out", quantity: 6 },
        ]);
        expect(income).toMatchObject([
            { kind: "dividend", amount: 8.5, gross: 10 },
            { kind: "dividend", amount: 5, gross: 5 },
            { kind: "lending", amount: 1.1, isin: null },
        ]);
        expect(fees).toMatchObject([{ amount: 0.26 }]);
    });
});
