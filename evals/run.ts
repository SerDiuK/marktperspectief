import { appendFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cases } from "./cases";
import { type Case, confirmedOnlyAfterAnswer, model, type Run, run } from "./harness";

const runs = Number(process.env.EVAL_RUNS ?? 3);
const only = process.env.EVAL_CASE;

type Outcome = { case: Case; failures: string[]; run?: Run };

async function attempt(evalCase: Case): Promise<Outcome> {
    try {
        const result = await run(evalCase);
        const failures = [...confirmedOnlyAfterAnswer(result), ...(await evalCase.check(result))];

        return { case: evalCase, failures, run: result };
    } catch (error) {
        return { case: evalCase, failures: [`threw ${error instanceof Error ? error.message : error}`] };
    }
}

async function pool<T>(jobs: (() => Promise<T>)[], size: number) {
    const results: T[] = [];
    let next = 0;

    await Promise.all(
        Array.from({ length: size }, async () => {
            while (next < jobs.length) {
                const index = next++;

                results[index] = await jobs[index]();
            }
        }),
    );

    return results;
}

async function main() {
    process.chdir(await mkdtemp(join(tmpdir(), "marktperspectief-evals-")));

    const selected = cases.filter(({ name }) => !only || name.includes(only));
    const outcomes = await pool(
        selected.flatMap((evalCase) => Array.from({ length: runs }, () => () => attempt(evalCase))),
        4,
    );
    const rows = selected.map((evalCase) => {
        const mine = outcomes.filter((outcome) => outcome.case === evalCase);

        return { evalCase, passed: mine.filter(({ failures }) => failures.length === 0).length, mine };
    });

    for (const { evalCase, mine } of rows) {
        for (const { failures, run: result } of mine.filter(({ failures }) => failures.length)) {
            console.log(`\n✗ ${evalCase.name} (${evalCase.host})\n  ${failures.join("\n  ")}`);

            for (const [turn, message] of evalCase.turns.entries()) {
                const called = result?.calls.filter((call) => call.turn === turn) ?? [];

                console.log(`  user: ${message}`);
                for (const call of called) console.log(`  → ${call.name} ${JSON.stringify(call.input)}`);
                console.log(`  claude: ${result?.replies[turn]?.replaceAll("\n", " ") ?? ""}`);
            }
        }
    }

    const table = [
        `Model \`${model}\`, ${runs} runs per case`,
        "",
        "| Case | Client | Passed |",
        "| --- | --- | --- |",
        ...rows.map(
            ({ evalCase, passed }) =>
                `| ${evalCase.name} | ${evalCase.host} | ${passed === runs ? "✓" : "✗"} ${passed}/${runs} |`,
        ),
    ].join("\n");

    console.log(`\n${table}`);

    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);

    process.exit(rows.every(({ passed }) => passed === runs) ? 0 : 1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
