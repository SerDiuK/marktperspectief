import { connect, localConnection } from "../src/db/connect";
import { ownerDate } from "../src/lib/dates";
import { syncMarketData } from "../src/lib/market/sync";
import { refreshDerived } from "../src/lib/portfolio/refresh";

const db = connect(localConnection);

syncMarketData(db)
    .then(async (sync) => {
        const derived = await refreshDerived(db, ownerDate(new Date()));

        console.log(JSON.stringify({ ...sync, ...derived }, null, 2));
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
