import { createHash } from "node:crypto";
import { connect, type Db, localConnection, tursoConnection } from "../src/db/connect";
import { getEffectiveTrades } from "../src/db/ledger";
import { corporateActions, fees, income, instrumentAliases, optionTrades, theses } from "../src/db/schema";
import { ownerDate } from "../src/lib/dates";
import { rebuild } from "../src/lib/import/ingest";
import { refreshDerived } from "../src/lib/portfolio/refresh";

const local = connect(localConnection);
const production = connect(tursoConnection());

async function ledgerHash(db: Db) {
    const tables = await Promise.all([
        getEffectiveTrades(db),
        db.select().from(optionTrades),
        db.select().from(income),
        db.select().from(fees),
        db.select().from(corporateActions),
        db.select().from(instrumentAliases),
        db.select().from(theses),
    ]);
    const rows = tables.flatMap((table, index) =>
        table.map((row) => JSON.stringify({ ...row, table: index, id: null, rawImportId: null })),
    );

    return createHash("sha256").update(rows.sort().join("\n")).digest("hex");
}

rebuild(local)
    .then(async (files) => {
        for (const file of files) {
            console.log(`${file.status} ${file.name}`);
            for (const error of file.report.errors) console.log(`  ${error}`);
        }

        const [rebuilt, live] = await Promise.all([ledgerHash(local), ledgerHash(production)]);
        const verdict = rebuilt === live ? "match" : "differ from";

        console.log(`Rebuilt ${files.length} files: the ledger tables ${verdict} production`);
        if (rebuilt !== live) process.exitCode = 1;

        const derived = await refreshDerived(local, ownerDate(new Date()));

        console.log(`Refreshed the daily series: ${derived.days} days to ${derived.asOf}`);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
