# Лабораторна №7: k6 + JMeter

## Запуск

1. Запустити Docker Desktop.
2. `npm run db:lab7` — підняти окрему PostgreSQL з таблицями.
3. `npm run start:lab7` — запустити API (залишити термінал відкритим).
4. В іншому терміналі: `npm run perf:baseline`.
5. Після завершення baseline: `npm run perf:load`.
6. `npm run perf:stress`.
7. Виконати три аналогічні команди JMeter з таблиці нижче по черзі.
8. `npm run perf:compare` — оновити `performance/RESULTS.md` за останніми результатами.

Кожен профіль має 50 секунд навантаження. У k6 дається до 5 секунд на завершення
ітерацій. Профілі:

| Профіль | k6 | JMeter | Навантаження |
|---|---|---|---|
| Baseline | `npm run perf:baseline` | `npm run perf:jmeter:baseline` | 1 користувач, 50 с |
| Load | `npm run perf:load` | `npm run perf:jmeter:load` | 0 → 10 за 10 с, потім 40 с на 10 |
| Stress | `npm run perf:stress` | `npm run perf:jmeter:stress` | 0 → 10 → 25 → 50 за 30 с, потім 20 с на 50 |

Час запуску JVM та генерації звіту є додатковими до часу навантаження.
У JMeter HTTP timeout — 2 с; scheduler може зупинити потік між запитами.
У k6 є до 5 с для завершення ітерації; незавершені після цього перериваються.
10 користувачів — обраний навчальний профіль очікуваного навантаження,
а не виміряна кількість реальних користувачів сервісу.
Метрики summary охоплюють весь запуск, включно з розгоном;
стабільну ділянку слід також розглянути на графіках HTML-звіту.
Запускайте лише один інструмент за раз. Короткий формат обраний для демонстрації;
це не перевірка стабільності протягом годин.

k6 завантажений як portable Windows binary у `tools/k6/`; runner знаходить його автоматично.
На іншому комп'ютері можна встановити k6 окремо та додати його до PATH.

## Сценарій і критерії

Пауза 1 секунда після кожної ітерації в обох інструментах.
Чотири послідовні запити:

1. POST /customers → customerId.
2. POST /parcels → parcelId.
3. POST /shipments з отриманими ID → shipmentId.
4. GET /shipments/{shipmentId} → перевірка ID, reference, зв'язків, Registered та total=11000.

Коди унікальні між запусками. Після помилки залежні запити пропускаються, пауза зберігається.
Групування GET за name не створює окрему серію метрик для кожного ID.

Критерії: p95 HTTP response time < 500 мс, HTTP error rate < 1%,
частка запитів з неправильним статусом або тілом < 1%, усі checks успішні.
Порушення критеріїв завершує запуск з ненульовим exit code.

Кожен запуск створює окрему папку `performance/results/k6-<profile>-<runId>/`:

- `summary.json`: averageMs, p95Ms, requestsPerSecond, error rates та повні метрики.
- `report.html`: автономний графічний звіт, відкрити у браузері.

requestsPerSecond рахує всі виконані HTTP-запити, включно з неуспішними.
requestErrorRate враховує також помилки перевірки тіла відповіді.
Одна успішна ітерація — 4 запити. Дані зберігаються у БД після запуску.
Baseline використовує поточний стан БД; для майбутнього порівняння інструментів
потрібно забезпечити однаковий початковий стан та умови запуску.

Інструмент і API працюють на одному комп'ютері; результати характеризують це середовище.
JMeter встановлений у `tools/jmeter/`, окрема Java 17 — у `tools/java/`.
Плани `shipping-baseline.jmx`, `shipping-load.jmx`, `shipping-stress.jmx`
можна відкрити в JMeter GUI. Генератор: `node performance/build-jmeter.cjs`.
HTTP assertions перевіряють статуси та JSON; JSON extractors передають ID.
JMeter runner перевіряє p95 < 500 мс та error rate (включно з assertions) < 1%.
Його результати: `performance/results/jmeter-<profile>-<timestamp>/summary.json`,
`samples.csv`, `jmeter.log`, `report/index.html`.
У stress використовуються три групи потоків із затримками 0/10/20 с:
10 + 15 + 25 користувачів. Це наближує стадії k6 з точністю до часу старту потоку.

## Демонстрація викладачу

1. Показати `docker compose -f compose.lab7.yaml ps`: PostgreSQL має стан healthy.
2. Запустити API через `npm run start:lab7`, якщо він ще не працює.
3. Відкрити `shipping.k6.js`: показати workloads, thresholds і передачу
   customer.id / parcel.id / shipment.id з відповідей у наступні запити.
4. Запустити `npm run perf:baseline` або `npm run perf:load` в іншому терміналі.
   Runner k6 працює в quiet-режимі та показує підсумок. Для прогресу можна
   прибрати `--quiet` у `run-k6.cjs`.
5. Показати підсумкові метрики й exit code: 0 означає, що thresholds пройдені.
6. Відкрити `report.html` з папки цього запуску у браузері, показати графіки.
7. Порівняти з попереднім запуском, пояснити average, p95, requests/s та error rate.

Це справжні HTTP-запити до локального API та операції у PostgreSQL.
Користувачі синтетичні: кожен послідовно виконує 4 запити й чекає 1 секунду.
Фіксована кількість VU не гарантує фіксований RPS: він залежить від затримок API.

Офіційна документація:
- https://grafana.com/docs/k6/latest/set-up/install-k6/
- https://grafana.com/docs/k6/latest/using-k6/thresholds/
- https://grafana.com/docs/k6/latest/results-output/web-dashboard/
- https://jmeter.apache.org/usermanual/component_reference.html
- https://adoptium.net/installation/ci-scripts/
