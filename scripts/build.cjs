"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// Plain JavaScript needs no transpilation: validate and package runnable sources.
for (const file of ["index.js", ...fs.readdirSync("src").filter(f => f.endsWith(".js")).map(f => path.join("src", f))]) {
    execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
fs.mkdirSync("dist", { recursive: true });
for (const entry of ["src", "migrations", "scripts", "index.js", "package.json", "package-lock.json"]) {
    fs.cpSync(entry, path.join("dist", entry), { recursive: true });
}
console.log("Build ready: dist/");
