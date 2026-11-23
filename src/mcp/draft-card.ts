export const draftCardUri = "ui://marktperspectief/draft-card.html";

export const draftCard = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; margin: 0; }
body {
    font-family: var(--font-sans, system-ui, sans-serif);
    font-size: var(--font-text-sm-size, 14px);
    line-height: var(--font-text-sm-line-height, 1.45);
    color: var(--color-text-primary, CanvasText);
    background: transparent;
    padding: 16px;
}
main { border-top: 2px solid currentColor; padding-top: 12px; display: flex; flex-direction: column; gap: 12px; }
.eyebrow { color: var(--color-text-secondary, GrayText); text-transform: uppercase; letter-spacing: 0.08em; font-size: var(--font-text-xs-size, 12px); }
h1 { font-size: var(--font-heading-sm-size, 18px); font-weight: var(--font-weight-semibold, 600); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; }
dt { color: var(--color-text-secondary, GrayText); }
dd { font-variant-numeric: tabular-nums; }
ol, ul { padding-left: 1.25em; display: flex; flex-direction: column; gap: 6px; }
.note { color: var(--color-text-secondary, GrayText); }
.warning { color: var(--color-text-warning, CanvasText); border-left: 2px solid currentColor; padding-left: 8px; }
.actions { display: flex; gap: 8px; }
button { font: inherit; border-radius: 0; padding: 6px 14px; cursor: pointer; border: 1px solid var(--color-border-primary, currentColor); background: transparent; color: inherit; }
button.primary { background: var(--color-background-inverse, CanvasText); color: var(--color-text-inverse, Canvas); border-color: transparent; }
button:disabled { opacity: 0.5; cursor: default; }
[hidden] { display: none !important; }
</style>
</head>
<body>
<main id="card"><p class="note">Checking…</p></main>
<script>
(() => {
    const protocolVersion = "2026-01-26";
    const confirmTools = { trade: "confirm_transaction", thesis: "confirm_thesis", instrument: "confirm_instrument" };
    const brokers = { degiro: "DEGIRO", saxo: "Saxo" };
    const types = {
        compounder: "Compounder", bargain: "Bargain", cigar_butt: "Cigar butt", cyclical: "Cyclical",
        asset_play: "Asset play", avoid: "Avoid", core: "Core",
    };
    const card = document.getElementById("card");
    const pending = new Map();
    let nextId = 1;
    let host = { capabilities: {}, locale: undefined, timeZone: undefined };

    const send = (message) => window.parent.postMessage({ jsonrpc: "2.0", ...message }, "*");
    const notify = (method, params) => send({ method, params });
    const request = (method, params) =>
        new Promise((resolve, reject) => {
            const id = nextId++;

            pending.set(id, { resolve, reject });
            send({ id, method, params });
        });

    function el(tag, text, className) {
        const node = document.createElement(tag);

        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;

        return node;
    }

    function rows(pairs) {
        const list = el("dl");

        for (const [term, value] of pairs) {
            if (value === undefined || value === null || value === "") continue;
            list.append(el("dt", term), el("dd", String(value)));
        }

        return list;
    }

    const number = (value, options) => new Intl.NumberFormat(host.locale, options).format(value);
    const money = (value, currency) => number(value, { style: "currency", currency });
    const shares = (value) => number(value, { maximumFractionDigits: 6 });
    const time = (iso) =>
        new Intl.DateTimeFormat(host.locale, { timeStyle: "short", timeZone: host.timeZone }).format(new Date(iso));

    function reportSize() {
        const root = document.documentElement;
        const height = root.style.height;

        root.style.height = "max-content";

        const size = { width: Math.ceil(window.innerWidth), height: Math.ceil(root.getBoundingClientRect().height) };

        root.style.height = height;
        notify("ui/notifications/size-changed", size);
    }

    function render(...nodes) {
        card.replaceChildren(...nodes);
        reportSize();
    }

    function applyContext(context) {
        if (!context) return;
        if (context.locale) host.locale = context.locale;
        if (context.timeZone) host.timeZone = context.timeZone;
        if (context.theme) document.documentElement.style.colorScheme = context.theme;

        for (const [name, value] of Object.entries(context.styles?.variables ?? {})) {
            if (value) document.documentElement.style.setProperty(name, value);
        }
    }

    function tellModel(text) {
        if (!host.capabilities.updateModelContext) return;
        request("ui/update-model-context", { content: [{ type: "text", text }] }).catch(() => {});
    }

    const textOf = (result) => (result?.content ?? []).map((block) => block.text ?? "").join("\\n");

    function details(draft) {
        if (draft.kind === "trade") {
            return [
                el("p", (draft.side === "buy" ? "Buy" : "Sell") + " · " + (brokers[draft.broker] ?? draft.broker), "eyebrow"),
                el("h1", draft.instrument),
                rows([
                    ["Date", draft.tradeDate],
                    ["Shares", shares(draft.quantity)],
                    ["Price", number(draft.price, { style: "currency", currency: draft.currency, maximumFractionDigits: 4 })],
                    ["Fees", money(draft.feesEur, "EUR")],
                    ["Total", money(draft.totalEur, "EUR")],
                    ["Shares after", shares(draft.sharesAfter)],
                ]),
            ];
        }

        if (draft.kind === "thesis") {
            const pillars = el("ol");

            for (const pillar of draft.pillars) {
                const item = el("li", pillar.claim);

                item.append(el("div", "Wrong if " + pillar.wrongIf, "note"));
                pillars.append(item);
            }

            return [
                el("p", "Thesis · " + (types[draft.type] ?? draft.type), "eyebrow"),
                el("h1", draft.instrument),
                ...(draft.pillars.length ? [pillars] : []),
                el("p", draft.reason),
            ];
        }

        return [
            el("p", "New instrument", "eyebrow"),
            el("h1", draft.name),
            rows([
                ["ISIN", draft.isin],
                ["Yahoo symbol", draft.yahooSymbol ?? "none"],
                ["Currency", draft.currency],
                ["DEGIRO option code", draft.optionCode],
            ]),
        ];
    }

    function showDraft(draft) {
        const status = el("p", "Expires at " + time(draft.expiresAt), "note");
        const confirm = el("button", "Confirm", "primary");
        const discard = el("button", "Discard");
        const actions = el("div", undefined, "actions");
        const warnings = el("ul");

        status.setAttribute("role", "status");

        for (const warning of draft.warnings ?? []) warnings.append(el("li", warning, "warning"));

        const settle = (text) => {
            actions.hidden = true;
            status.textContent = text;
            reportSize();
        };

        confirm.addEventListener("click", async () => {
            confirm.disabled = discard.disabled = true;

            try {
                const result = await request("tools/call", {
                    name: confirmTools[draft.kind],
                    arguments: { draftId: draft.draftId },
                });
                const outcome = result.structuredContent;

                if (result.isError || !outcome) {
                    settle(textOf(result) || "Not saved.");
                } else if (outcome.status === "applied" || outcome.status === "duplicate") {
                    settle(outcome.status === "applied" ? "Saved." : "Already saved.");
                    tellModel(
                        "The user pressed Confirm on the " + draft.kind + " draft " + draft.draftId + ": it is saved." +
                            (draft.kind === "instrument" ? " Call refresh_prices to fetch its closes." : ""),
                    );
                } else {
                    settle(["Not saved.", ...(outcome.report?.errors ?? [])].join(" "));
                }
            } catch (error) {
                settle(error.message);
            }
        });

        discard.addEventListener("click", () => {
            settle("Discarded.");
            tellModel("The user pressed Discard on the " + draft.kind + " draft " + draft.draftId + ": nothing was saved.");
        });

        actions.append(confirm, discard);
        render(...details(draft), ...(warnings.children.length ? [warnings] : []), actions, status);
    }

    function showResult(result) {
        const draft = result.structuredContent;

        if (result.isError || !draft) return render(el("p", textOf(result)));

        if (draft.candidates) {
            const list = el("ul");

            for (const { name, isin, yahooSymbol } of draft.candidates) {
                list.append(el("li", [name, isin, yahooSymbol].filter(Boolean).join(" · ")));
            }

            return render(el("p", "Several securities match. Tell Claude which one you mean.", "note"), list);
        }

        showDraft(draft);
    }

    window.addEventListener("message", (event) => {
        const message = event.data;

        if (event.source !== window.parent || message?.jsonrpc !== "2.0") return;

        if (message.method === undefined) {
            const waiting = pending.get(message.id);

            if (!waiting) return;
            pending.delete(message.id);

            return message.error ? waiting.reject(new Error(message.error.message)) : waiting.resolve(message.result);
        }

        if (message.method === "ui/notifications/tool-result") showResult(message.params);
        else if (message.method === "ui/notifications/tool-cancelled") render(el("p", "Cancelled.", "note"));
        else if (message.method === "ui/notifications/host-context-changed") applyContext(message.params);
        else if (message.id !== undefined) {
            const known = message.method === "ping" || message.method === "ui/resource-teardown";

            send(known ? { id: message.id, result: {} } : { id: message.id, error: { code: -32601, message: "Method not found" } });
        }
    });

    request("ui/initialize", {
        appInfo: { name: "marktperspectief-draft-card", version: "1.0.0" },
        appCapabilities: {},
        protocolVersion,
    }).then((result) => {
        host.capabilities = result.hostCapabilities ?? {};
        applyContext(result.hostContext);
        notify("ui/notifications/initialized", {});
        reportSize();

        if ("ResizeObserver" in window) new ResizeObserver(reportSize).observe(document.body);
    }).catch((error) => render(el("p", error.message, "note")));
})();
</script>
</body>
</html>
`;
