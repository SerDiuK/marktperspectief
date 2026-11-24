import { z } from "zod";
import { db } from "@/db";
import { isSignedIn } from "@/lib/auth";
import { ask, type Step } from "@/mcp/agent";

const askInput = z.object({
    instrumentId: z.string().max(100),
    messages: z
        .array(
            z.discriminatedUnion("role", [
                z.object({ role: z.literal("user"), content: z.string().trim().min(1).max(4000) }),
                z.object({ role: z.literal("assistant"), content: z.string().trim().min(1).max(64000) }),
            ]),
        )
        .max(39)
        .refine(
            (messages) =>
                messages.length % 2 === 1 && messages.every(({ role }, i) => role === (i % 2 ? "assistant" : "user")),
            "Messages alternate, from the user's first to the user's last",
        ),
});

function replyOf(steps: AsyncGenerator<Step>) {
    return new ReadableStream<string>({
        async pull(controller) {
            try {
                for (let next = await steps.next(); !next.done; next = await steps.next()) {
                    if (next.value.type !== "tool") return controller.enqueue(`${JSON.stringify(next.value)}\n`);
                }

                controller.close();
            } catch (error) {
                console.error(error);
                controller.error(error);
            }
        },
        async cancel() {
            await steps.return(undefined);
        },
    });
}

export async function POST(request: Request) {
    if (!(await isSignedIn(request.headers))) return new Response(null, { status: 401 });

    const input = askInput.safeParse(await request.json().catch(() => null));

    if (!input.success) return new Response(null, { status: 400 });

    const steps = await ask(db, input.data, new Date());

    if (!steps) return new Response(null, { status: 404 });

    return new Response(replyOf(steps).pipeThrough(new TextEncoderStream()), {
        headers: { "content-type": "application/x-ndjson", "x-content-type-options": "nosniff" },
    });
}
