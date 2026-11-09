# Лабораторна робота №9 — CI/CD and Continuous Testing

SUT B: сервіс доставки, варіант 04. Node.js, Jest, PostgreSQL, Supertest.

Pipeline запускається автоматично після push і pull request:
**build → unit → integration/API**. Помилка тесту завершує pipeline зі статусом failed;
JSON-звіти зберігаються як artifacts навіть після падіння.

| Сценарій | GitHub Actions | Результат |
| --- | --- | --- |
| Правильний код, `main` | [Успішний запуск](https://github.com/cultureowo/cultureoworep/actions/runs/42594519901) | Усі jobs успішні; 12 unit + 31 integration/API |
| Навмисна помилка, `lab9/intentional-failure` | [Невдалий запуск](https://github.com/cultureowo/cultureoworep/actions/runs/42594573322) | Build і unit успішні; 1 integration-тест впав |

Причина навмисного падіння: тест очікує `Cancelled` для нового відправлення,
хоча правильний статус — `Registered`. У `main` тест правильний.

[Інструкція для захисту та глосарій](LAB9.md) ·
[CI configuration](.github/workflows/ci.yml) ·
[Збережені звіти з GitHub](docs/lab9/)
