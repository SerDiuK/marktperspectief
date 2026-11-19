import { expect, it } from "vitest";
import {
    DEGIRO_ACCOUNT_HEADER,
    DEGIRO_TRANSACTIONS_HEADER,
    parseDegiroAccount,
    parseDegiroTransactions,
} from "./degiro";

const transactions = [
    DEGIRO_TRANSACTIONS_HEADER,
    '14-03-2022,15:30,MICROSOFT CORP,US5949181045,NDQ,XNAS,12,"105,0000",USD,"-1260,00",USD,"-1146,60","1,0989","-2,87","-0,50","-1149,97",order-1',
    '09-02-2023,10:00,KONINKLIJKE PHILIPS NV,NL0000009538,EAM,XAMS,-8,"1450,0000",EUR,"11600,00",EUR,"11600,00","0,0000","0,00","-4,90","11595,10",order-2',
    '22-04-2024,10:08,HEINEKEN NV,NL0000009165,EAM,XAMS,30,"24,0000",EUR,"-720,00",EUR,"-720,00","0,0000","0,00","-1,00","-721,00",order-3',
    '22-04-2024,10:08,HEINEKEN NV,NL0000009165,EAM,XAMS,30,"24,0000",EUR,"-720,00",EUR,"-720,00","0,0000","0,00","-1,00","-721,00",order-3',
    '22-04-2024,10:09,HEI P18.00 21MAR25,NLEN00000001,LFF,,-1,"1,8000",EUR,"180,00",EUR,"180,00","0,0000","0,00","-0,75","179,25",order-4',
    '17-09-2025,00:00,ACKERMANS(SUB)C28,BE0970000007,EBR,,40,"0,0000",EUR,"0,00",EUR,"0,00","0,0000","0,00",,"0,00",',
    '11-10-2023,00:00,EXOR N.V,NL0012059018,EPA,,140,"15,2000",EUR,"-2128,00",EUR,"-2128,00","0,0000","0,00",,"-2128,00",',
    '11-10-2023,00:00,EXOR,NL0012059018,MIL,,-140,"15,2000",EUR,"2128,00",EUR,"2128,00","0,0000","0,00",,"2128,00",',
    '21-03-2025,00:00,HEINEKEN NV,NL0000009165,EAM,,200,"18,0000",EUR,"-3600,00",EUR,"-3600,00","0,0000","0,00",,"-3600,00",',
    '02-02-2026,09:00,BP PLC,GB0007980591,LSE,XLON,10,"2600,0000",GBX,"-26000,00",GBX,"-300,00","0,0115","-0,75","-1,00","-301,75",order-5',
].join("\n");

it("maps DEGIRO trades apart from options, rights and non-cash moves", () => {
    const { trades, errors } = parseDegiroTransactions(transactions);

    expect(trades).toMatchObject([
        {
            side: "buy",
            tradeDate: "2022-03-14",
            tradeTime: "15:30",
            quantity: 12,
            price: 105,
        },
        { side: "sell", quantity: 8 },
        { quantity: 30 },
        { quantity: 30 },
        { quantity: 200 },
    ]);
    expect(errors).toEqual([expect.stringMatching(/^Line 11\b.*GBX/)]);
    expect(new Set(trades.map((trade) => trade.externalKey)).size).toBe(5);
});

it("reads sold puts, and tells an assignment from an expiry by the shares bought at the strike", () => {
    const sold =
        '22-04-2024,10:08,HEI P18.00 21MAR25,NLEN00000001,LFF,XEUE,-1,"1,8000",EUR,"180,00",EUR,"180,00","0,0000","0,00","-0,75","179,25",order-1';
    const { puts, errors } = parseDegiroTransactions(
        [
            DEGIRO_TRANSACTIONS_HEADER,
            sold,
            sold,
            '05-03-2024,10:14,HEI P18.00 15MAR24,NLEN00000002,LFF,XEUE,1,"0,6000",EUR,"-60,00",EUR,"-60,00","0,0000","0,00","-0,75","-60,75",order-2',
            '21-03-2025,00:00,HEI P18.00 21MAR25,NLEN00000001,LFF,,2,"0,0000",EUR,"0,00",EUR,"0,00","0,0000","0,00",,"0,00",',
            '21-03-2025,00:00,HEINEKEN NV,NL0000009165,EAM,,200,"18,0000",EUR,"-3600,00",EUR,"-3600,00","0,0000","0,00",,"-3600,00",',
            '19-06-2026,22:00,MEL P52.00 19JUN26,BEEX00000003,LFF,,1,"0,0000",EUR,"0,00",EUR,"0,00","0,0000","0,00",,"0,00",',
            '03-02-2026,15:51,MEL C66.00 19JUN26,BEEX00000004,LFF,XBRD,-1,"0,9000",EUR,"90,00",EUR,"90,00","0,0000","0,00","-1,50","88,50",order-3',
        ].join("\n"),
    );

    expect(puts).toMatchObject([
        {
            optionCode: "HEI",
            strike: 18,
            expiry: "2025-03-21",
            side: "sell",
            contracts: 1,
            premium: 1.8,
            feesEur: 0.75,
        },
        { side: "sell" },
        { side: "buy", premium: 0.6 },
        { side: "assigned", contracts: 2 },
        { side: "expired" },
    ]);
    expect(new Set(puts.map(({ externalKey }) => externalKey)).size).toBe(5);
    expect(errors).toEqual([expect.stringMatching(/^Line 8: only puts/)]);
});

it("sums a dividend's lines on its value date, so a reversal and rebooking nets to one gross and one net amount", () => {
    const { income, fees, errors } = parseDegiroAccount(
        [
            DEGIRO_ACCOUNT_HEADER,
            '19-08-2026,07:18,18-08-2026,ING GROEP N.V.,NL0011821202,Dividendo,,EUR,"100,00",EUR,"100,00",',
            '19-08-2026,07:18,18-08-2026,ING GROEP N.V.,NL0011821202,Retención del dividendo,,EUR,"-15,00",EUR,"85,00",',
            '08-05-2026,07:15,07-05-2026,LVMH MOET HENNESSY,FR0000121014,Retención del dividendo,,EUR,"-25,00",EUR,"60,00",',
            '08-05-2026,07:15,07-05-2026,LVMH MOET HENNESSY,FR0000121014,Dividendo,,EUR,"100,00",EUR,"160,00",',
            '05-06-2026,13:48,07-05-2026,LVMH MOET HENNESSY,FR0000121014,Dividendo,,EUR,"-100,00",EUR,"60,00",',
            '05-06-2026,13:48,07-05-2026,LVMH MOET HENNESSY,FR0000121014,Retención del dividendo,,EUR,"25,00",EUR,"85,00",',
            '05-06-2026,13:49,07-05-2026,LVMH MOET HENNESSY,FR0000121014,Dividendo,,EUR,"100,00",EUR,"185,00",',
            '05-06-2026,13:49,07-05-2026,LVMH MOET HENNESSY,FR0000121014,Retención del dividendo,,EUR,"-24,90",EUR,"160,10",',
            '13-03-2026,07:09,12-03-2026,NESTLE SA,CH0038863350,Dividendo,,CHF,"50,00",CHF,"50,00",',
            '13-03-2026,07:09,12-03-2026,NESTLE SA,CH0038863350,Retención del dividendo,,CHF,"-17,50",CHF,"32,50",',
            '14-03-2026,06:37,13-03-2026,,,Retirada Cambio de Divisa,"0,9057",CHF,"-32,50",CHF,"0,00",',
            '14-03-2026,06:37,13-03-2026,,,Ingreso Cambio de Divisa,,EUR,"35,88",EUR,"195,98",',
            '28-09-2026,09:23,27-09-2026,,,Ingresos por Préstamo de Valores - Agosto,,EUR,"0,27",EUR,"196,25",',
        ].join("\n"),
    );

    expect(income).toMatchObject([
        {
            isin: "NL0011821202",
            kind: "dividend",
            payDate: "2026-08-18",
            gross: 100,
            amount: 85,
            currency: "EUR",
        },
        {
            isin: "FR0000121014",
            payDate: "2026-05-07",
            gross: 100,
            amount: 75.1,
        },
        { isin: "CH0038863350", gross: 50, amount: 32.5, currency: "CHF" },
        { isin: null, kind: "lending", payDate: "2026-09-27", amount: 0.27 },
    ]);
    expect([fees, errors]).toEqual([[], []]);
});

it("keeps the French transaction tax but skips trades, DEGIRO's costs on them and cash moves, and reports an unknown line", () => {
    const { trades, income, fees, errors } = parseDegiroAccount(
        [
            DEGIRO_ACCOUNT_HEADER,
            '14-01-2026,16:09,14-01-2026,DANONE,FR0000120644,Costes de transacción y/o externos de DEGIRO,,EUR,"-4,90",EUR,"0,00",order-1',
            '14-01-2026,16:09,14-01-2026,DANONE,FR0000120644,Impuesto de transacción Francés,,EUR,"-3,42",EUR,"0,00",order-1',
            '14-01-2026,16:09,14-01-2026,DANONE,FR0000120644,Compra 15 Danone,,EUR,"-855,90",EUR,"0,00",order-1',
            ',,,,,"@57,06 EUR (FR0000120644)",,,,,,',
            '14-01-2026,17:51,14-01-2026,,,Degiro Cash Sweep Transfer,,EUR,"864,22",EUR,"0,00",',
            '14-01-2026,17:51,14-01-2026,,,"Transferir desde su Cuenta de Efectivo en flatexDEGIRO Bank: 864,22 EUR",,,,EUR,"0,00",',
            '24-03-2026,12:15,24-03-2026,,,flatex Deposit,,EUR,"1000,00",EUR,"0,00",',
            '17-03-2026,08:03,17-03-2026,ZURICH INSURANCE GROUP AG,CH0011075394,"CAMBIO DE ISIN: Compra 3 Zurich Insurance Group AG@305,8 CHF (CH0011075394)",,CHF,"-917,40",CHF,"0,00",',
            '20-02-2026,10:43,31-01-2026,,,Comisión de conectividad con el mercado 2026 (Euronext Paris - EPA),,EUR,"-2,50",EUR,"0,00",',
            '20-02-2026,10:43,31-01-2026,,,Comisión de conectividad con el mercado 2026 (Euronext Amsterdam - EAM),,EUR,"-2,50",EUR,"0,00",',
            '13-05-2026,14:38,30-04-2026,,,Interés,,EUR,"-1,37",EUR,"0,00",',
            '06-10-2026,07:02,30-09-2026,,,Flatex Interest Income,,EUR,"0,00",EUR,"0,00",',
            '24-03-2025,07:16,21-03-2025,HEI P18.00 21MAR25,NLEN00000001,Comisión de Ejercicio de Opciones o Futuros,,EUR,"-2,00",EUR,"0,00",',
            '15-02-2024,11:27,14-02-2024,,,Compensación DEGIRO,,EUR,"4,90",EUR,"0,00",',
            '01-02-2026,09:00,01-02-2026,,,Comisión de custodia,,EUR,"-1,00",EUR,"0,00",',
        ].join("\n"),
    );

    expect(fees).toMatchObject([
        {
            externalKey: expect.stringMatching(/^FR0000120644\|/),
            date: "2026-01-14",
            amount: 3.42,
        },
        { date: "2026-01-31", amount: 2.5 },
        { amount: 2.5 },
        { date: "2026-04-30", amount: 1.37 },
        {
            externalKey: expect.stringMatching(/^\|/),
            date: "2025-03-21",
            amount: 2,
        },
        { amount: -4.9 },
    ]);
    expect([trades, income]).toEqual([[], []]);
    expect(errors).toEqual([expect.stringMatching(/^Line 16\b/)]);
});
