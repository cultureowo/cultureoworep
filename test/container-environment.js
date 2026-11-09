
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("pg");
const { PostgreSqlContainer } = require("@testcontainers/postgresql");

async function startTestDatabase() {
    const container = await new PostgreSqlContainer("postgres:17-alpine")
        .withDatabase("delivery_test")
        .withUsername("test_user")
        .withPassword("test_password")
        .start();

    const client = new Client({
        host: container.getHost(),
        port: container.getPort(),
        database: container.getDatabase(),
        user: container.getUsername(),
        password: container.getPassword()
    });

    try {
        await client.connect();

        const migrationPath = path.join(
            __dirname,
            "..",
            "migrations",
            "V1__create_tables.sql"
        );

        const migration = await fs.readFile(migrationPath, "utf8");

        await client.query(migration);

        return { container, client };
    } catch (error) {
        await client.end().catch(() => {});
        await container.stop();
        throw error;
    }
}

async function stopTestDatabase(environment) {
    await environment.client.end();
    await environment.container.stop();
}

module.exports = {
    startTestDatabase,
    stopTestDatabase
};
