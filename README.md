# Chore List
<img width="1229" height="750" alt="image" src="https://github.com/user-attachments/assets/1c071701-e5d7-41cb-b8df-40609f0da922" />

A family chore management system with a web interface and tablet-optimized scoreboard.

## Overview

This project provides a family chore management system with two user-facing pages:

- **Family Chore Board** (`index.html`) — Full-featured chore management with ES modules
- **Tablet Scoreboard** (`scores.html`) — Self-contained display optimized for old iPad Safari

The system connects to an Oikos backend API for task management.

## Features

- Family chore assignment and tracking
- Recurring chore support
- Tablet-optimized scoreboard display
- REST API proxy for Oikos backend
- Cross-origin resource policy handling

## Project Structure

```
Chore List/
├── index.html          # Family chore board (ES modules)
├── index.js            # Main logic for chore board
├── scores.html         # Tablet scoreboard (self-contained)
├── server.js           # Node.js HTTP server (no dependencies)
├── package.json        # Project dependencies
├── vitest.config.js    # Test configuration
├── chores.json         # Sample chore data
├── calendar.json       # Calendar data
├── Dockerfile          # Container configuration
├── docker-compose.yml  # Docker Compose setup
└── AGENTS.md           # Agent development guidance
```

## Getting Started

### Prerequisites

- Node.js (v14+)
- npm

### Installation

```bash
npm install
```

### Running the application

```bash
npm start
```

The server will start on port 3000 by default.

### API Integration

The server proxies `/api/*` requests to the Oikos backend at `10.0.0.202:3008`. An API token is required for authentication.

## Configuration

- `API_TOKEN` is configured in `index.js` — do not commit real tokens to public repos
- Oikos backend URL: `10.0.0.202:3008`
- Server listens on port 3000

## API Endpoints (via Oikos proxy)

- `GET /api/v1/tasks` — Returns task data (destructure as `{ data: tasks }`)
- `PATCH /api/v1/tasks/{id}/status` — Mark a task as done (body: `{ status: "done" }`)
- `POST /api/v1/tasks` — Create a new task (known to return 500 on Oikos server)

## Testing

```bash
npm test
```

Use vitest with happy-dom for unit tests.

## License

MIT

## Support

Support this project by visiting [Buy Me a Coffee](https://buymeacoffee.com/seanseanric) — every contribution helps keep this project going!
