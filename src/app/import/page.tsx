import { desc } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SectionHeading } from "@/components/section-heading";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/table";
import { db } from "@/db";
import { rawImports } from "@/db/schema";
import { describeCoverage, describeRows, kindLabels } from "@/features/import/describe";
import { UploadForm } from "@/features/import/upload-form";
import { SiteHeader } from "@/features/site-header/site-header";
import { isSignedIn } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export default function ImportPage() {
    return (
        <>
            <SiteHeader current="/import" />
            <main className="mx-auto flex w-full max-w-300 flex-col gap-4 px-4 py-9 md:px-10">
                <SectionHeading as="h1">Import</SectionHeading>
                <UploadForm />
                <div className="mt-9">
                    <SectionHeading>Files</SectionHeading>
                </div>
                <Suspense fallback={<p className="type-label">Loading…</p>}>
                    <ImportedFiles />
                </Suspense>
            </main>
        </>
    );
}

async function ImportedFiles() {
    if (!(await isSignedIn(await headers()))) redirect("/login");

    const files = await db.select().from(rawImports).orderBy(desc(rawImports.updatedAt));

    if (files.length === 0) {
        return <p className="type-label">Nothing imported yet.</p>;
    }

    return (
        <Table className="min-w-160">
            <TableHeader>
                <TableHead>Date</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Covers</TableHead>
                <TableHead>Rows</TableHead>
            </TableHeader>
            <tbody>
                {files.map((file) => (
                    <TableRow key={file.id} className="align-top">
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                            {formatDate(file.updatedAt.slice(0, 10))}
                        </TableCell>
                        <TableCell className="font-semibold">
                            {file.kind === "chat" ? kindLabels.chat : file.originalName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                            {describeCoverage(file.coverageFrom, file.coverageTo)}
                        </TableCell>
                        <TableCell>
                            {file.status === "applied" ? (
                                describeRows(file.report.rows)
                            ) : (
                                <span className="text-destructive">{file.report.errors[0]}</span>
                            )}
                        </TableCell>
                    </TableRow>
                ))}
            </tbody>
        </Table>
    );
}
