const fs = require('node:fs');
const path = require('node:path');
const directory = path.join(__dirname, 'results');
const rows = [];
for (const tool of ['k6', 'jmeter']) {
    for (const profile of ['baseline', 'load', 'stress']) {
        const name = fs.readdirSync(directory).filter(n => n.startsWith(`${tool}-${profile}-`)
            && fs.existsSync(path.join(directory, n, 'summary.json'))).sort().at(-1);
        if (!name) throw new Error(`Missing results for ${tool} ${profile}`);
        const summary = JSON.parse(fs.readFileSync(path.join(directory, name, 'summary.json')));
        rows.push({ tool, profile, name, ...summary });
    }
}
const format = value => value.toFixed(2);
const table = '| Інструмент | Профіль | Запити | Average, мс | p95, мс | Запити/с | Помилки |\n'
    + '|---|---|---:|---:|---:|---:|---:|\n'
    + rows.map(r => `| ${r.tool} | ${r.profile} | ${r.requests} | ${format(r.averageMs)} | ${format(r.p95Ms)} | ${format(r.requestsPerSecond)} | ${format(r.requestErrorRate * 100)}% |`).join('\n');
const sources = rows.map(r => `- ${r.tool} ${r.profile}: [метрики](results/${r.name}/summary.json), [графіки](results/${r.name}/${r.tool === 'k6' ? 'report.html' : 'report/index.html'}).`).join('\n');
const text = `# Результати лабораторної №7\n\n${table}\n\n`
    + '## Умови\n\nУ кожному запуску 50 с навантаження, у k6 до 5 с на завершення. '
    + 'Baseline: 1 користувач. Load: 0 → 10 за 10 с, потім 40 с на 10. '
    + 'Stress: 0 → 10 → 25 → 50 за 30 с, потім 20 с на 50. '
    + 'Сценарій однаковий: створення клієнта, посилки, відправлення, читання відправлення; пауза 1 с. '
    + 'API, PostgreSQL та генератор навантаження працюють на одному комп’ютері; запуски послідовні. '
    + 'Метрики охоплюють весь запуск, включно з розгоном. Запити/с враховують усі HTTP-запити.\n\n'
    + '## Інтерпретація\n\nПорівнюйте навантаження в межах одного інструмента: зростання requests/s показує '
    + 'збільшення обсягу роботи; зростання p95 означає погіршення затримок найповільніших запитів. '
    + 'Якщо stress до 50 користувачів проходить критерії, межа стійкості не знайдена. '
    + 'Зниження затримок у load відносно baseline може пояснюватись прогріванням і варіаціями середовища; '
    + 'ці причини окремо не вимірювались.\n\n'
    + 'k6 задає сценарій, checks і thresholds у JavaScript та повертає ненульовий exit code при їх порушенні. '
    + 'JMeter використовує JMX, HTTP samplers, JSON extractors і assertions; runner додатково оцінює p95 < 500 мс '
    + 'та error rate < 1%. Його error rate включає помилки assertions. k6 має окремі HTTP error rate і request_errors. '
    + 'Додатковий k6 threshold checks=100% суворіший за загальну межу помилок 1%.\n\n'
    + 'Профілі близькі, але не ідентичні: JMeter запускає потоки дискретно, stress складається з трьох груп; '
    + 'scheduler може зупинити потік між HTTP-запитами. k6 дає 5 с на завершення ітерації. '
    + 'JMeter throughput вимірюється між першою та останньою HTTP-вибіркою, '
    + 'а k6 — за тривалістю запуску; остання пауза може вплинути на порівняння. '
    + 'JMeter elapsed та k6 http_req_duration мають різні правила врахування встановлення з’єднання, '
    + 'тому невеликі відмінності не доводять різну швидкість самого API.\n\n'
    + 'БД між цими запусками не очищалась; кількість записів і стан кешів різні. '
    + 'Це обмежує точність порівняння. Короткі 50-секундні тести придатні для навчальної демонстрації, '
    + 'але не підтверджують тривалу стабільність системи. Для точнішого порівняння потрібні однаковий '
    + 'початковий набір даних та повторні вимірювання. Старі довгі запуски збережені як історія; '
    + 'таблиця використовує останні завершені результати.\n\n## Артефакти\n\n' + sources + '\n';
fs.writeFileSync(path.join(__dirname, 'RESULTS.md'), text);
console.log(table);
