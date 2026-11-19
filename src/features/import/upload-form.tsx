"use client";

import { useActionState } from "react";
import { Button } from "@/components/button";
import type { IngestResult } from "@/lib/import/types";
import { uploadImports } from "./actions";
import { describeCoverage, describeRows, kindLabels } from "./describe";

const outcomes: Record<IngestResult["status"], string> = {
    applied: "Imported",
    duplicate: "Already imported",
    failed: "Not imported",
    rejected: "Not recognised",
};

export function UploadForm() {
    const [results, formAction, pending] = useActionState(uploadImports, []);

    return (
        <>
            <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                    type="file"
                    name="files"
                    multiple
                    required
                    accept=".csv,.xlsx,.json"
                    aria-label="Broker exports"
                    className="text-sm text-muted-foreground file:mr-4 file:h-10 file:cursor-pointer file:border file:border-input file:bg-transparent file:px-4 file:text-sm file:font-semibold file:text-foreground hover:file:bg-muted"
                />
                <Button variant="primary" type="submit" disabled={pending}>
                    {pending ? "Importing…" : "Import"}
                </Button>
            </form>

            <ul aria-live="polite" className="text-sm">
                {results.map((result, index) => {
                    const ok = result.status === "applied" || result.status === "duplicate";
                    const coverage = describeCoverage(result.coverageFrom, result.coverageTo);

                    return (
                        <li key={index} className="border-b py-3 first:border-t">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                                <span className="font-semibold">{result.name}</span>
                                <span className={ok ? "text-muted-foreground" : "font-semibold text-destructive"}>
                                    {outcomes[result.status]}
                                </span>
                            </div>
                            {result.kind && (
                                <p className="text-muted-foreground">
                                    {kindLabels[result.kind]}
                                    {coverage && `, ${coverage}`}
                                </p>
                            )}
                            {ok && <p className="tabular-nums">{describeRows(result.report.rows)}</p>}
                            {result.report.errors.length > 0 && (
                                <ul className="mt-1 list-disc pl-5 text-destructive">
                                    {result.report.errors.map((error) => (
                                        <li key={error}>{error}</li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    );
                })}
            </ul>
        </>
    );
}
