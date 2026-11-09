"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { connect } = require("../src/database");

async function main() {
    const client = await connect();
    try {
        await client.query(await fs.readFile(path.join(__dirname, "../migrations/V1__create_tables.sql"), "utf8"));
    } finally {
        await client.end();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
