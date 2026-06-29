# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # Start the proxy server on port 3000
npm test         # Run vitest tests
```

There is no build step — this is plain HTML/JS served directly.

To run a single test file or test by name:
```bash
npx vitest run index.test.js
npx vitest run --reporter=verbose -t "should render"
```

## Architecture

Two separate user-facing pages share a common API layer:

- **`index.html` + `index.js`** — family chore board. Uses ES module imports (`type="module"`). Exports `fetchActiveChores`, `completeChore`, `renderChores`, `KIDS`, `API_URL`, `API_TOKEN` for testability.
- **`scores.html`** — tablet scoreboard display. Fully self-contained (no ES modules, all logic inline) for compatibility with old iPad Safari. Includes `markDone()` to complete tasks directly from the tablet.
- **`server.js`** — Node.js HTTP server (no dependencies). Serves static files and proxies all `/api/*` requests to the Oikos backend at `10.0.0.202:3008`. The proxy is required because Oikos sends `Cross-Origin-Resource-Policy: same-origin`, which blocks browser fetches from any other origin.

### Routing

- `/` → serves `scores.html` (tablet view is the default)
- `/index.html` → serves the family chore board
- `/api/*` and `/health` → proxied to Oikos at `10.0.0.202:3008`

### Known issues

- The API token is hardcoded in `index.js` as `API_TOKEN`. This is intentional for simplicity (home LAN only) but should not be committed to a public repo.

## Oikos API

Base URL (relative, via proxy): `/api/v1`  
Auth: `Authorization: Bearer <token>` header on every request.

Key endpoint behaviors:
- `GET /tasks` — returns `{ data: [...] }`, not a plain array. Always destructure as `const { data: tasks } = await response.json()`.
- `PATCH /tasks/{id}/status` — correct endpoint to mark done; body: `{ status: "done" }`.
- `POST /tasks` — exists in the spec but returns 500 (known Oikos server bug); task creation is not functional via API.

Real field names on task objects (snake_case): `assigned_to`, `due_date`, `updated_at`, `is_recurring`.

## Kids and task filtering

```js
// Correct Oikos member IDs
{ 2: "Evelyn", 3: "Amelia", 5: "Eli" }
```

Recurring chores (`is_recurring: 1`) have `due_date: null`. The filter logic must handle both cases:
- Tasks with `due_date` → include if it matches today
- Tasks without `due_date` → include if `is_recurring` is truthy

"Done today" for recurring tasks is determined by whether `updated_at` starts with today's date string.

## Tests

Tests use **vitest** with **happy-dom** (simulated browser DOM). The test file (`index.test.js`) was written against an earlier version of the API and has several staleness issues — all must be fixed before the suite will pass:

| Location | Stale (test file) | Correct |
|---|---|---|
| Task field | `assigneeId` | `assigned_to` |
| Task field | `dueDate` | `due_date` |
| Status value | `"completed"` | `"done"` |
| fetch response | plain array | `{ data: [...] }` |
| complete endpoint | `tasks/${id}` | `tasks/${id}/status` |
| complete body | `{ status: 'completed' }` | `{ status: 'done' }` |

Use the real field names from the **Oikos API** section above when updating or adding tests.
