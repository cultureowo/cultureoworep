const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const profile = process.argv[2];
if (!['baseline', 'load', 'stress'].includes(profile)) throw new Error('Supported profiles: baseline, load, stress');
function findExecutable(directory) {
    if (!fs.existsSync(directory)) return null;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isFile() && entry.name === 'k6.exe') return fullPath;
        if (entry.isDirectory()) {
            const found = findExecutable(fullPath);
            if (found) return found;
        }
    }
    return null;
}
const executable = findExecutable(path.join(root, 'tools', 'k6')) || 'k6';
const runId = Date.now().toString();
const resultDirectory = `performance/results/k6-${profile}-${runId}`;
fs.mkdirSync(path.join(root, resultDirectory), { recursive: true });
const result = spawnSync(executable, ['run', '--quiet', 'performance/shipping.k6.js'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, PROFILE: profile, RUN_ID: runId, RESULT_DIR: resultDirectory,
        K6_WEB_DASHBOARD: 'true', K6_WEB_DASHBOARD_PORT: '-1',
        K6_WEB_DASHBOARD_EXPORT: `${resultDirectory}/report.html` },
});
if (result.error) console.error(result.error.message);
console.log(`Results: ${resultDirectory}`);
process.exitCode = result.status ?? 1;
