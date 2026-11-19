import { mkdir, writeFile } from "node:fs/promises";
import { connect, localConnection } from "../src/db/connect";
import { ownerDate } from "../src/lib/dates";
import { loadDemo } from "../src/lib/demo/load";

const folder = ".data/demo";

loadDemo(connect(localConnection), ownerDate(new Date()))
    .then(async ({ sync, files, results }) => {
        await mkdir(folder, { recursive: true });
        await Promise.all(files.map(({ name, bytes }) => writeFile(`${folder}/${name}`, bytes)));

        for (const failure of sync.failures) console.log(`Prices failed: ${failure}`);

        for (const { name, status, report } of results) {
            console.log(`${status} ${name}`);
            for (const error of report.errors) console.log(`  ${error}`);
        }

        console.log(`The demo files are in ${folder}/, to try /import with`);
        if (results.some(({ status }) => status !== "applied")) process.exitCode = 1;
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
