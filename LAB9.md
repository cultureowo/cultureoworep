# Лабораторна робота №9 — CI/CD and Continuous Testing

## Мета та SUT

Автоматизувати збирання й тестування SUT B — сервісу доставки (варіант 04).
Платформа: GitHub Actions. Конфігурація: `.github/workflows/ci.yml`.
Код застосунку в `src/` не змінено.

## Структура pipeline

`push / pull_request → build → unit → integration-api`

1. **build**: Node.js 24, `npm ci`, `npm run build`. Для JavaScript без
   транспіляції build перевіряє синтаксис та збирає джерела, міграції,
   скрипти й manifest/lockfile у `dist/`. Результат — artifact `build`.
2. **unit**: перевірки тарифу, знижок, повернення коштів і некоректних
   параметрів без БД та мережі. Результат — `unit-report/unit.json`.
3. **integration-api**: PostgreSQL 17 як service container, перевірка готовності,
   застосування SQL-міграції, тести репозиторіїв і сервісу та REST API через
   Supertest. API-тести створюють окрему БД через Testcontainers; Docker доступний
   на GitHub runner. Результат — `integration-api-report/integration-api.json`.

Jest запускається з `--runInBand`, щоб тести з очищенням таблиць не конфліктували.
Усі залежності встановлюються через lockfile (`npm ci`). Тести старих лабораторних
із WireMock не входять до цього pipeline.

`needs` задає послідовність jobs. Помилка команди завершує job зі статусом failed;
`continue-on-error` і придушення exit code відсутні. `if: always()` використано
лише для збереження звітів після тестів, зокрема невдалих, і не змінює статус job.
Артефакти зберігаються 14 днів. Jest JSON містить назви тестів, статуси,
лічильники та `failureMessages`.

## Демонстрація на GitHub

Локальний Git ініціалізовано (гілка `main`). Docker запущено; локально успішно
виконано всі 31 інтеграційний/API-тест, а також 12 unit-тестів і build.
Віддалений репозиторій ще потрібно підключити. Локальна перевірка не є доказом
успішного GitHub pipeline.

1. Додати файли проєкту до свого GitHub-репозиторію, включно з прихованою папкою
   `.github`, `package.json`, `package-lock.json`, `scripts/`, `src/`, `test/`
   та `migrations/`. Не завантажувати `node_modules`, `tools`, локальні `.env`
   з паролями або результати навантажувальних тестів.
2. Зробити commit і push. У вкладці **Actions → Lab 9 CI** відкрити автоматичний
   запуск і дочекатися зелених `build`, `unit`, `integration-api`.
   Зберегти URL запуску та скриншот.
3. Для навмисної помилки в `test/service.integration.test.js` знайти тест
   `new shipment is persisted with Registered status` і змінити лише його останню
   перевірку з `expect(stored.status).toBe(ShipmentStatus.REGISTERED)`
   на `expect(stored.status).toBe(ShipmentStatus.CANCELLED)`.
4. Зробити окремий commit і push. `build` та `unit` мають пройти,
   `integration-api` — впасти. Нове відправлення має стан `Registered`,
   а навмисно помилковий тест очікує `Cancelled`.
5. Відкрити failed job → крок `npm run test:integration ...`.
   Знайти назву тесту й повідомлення Expected/Received.
   На сторінці запуску завантажити artifact `integration-api-report`;
   у JSON знайти `failureMessages` та `numFailedTests`.
6. Повернути `REGISTERED`, зробити commit і push та перевірити відновлення
   зеленого статусу. Не залишати навмисну помилку у фінальному коді.

Для захисту потрібні фактичні URL/скриншоти успішного та невдалого запусків,
логи причини падіння і завантажений artifact. Їх слід додати після push.

## Локальні команди

```powershell
npm ci
npm run build
New-Item -ItemType Directory -Force reports
npm run test:unit -- --ci --json --outputFile=reports/unit.json
```

Для `npm run db:migrate` і тестів репозиторіїв/сервісу потрібна окрема тестова
PostgreSQL БД із параметрами `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
`DB_PASSWORD`. Міграцію запускати на порожній БД. Тести очищують її таблиці,
тому використовувати лише тестову БД. API-тести потребують запущеного Docker.

```powershell
npm run db:migrate
npm run test:integration -- --ci --json --outputFile=reports/integration-api.json
```

## Терміни для захисту

| Термін | Значення в цій роботі |
| --- | --- |
| CI | Автоматичне збирання та тестування після змін коду |
| Pipeline | Послідовність build → unit → integration-api |
| Stage / job | Окремий етап; у GitHub Actions тут це окремий job |
| Trigger | Push або pull request; ручний запуск також доступний |
| Runner | Віртуальна машина Ubuntu, що виконує job |
| Artifact | Збережений пакет build або JSON-звіт тестів |
| Test report | Результати Jest із назвами, статусами та причинами помилок |

CI тут реалізовано; deployment не додається, бо методичка його не вимагає.

Джерело: [GitHub Actions — збереження artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data).
