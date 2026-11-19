"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db";
import { isSignedIn } from "@/lib/auth";
import { ownerDate } from "@/lib/dates";
import { ingestRaw, notImported } from "@/lib/import/ingest";
import type { IngestResult } from "@/lib/import/types";
import { refreshDerived } from "@/lib/portfolio/refresh";

export async function uploadImports(_previous: IngestResult[], formData: FormData) {
    if (!(await isSignedIn(await headers()))) throw new Error("Not signed in");

    const results: IngestResult[] = [];

    for (const file of formData.getAll("files")) {
        if (!(file instanceof File) || file.size === 0) continue;

        try {
            const bytes = new Uint8Array(await file.arrayBuffer());

            results.push(await ingestRaw(db, { name: file.name, bytes }));
        } catch (error) {
            console.error(error);

            const message = error instanceof Error ? error.message : String(error);

            results.push(notImported(file.name, "failed", message));
        }
    }

    if (results.some(({ status }) => status === "applied")) {
        await refreshDerived(db, ownerDate(new Date()));
    }

    refresh();

    return results;
}
