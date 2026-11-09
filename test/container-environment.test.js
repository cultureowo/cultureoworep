
"use strict";

const {
    startTestDatabase,
    stopTestDatabase
} = require("./container-environment");

describe("PostgreSQL Testcontainers environment", () => {
    let environment;

    beforeAll(async () => {
        environment = await startTestDatabase();
    }, 120000);

    afterAll(async () => {
        if (environment) {
            await stopTestDatabase(environment);
        }
    }, 30000);

    test("starts PostgreSQL and applies migrations automatically", async () => {
        const result = await environment.client.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
        );

        const tables = result.rows.map(row => row.table_name);

        expect(tables).toContain("customers");
        expect(tables).toContain("parcels");
        expect(tables).toContain("shipments");
    });
});
