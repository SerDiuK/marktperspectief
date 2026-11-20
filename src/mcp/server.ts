import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/server";
import type { Db } from "@/db/connect";
import { getPendingChatTrades } from "@/db/ledger";
import { ownerDate } from "@/lib/dates";
import { syncMarketData } from "@/lib/market/sync";
import { loadPortfolio } from "@/lib/portfolio/load";
import { refreshDerived } from "@/lib/portfolio/refresh";
import { draftInput, instrumentInput, thesisInput, transactionInput } from "@/lib/schemas";
import {
    addInstrument,
    addTransaction,
    confirmInstrument,
    confirmThesis,
    confirmTransaction,
    proposeThesis,
    undoChatTransaction,
} from "./chat";
import { draftCard, draftCardUri } from "./draft-card";

const json = (value: Record<string, unknown>) => ({
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
});

const withCard = { ui: { resourceUri: draftCardUri } };
const cardOnly = { ui: { visibility: ["app" as const] } };

export function buildServer(db: Db) {
    const server = new McpServer(
        { name: "marktperspectief", version: "0.1.0" },
        {
            instructions:
                "Amounts are in EUR at ECB rates unless a field names another currency. A trade, a thesis or a new instrument is recorded in two steps: add_transaction, propose_thesis or add_instrument returns a preview and keeps it as a draft, and nothing is saved until the user confirms that draft. When confirm_transaction, confirm_thesis and confirm_instrument aren't among your tools, the preview shows as a card and only its Confirm button saves it, so ask the user to press it. Otherwise call the confirm tool only after the user has agreed to that preview in a message of their own. Mention every warning in the preview.",
        },
    );

    server.registerTool(
        "portfolio_summary",
        {
            title: "Portfolio summary",
            description:
                "The overview (value, day change, estimated dividends, and for each of the chart's ranges: total return and its parts, the money-weighted return and that of the same flows in the Stoxx 600, the time-weighted returns of both, annualised when the range is 1Y or longer), the date of the latest prices, and the open positions: shares, FIFO average price and the last closes in the listing's currency; 1-day change; cost, value, unrealised result and estimated dividends for the next 12 months in EUR; weight; the date the current holding period began; and the current thesis (type, pillars, the reason and the date it was written), or null. chatTrades are trades confirmed in chat that the broker's export hasn't replaced yet.",
            annotations: { readOnlyHint: true },
        },
        async () => {
            const [{ overview, asOf, holdings }, pending] = await Promise.all([
                loadPortfolio(db),
                getPendingChatTrades(db),
            ]);
            const chatTrades = pending.map(
                ({ externalKey, instrumentId, broker, side, tradeDate, quantity, price, currency }) => ({
                    draftId: externalKey,
                    instrumentId,
                    broker,
                    side,
                    tradeDate,
                    quantity,
                    price,
                    currency,
                }),
            );

            return json({ overview, asOf, holdings, chatTrades });
        },
    );

    server.registerTool(
        "refresh_prices",
        {
            title: "Refresh prices",
            description:
                "Fetches the latest closes, dividends and ECB rates and rebuilds the daily series, as the nightly job does. Returns how many rows it fetched, the listings that failed or have no Yahoo symbol, and asOf, the last day of the series. Call it when the user asks for fresh prices or portfolio_summary's overview is behind its holdings' price dates.",
            annotations: { idempotentHint: true, openWorldHint: true },
        },
        async () => {
            const sync = await syncMarketData(db);
            const derived = await refreshDerived(db, ownerDate(new Date()));

            return json({ ...sync, ...derived });
        },
    );

    registerAppTool(
        server,
        "add_transaction",
        {
            title: "Add a transaction",
            description:
                "Checks a buy or sell the user made and returns a preview with its total in EUR, the shares held after it and any warnings, kept as a draft for 30 minutes. Nothing is recorded until the user confirms it. When the instrument matches several securities, it returns them as candidates and makes no draft.",
            inputSchema: transactionInput,
            _meta: withCard,
        },
        async (input) => json({ kind: "trade", ...(await addTransaction(db, input, new Date())) }),
    );

    registerAppTool(
        server,
        "confirm_transaction",
        {
            title: "Confirm a transaction",
            description:
                "Records a draft from add_transaction in the ledger. Call it only after the user has agreed to the preview. The broker's next export replaces the trade with its own row.",
            inputSchema: draftInput,
            _meta: cardOnly,
        },
        async ({ draftId }) => json(await confirmTransaction(db, draftId, new Date())),
    );

    server.registerTool(
        "undo_chat_transaction",
        {
            title: "Undo a chat transaction",
            description:
                "Removes a trade recorded with confirm_transaction from the ledger, by its draftId. A trade the broker's export has already replaced can't be undone.",
            inputSchema: draftInput,
            annotations: { destructiveHint: true },
        },
        async ({ draftId }) => json(await undoChatTransaction(db, draftId, new Date())),
    );

    registerAppTool(
        server,
        "propose_thesis",
        {
            title: "Propose a thesis",
            description:
                "Checks a thesis the user wrote for a holding and returns it as a preview, kept as a draft for 30 minutes. Nothing is saved until the user confirms it. A saved thesis replaces the holding's current one whole, so a change sends every pillar again. When the instrument matches several securities, it returns them as candidates and makes no draft.",
            inputSchema: thesisInput,
            _meta: withCard,
        },
        async (input) => json({ kind: "thesis", ...(await proposeThesis(db, input, new Date())) }),
    );

    registerAppTool(
        server,
        "confirm_thesis",
        {
            title: "Confirm a thesis",
            description:
                "Saves a draft from propose_thesis as the holding's current thesis. Call it only after the user has agreed to the preview.",
            inputSchema: draftInput,
            _meta: cardOnly,
        },
        async ({ draftId }) => json(await confirmThesis(db, draftId, new Date())),
    );

    registerAppTool(
        server,
        "add_instrument",
        {
            title: "Add an instrument",
            description:
                "Checks a security the ledger doesn't know yet, before its first trade, thesis or import, and returns it as a preview, kept as a draft for 30 minutes. Nothing is saved until the user confirms it. Look up its ISIN and Yahoo symbol first; the symbol's listing sets the currency.",
            inputSchema: instrumentInput,
            _meta: withCard,
        },
        async (input) => json({ kind: "instrument", ...(await addInstrument(db, input, new Date())) }),
    );

    registerAppTool(
        server,
        "confirm_instrument",
        {
            title: "Confirm an instrument",
            description:
                "Saves a draft from add_instrument. Call it only after the user has agreed to the preview, then refresh_prices to fetch its closes.",
            inputSchema: draftInput,
            _meta: cardOnly,
        },
        async ({ draftId }) => json(await confirmInstrument(db, draftId, new Date())),
    );

    registerAppResource(
        server,
        "Draft card",
        draftCardUri,
        { description: "A draft trade, thesis or instrument with a Confirm button" },
        async () => ({
            contents: [
                {
                    uri: draftCardUri,
                    mimeType: RESOURCE_MIME_TYPE,
                    text: draftCard,
                    _meta: { ui: { prefersBorder: true } },
                },
            ],
        }),
    );

    return server;
}
