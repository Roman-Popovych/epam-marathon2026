# EPAM IT Marathon 2026 — домашні завдання

| Папка | Завдання | Що зроблено |
|---|---|---|
| [`backend-hw5/`](backend-hw5) | Backend (.NET) #5: груповий pre-order, функціонал Owner | Рівні 1–3: `GET /guest/groups/{id}/sessions`, `GET /reservations/{id}/guest-session-id`, `POST /group-reservations/{id}/submit`, а також виправлений `DELETE …/sessions/{guestSessionId}` |
| [`frontend-hw6/`](frontend-hw6) | Frontend #6: екран Owner групового pre-order | Рівні 1–3 і бонус Remove Guest |

## Backend (`backend-hw5`)
- Код: `backend/restaurant-backend-app/dnapp/lambdas/api-handler` (Handlers, Services, Repositories, Routing).
- Маршрути зареєстровані в `Routing/RouteRegistry.cs` і в `deployment_resources.json`.
- Документація: `docs/ApiRoutes.md`, `swagger_src/swagger-ui/swagger-endpoints.yaml`, `CHANGELOG.md`.
- Тести: `cd backend/restaurant-backend-app/Tests && dotnet test` — 165 тестів (141 початкових і 24 нових).
- Наскрізна перевірка на розгорнутому API: `node backend/restaurant-backend-app/scripts/e2e-group-preorder.js <api-url>` — 37 перевірок, дані створюються і видаляються скриптом.

## Frontend (`frontend-hw6`)
- Код: `frontend/restaurant-frontend-app/src/app` — `pages/group-order-page`, `components/group-orders/participant-card`, `services/group-orders`.
- Запуск: `cd frontend/restaurant-frontend-app && npm ci && npm start`, далі `http://localhost:4200/reservations/demo-reservation/group-order?demo`.
- Тести домашки: `npm run test:hw` — 67 тестів, усі зелені. Також проходять `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit` і `BACKEND_URL=https://example.com npm run build`.

## AI
Робота виконана за допомогою AI-асистента (Claude Code). Результат перевірено юніт-тестами, e2e-скриптом на розгорнутому API та запуском застосунку в браузері.
