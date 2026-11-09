const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const profile = process.argv[2];
if (!['baseline', 'load', 'stress'].includes(profile)) throw new Error('Choose baseline, load or stress');
const javaDirectory = path.join(root, 'tools', 'java');
const localJava = fs.existsSync(javaDirectory) && fs.readdirSync(javaDirectory).find(name => name.startsWith('jdk-17') && fs.statSync(path.join(javaDirectory, name)).isDirectory());
const javaHome = localJava ? path.join(javaDirectory, localJava) : process.env.JAVA_HOME;
if (!javaHome) throw new Error('Install local Java 17 under tools/java or set JAVA_HOME');
const java = path.join(javaHome, 'bin', 'java.exe');
if (!fs.existsSync(java)) throw new Error('Set JAVA_HOME to your Java installation');
const jmeterHome = path.join(root, 'tools', 'jmeter', 'apache-jmeter-5.6.3');
const resultDirectory = path.join(root, 'performance', 'results', `jmeter-${profile}-${Date.now()}`);
fs.mkdirSync(resultDirectory, { recursive: true });
const csvPath = path.join(resultDirectory, 'samples.csv');
const result = spawnSync(java, [
    '-jar', path.join(jmeterHome, 'bin', 'ApacheJMeter.jar'),
    '-n', '-t', path.join(__dirname, `shipping-${profile}.jmx`),
    '-l', csvPath, '-j', path.join(resultDirectory, 'jmeter.log'),
    '-e', '-o', path.join(resultDirectory, 'report'),
    '-Jjmeter.reportgenerator.overall_granularity=1000',
    '-Jjmeter.save.saveservice.output_format=csv',
    '-Jjmeter.save.saveservice.print_field_names=true',
    '-Jjmeter.save.saveservice.timestamp_format=ms',
    '-Jjmeter.save.saveservice.default_delimiter=,',
], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) { process.exitCode = result.status ?? 1; }
else {
    // JMeter's built-in dashboard statistics include exact aggregate percentiles.
    const statisticsPath = path.join(resultDirectory, 'report', 'statistics.json');
    if (!fs.existsSync(statisticsPath)) throw new Error(`JMeter did not generate statistics; inspect ${path.join(resultDirectory, 'jmeter.log')}`);
    const statistics = JSON.parse(fs.readFileSync(statisticsPath, 'utf8'));
    const total = statistics.Total;
    if (!total || !total.sampleCount) throw new Error('No HTTP samples recorded');
    const summary = {
        profile, timestamp: new Date().toISOString(), requests: total.sampleCount,
        averageMs: total.meanResTime, p95Ms: total.pct2ResTime,
        requestsPerSecond: total.throughput, requestErrorRate: total.errorPct / 100,
        thresholds: { p95Below500ms: total.pct2ResTime < 500, errorRateBelow1Percent: total.errorPct < 1 },
        statistics,
    };
    fs.writeFileSync(path.join(resultDirectory, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ ...summary, statistics: undefined }, null, 2));
    if (!Object.values(summary.thresholds).every(Boolean)) process.exitCode = 99;
}
console.log(`Results: ${resultDirectory}`);
