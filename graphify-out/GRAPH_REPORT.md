# Graph Report - .  (2026-07-18)

## Corpus Check
- Corpus is ~14,812 words - fits in a single context window. You may not need a graph.

## Summary
- 123 nodes · 198 edges · 10 communities
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.76)
- Token cost: 84,245 input · 0 output

## Community Hubs (Navigation)
- Points & Store Engine
- Parent Approval UI
- Package Metadata
- Docs & Architecture Decisions
- Server Core & Data Files
- Date Utilities
- ICS Calendar Parsing
- Chore Board Frontend
- Chores API & Auth

## God Nodes (most connected - your core abstractions)
1. `handleStore()` - 16 edges
2. `todaysEvents()` - 9 edges
3. `CLAUDE.md Project Guidance` - 7 edges
4. `Oikos API` - 7 edges
5. `Tablet Scoreboard Page (scores.html)` - 7 edges
6. `handleChores()` - 6 edges
7. `Points Store (/store API: completions, redemptions, adjustments, balances)` - 6 edges
8. `unbankedPoints()` - 5 edges
9. `occursOn()` - 5 edges
10. `upcomingEvents()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Family Chore Board Page` --semantically_similar_to--> `Tablet Scoreboard Page (scores.html)`  [INFERRED] [semantically similar]
  index.html → scores.html
- `AGENTS.md Codex Guidance` --semantically_similar_to--> `CLAUDE.md Project Guidance`  [EXTRACTED] [semantically similar]
  AGENTS.md → CLAUDE.md
- `Family Chore Board Page` --shares_data_with--> `Oikos API`  [INFERRED]
  index.html → CLAUDE.md
- `Tablet Scoreboard Page (scores.html)` --shares_data_with--> `Google Calendar ICS Integration`  [INFERRED]
  scores.html → docker-compose.yml
- `Tablet Scoreboard Page (scores.html)` --shares_data_with--> `Points Store (/store API: completions, redemptions, adjustments, balances)`  [INFERRED]
  scores.html → approve.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Points Lifecycle: Earn, Approve (Bank), Redeem, Adjust** — approve_unbanked, approve_bankkid, approve_redeem, approve_adjust, points_store [EXTRACTED 0.90]
- **Chore Board System: Board, Scoreboard, Admin, Deployment** — index_html, scores_html, approve_html, docker_compose [INFERRED 0.85]
- **People-Chore Reconciliation on Rename/Remove** — approve_savepeople, approve_reconcilechores, approve_collectpeople, chores_config [EXTRACTED 0.90]

## Communities (10 total, 0 thin omitted)

### Community 0 - "Points & Store Engine"
Cohesion: 0.18
Nodes (20): adjustPoints(), approveWeek(), bankUnbanked(), defaultStore(), deleteAdjustment(), deleteRedemption(), editRedemption(), logCompletion() (+12 more)

### Community 1 - "Parent Approval UI"
Cohesion: 0.12
Nodes (19): addMissed (Backfill Missed Chore), adjust, bankKid (Approve Points), collectChores, collectPeople, loadAll, reconcileChores, redeem (+11 more)

### Community 2 - "Package Metadata"
Cohesion: 0.11
Nodes (18): happy-dom, author, description, devDependencies, happy-dom, serve, vitest, keywords (+10 more)

### Community 3 - "Docs & Architecture Decisions"
Cohesion: 0.16
Nodes (17): AGENTS.md Codex Guidance, Parent Admin Approval Page, Google Calendar ICS Integration, CLAUDE.md Project Guidance, Docker Compose Deployment (chore-board), Hardcoded API Token (Known Issue), Family Chore Board Page, Kids Oikos Member IDs (Evelyn 2, Amelia 3, Eli 5) (+9 more)

### Community 4 - "Server Core & Data Files"
Cohesion: 0.13
Nodes (15): BYDAY_NUM, CALENDAR_FILE, CALENDAR_SEED, CHORES_FILE, CHORES_SEED, DATA_FILE, __dirname, fetchWeather() (+7 more)

### Community 5 - "Date Utilities"
Cohesion: 0.32
Nodes (8): addDaysYmd(), dayLabelFor(), daysBetween(), dowOf(), occursOn(), sameYmd(), upcomingEvents(), ymdUTC()

### Community 6 - "ICS Calendar Parsing"
Cohesion: 0.29
Nodes (8): fetchCalendar(), fmt12(), minsOf(), parseDT(), parseICS(), todaysEvents(), unfoldICS(), ymdOf()

### Community 7 - "Chore Board Frontend"
Cohesion: 0.73
Nodes (4): completeChore(), fetchActiveChores(), KIDS, renderChores()

### Community 8 - "Chores API & Auth"
Cohesion: 0.33
Nodes (6): authorized(), handleChores(), loadChores(), readJsonBody(), saveChores(), sendJson()

## Knowledge Gaps
- **32 isolated node(s):** `name`, `version`, `description`, `main`, `type` (+27 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Points Store (/store API: completions, redemptions, adjustments, balances)` connect `Parent Approval UI` to `Docs & Architecture Decisions`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `Tablet Scoreboard Page (scores.html)` connect `Docs & Architecture Decisions` to `Parent Approval UI`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Oikos API` (e.g. with `Family Chore Board Page` and `Tablet Scoreboard Page (scores.html)`) actually correct?**
  _`Oikos API` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `Tablet Scoreboard Page (scores.html)` (e.g. with `Family Chore Board Page` and `Google Calendar ICS Integration`) actually correct?**
  _`Tablet Scoreboard Page (scores.html)` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _32 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Parent Approval UI` be split into smaller, more focused modules?**
  _Cohesion score 0.11695906432748537 - nodes in this community are weakly interconnected._
- **Should `Package Metadata` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._