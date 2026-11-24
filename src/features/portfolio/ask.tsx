"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { LensMark } from "@/components/logo";
import type { Step } from "@/mcp/agent";

type Source = { url: string; title: string };
type Message = { role: "user" | "assistant"; content: string; sources: Source[] };
type Reply = Exclude<Step, { type: "tool" }>;

const doing: Record<string, string> = { web_search: "Searching the web", portfolio_summary: "Reading your portfolio" };

export function Ask({ instrumentId, name, hasThesis }: { instrumentId: string; name: string; hasThesis: boolean }) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [question, setQuestion] = useState("");
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const suggestions = [
        `What's the latest news on ${name}?`,
        `How has ${name} done since I bought it?`,
        ...(hasThesis ? ["Does my thesis still hold?"] : []),
        "How does it compare with the rest of my portfolio?",
    ];

    const handleChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => setQuestion(event.currentTarget.value),
        [],
    );

    const send = useCallback(
        async (text: string) => {
            const asked: Message[] = [...messages, { role: "user", content: text.trim(), sources: [] }];
            const sources: Source[] = [];
            let reply = "";
            let partial = "";
            let working = "Thinking";

            setQuestion("");
            setFailed(false);
            setPending(true);
            setStatus(working);
            setMessages([...asked, { role: "assistant", content: "", sources }]);

            try {
                const response = await fetch("/api/ask", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        instrumentId,
                        messages: asked.map(({ role, content }) => ({ role, content })),
                    }),
                });

                if (!response.ok || response.redirected || !response.body) {
                    throw new Error(`Ask failed with ${response.status}`);
                }

                const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

                for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
                    const lines = (partial + chunk.value).split("\n");

                    partial = lines.pop() ?? "";

                    for (const line of lines) {
                        const step = JSON.parse(line) as Reply;

                        if (step.type === "text") {
                            reply += step.text;
                            working = "Writing";
                        } else if (step.type === "status") {
                            working = (step.tool && doing[step.tool]) ?? "Thinking";
                        } else if (!sources.some(({ url }) => url === step.url)) {
                            sources.push({ url: step.url, title: step.title });
                        }
                    }

                    setStatus(working);
                    setMessages([...asked, { role: "assistant", content: reply, sources: [...sources] }]);
                }

                if (!reply.trim()) throw new Error("Lens wrote nothing");
            } catch {
                setMessages(messages);
                setQuestion(text);
                setFailed(true);
            } finally {
                setPending(false);
                setStatus(null);
            }
        },
        [instrumentId, messages],
    );

    const handleSubmit = useCallback(
        async (event: React.SubmitEvent<HTMLFormElement>) => {
            event.preventDefault();
            await send(question);
        },
        [send, question],
    );

    const handleSuggestion = useCallback(
        async (event: React.MouseEvent<HTMLButtonElement>) => {
            await send(event.currentTarget.value);
        },
        [send],
    );

    return (
        <div className="flex min-h-60 flex-1 flex-col gap-4 border-t-2 border-foreground pt-3.5">
            <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-contain">
                {messages.length > 0 ? (
                    <ol aria-live="polite" className="flex flex-col gap-5 transition private:blur-money">
                        {messages.map(({ role, content, sources }, index) =>
                            role === "user" ? (
                                <li
                                    key={index}
                                    className="ml-12 self-end bg-primary/12 px-3.5 py-2.5 text-sm whitespace-pre-wrap"
                                >
                                    <span className="sr-only">You: </span>
                                    {content}
                                </li>
                            ) : (
                                <li key={index} className="flex flex-col gap-1.5">
                                    <span className="type-label flex items-center gap-1.5">
                                        <LensMark className="size-3.5" />
                                        Lens
                                    </span>
                                    {content && <p className="text-sm whitespace-pre-wrap">{content}</p>}
                                    {sources.length > 0 && (
                                        <ul className="flex flex-col gap-1 text-note">
                                            {sources.map(({ url, title }) => (
                                                <li key={url}>
                                                    <a
                                                        href={url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-muted-foreground underline transition-colors hover:text-foreground"
                                                    >
                                                        {title}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {status && index === messages.length - 1 && (
                                        <p className="flex items-baseline gap-2 text-sm">
                                            <span key={status} className="shimmer">
                                                {status}
                                            </span>
                                            <span
                                                aria-hidden="true"
                                                className="elapsed text-muted-foreground tabular-nums"
                                            />
                                        </p>
                                    )}
                                </li>
                            ),
                        )}
                    </ol>
                ) : (
                    <ul className="flex flex-wrap gap-2">
                        {suggestions.map((suggestion) => (
                            <li key={suggestion}>
                                <Button size="sm" value={suggestion} onClick={handleSuggestion}>
                                    {suggestion}
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {failed && (
                <p role="alert" className="text-sm text-destructive">
                    {"Lens couldn't answer."}
                </p>
            )}
            <form onSubmit={handleSubmit} className="flex gap-2">
                <Input
                    value={question}
                    onChange={handleChange}
                    placeholder={`Ask about ${name}`}
                    aria-label="Question"
                    maxLength={4000}
                    autoComplete="off"
                    className="flex-1"
                />
                <Button type="submit" variant="primary" disabled={pending || !question.trim()}>
                    Send
                </Button>
            </form>
        </div>
    );
}
