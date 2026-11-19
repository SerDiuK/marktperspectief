import { connect, defaultConnection, localConnection } from "../src/db/connect";
import { seed } from "../src/db/seed";

const db = connect(defaultConnection);

seed(db)
    .then(({ instruments }) => {
        const target = defaultConnection === localConnection ? "local" : "production";

        console.log(`Seed applied to the ${target} database (instruments: ${instruments})`);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
