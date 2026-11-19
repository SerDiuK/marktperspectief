import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { get, type ListBlobResultBlob, list, put } from "@vercel/blob";

const folder = ".data/blob";
const inBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export async function putRaw(pathname: string, bytes: Uint8Array) {
    if (inBlob()) {
        await put(pathname, Buffer.from(bytes), { access: "private", allowOverwrite: true });

        return;
    }

    const file = join(folder, pathname);

    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes);
}

export async function listRaw(prefix: string) {
    if (inBlob()) {
        const blobs: ListBlobResultBlob[] = [];
        let cursor: string | undefined;

        do {
            const page = await list({ prefix, cursor });

            blobs.push(...page.blobs);
            cursor = page.cursor;
        } while (cursor);

        return blobs.map(({ pathname, uploadedAt }) => ({ pathname, uploadedAt }));
    }

    const names = await readdir(join(folder, prefix), { recursive: true }).catch(() => []);
    const files = await Promise.all(
        names.map(async (name) => {
            const file = join(folder, prefix, name);
            const stats = await stat(file);

            return stats.isFile() ? [{ pathname: relative(folder, file), uploadedAt: stats.mtime }] : [];
        }),
    );

    return files.flat();
}

export async function getRaw(pathname: string) {
    if (!inBlob()) return new Uint8Array(await readFile(join(folder, pathname)));

    const stored = await get(pathname, { access: "private" });

    return new Uint8Array(await new Response(stored?.stream).arrayBuffer());
}
