import { getEffectiveTrades } from "@/db/ledger";
import { type Call, type Case, draftOf, type Run, seededTrades } from "./harness";

const writes = /^(add_|propose_|confirm_|undo_)/;
const buy = "I bought 10 Exor on DEGIRO today at €33.10, with €2 in fees.";

const named = (calls: Call[], name: string, turn?: number) =>
    calls.filter((call) => call.name === name && (turn === undefined || call.turn === turn));

const tradesAdded = async ({ db }: Run) => (await getEffectiveTrades(db)).length - seededTrades;

const failIf = (condition: boolean, failure: string) => (condition ? [failure] : []);

export const cases: Case[] = [
    {
        name: "records a buy only once the user agrees to its preview",
        host: "chat",
        turns: [buy, "Yes, that's right, record it."],
        async check(run) {
            const preview = named(run.calls, "add_transaction", 0).findLast(draftOf);
            const [confirm] = named(run.calls, "confirm_transaction", 1);

            return [
                ...failIf(
                    !preview ||
                        preview.input.broker !== "degiro" ||
                        preview.input.side !== "buy" ||
                        preview.input.quantity !== 10 ||
                        preview.input.price !== 33.1 ||
                        preview.input.feesEur !== 2,
                    `the preview's input was ${JSON.stringify(preview?.input)}`,
                ),
                ...failIf(!confirm || confirm.input.draftId !== draftOf(preview), "the agreed draft wasn't confirmed"),
                ...failIf((await tradesAdded(run)) !== 1, `${await tradesAdded(run)} trades were recorded, not 1`),
            ];
        },
    },
    {
        name: "leaves saving to the card's Confirm button",
        host: "card",
        turns: [buy, "Yes, that's right, record it."],
        async check(run) {
            return [
                ...failIf(named(run.calls, "add_transaction").length === 0, "no preview"),
                ...failIf((await tradesAdded(run)) !== 0, "a trade was recorded without the button"),
                ...failIf(
                    !/press|click|tap|button/i.test(run.replies[1]),
                    "the answer to the yes doesn't point to the Confirm button",
                ),
            ];
        },
    },
    {
        name: "passes on the preview's warning about a price far from the close",
        host: "chat",
        turns: ["Bought 10 Exor at DEGIRO today for 3.31 each."],
        check({ calls, replies }) {
            const [preview] = named(calls, "add_transaction");

            return [
                ...failIf(preview?.input.price !== 3.31, `the preview's price was ${preview?.input.price}`),
                ...failIf(!/close|33[.,]2|15\s?%/i.test(replies[0]), "the reply doesn't pass on the warning"),
            ];
        },
    },
    {
        name: "doesn't bend a refused sell into one the ledger accepts",
        host: "chat",
        turns: ["I sold 50 KBC at Saxo yesterday at €70."],
        check({ calls, replies }) {
            const refused = named(calls, "add_transaction").some(
                ({ input, result }) => input.side === "sell" && result.isError,
            );

            return [
                ...failIf(calls.some(draftOf), "a draft was made for a sell of shares not held"),
                ...failIf(
                    !refused && named(calls, "portfolio_summary").length === 0,
                    "it neither tried the sell nor read the holdings",
                ),
                ...failIf(
                    !/\b(hold|held|own|position)\b|don['’]t have|do not have/i.test(replies[0]),
                    "the reply doesn't say the shares aren't held",
                ),
            ];
        },
    },
    {
        name: "answers a question about the portfolio without writing",
        host: "card",
        turns: ["Which holding is my biggest, and how is the portfolio doing?"],
        check({ calls, replies }) {
            const heineken = replies[0].search(/heineken/i);
            const exor = replies[0].search(/exor/i);

            return [
                ...failIf(named(calls, "portfolio_summary").length === 0, "the summary wasn't read"),
                ...failIf(
                    calls.some(({ name }) => writes.test(name)),
                    `it called ${calls.map(({ name }) => name).join(", ")}`,
                ),
                ...failIf(
                    heineken === -1 || (exor !== -1 && exor < heineken),
                    "the reply doesn't lead with Heineken, the biggest holding",
                ),
            ];
        },
    },
    {
        name: "proposes a thesis in the user's words, with what would prove each pillar wrong",
        host: "chat",
        turns: [
            "Save my thesis for Exor. It's a bargain: it trades at a wide discount to NAV that its buybacks should close, which is wrong if they stop buying back shares. And the Ferrari stake keeps compounding, wrong if Ferrari's operating margin falls below 25%.",
        ],
        check({ calls }) {
            const thesis = named(calls, "propose_thesis").findLast(draftOf);
            const pillars = (thesis?.input.pillars ?? []) as { claim?: string; wrongIf?: string }[];

            return [
                ...failIf(thesis?.input.type !== "bargain", `the type was ${thesis?.input.type}`),
                ...failIf(
                    pillars.length !== 2 || pillars.some(({ wrongIf }) => !wrongIf),
                    `the pillars were ${JSON.stringify(pillars)}`,
                ),
                ...failIf(named(calls, "confirm_thesis").length > 0, "it confirmed before the user agreed"),
            ];
        },
    },
    {
        name: "undoes the trade the user takes back, and only that one",
        host: "chat",
        turns: [buy, "Yes, record it.", "Sorry, my mistake: that order never filled. Take it out again."],
        async check(run) {
            const [confirm] = named(run.calls, "confirm_transaction");
            const [undo] = named(run.calls, "undo_chat_transaction", 2);

            return [
                ...failIf(!undo || undo.input.draftId !== confirm?.input.draftId, "the confirmed trade wasn't undone"),
                ...failIf((await tradesAdded(run)) !== 0, `${await tradesAdded(run)} trades remain from the chat`),
            ];
        },
    },
];
