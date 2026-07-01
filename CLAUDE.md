# CLAUDE.md — Kilaigal working notes (resume context)

> Purpose: let a fresh Claude Code session pick up the DynamoDB→SurrealDB graph
> migration + Tamil kinship work without re-deriving decisions. Read this, then
> `docs/surrealdb-graph-design.md` for the full design.

Working branch: **`claude/db-setup-development-ow68zo`** (develop + push here; do
not push elsewhere without permission). The prior branch
(`claude/dynamodb-surrealdb-graph-5fn570`) was merged into `main` via PR #1 —
this branch continues from there.

## What this project is

Kilaigal — a family-tree app (React + Vite frontend, Express backend). Members +
relationships rendered on a graph canvas. Being rebuilt around a **SurrealDB
graph** with a **deterministic Tamil kinship engine**.

## Locked design decisions (from brainstorm)

- **DB:** SurrealDB (Surreal Cloud in prod). Store only **3 primitive edges**;
  derive everything else. Traversal in the DB, not app-code BFS.
- **Relations:** deterministic **kinship rule engine** resolves a path → a
  community-independent **kin-slot**; a swappable **terminology pack** maps
  slot → surface term. LLM only *narrates*, never derives.
- **Terminology:** spoken-Tamil default pack, user-switchable (Iyer, Gounder, …)
  like a language setting. Community packs override + fall back to spoken-Tamil.
- **Access:** full **connected component** — everyone reachable via blood/marriage
  is visible. "Largest tree you're part of" = `componentId` + count via union-find
  on edge write.
- **Identity:** phone is a **handle only, NO auth** for now (OTP rejected: not
  financially feasible). Privacy for living people is a known deferred concern.
- **Viz (not built yet):** keep **vis-network** (pan/zoom/drag) + **union-node
  layout** (marriage = tiny invisible node; children descend from it) + an **HTML
  overlay card** on the focused node (level-of-detail). Trees may be large/unbounded.

## Current state — what's DONE (backend, all committed)

- **Kinship engine** `backend/services/kinship/`:
  - `resolveSlot.js` — path (steps) → kin-slot. Encodes cross/parallel +
    elder/younger + side + affinal. Coverage: direct kin, grandparents/children,
    parent's siblings (blood + by marriage), first cousins (cross/parallel),
    in-laws (parent/child/sibling). Deeper paths → `SLOTS.UNKNOWN`.
  - `packs/` — `spoken-tamil.js` (default, full), `iyer.js` (stub), `registry.js`
    (`resolveTerm` with fallback chain + coarsening). `index.js` = public API
    (`describePath`, `displayTerm`, `listPacks`).
- **SurrealDB layer**:
  - `schema.surql` — `member` + `parent_of`/`married_to`/`sibling_of` edges +
    `component`.
  - `surreal.js` — lazy client (`getDb`, `query`, `queryAll`, `close`).
  - `store/` — `members.js`, `relations.js` (external `{fromId,toId,type}` ↔
    primitive edges), `graph.js` (edge fetch), `components.js` (union-find),
    `ids.js` (RecordId ↔ plain id).
  - `scripts/pushSchema.js` → `npm run db:push`.
- **Services**: `traversal.js` (BFS neighborhood + shortest path via SurrealDB),
  `pathToSteps.js` (path → kinship steps), `aiRelationship.js` (kinship-first,
  LLM optional with deterministic fallback).
- **`index.js`** — same external HTTP contract; new endpoints:
  `PATCH /api/members/:id/position`, `GET /api/members/:id/component`,
  `GET /api/kinship/packs`.
- **Removed**: DynamoDB modules (`db.js`, `graphTraversal.js`, `batchLoader.js`,
  `relationQueries.js`) + their tests + AWS SDK deps.
- **Local dev**: `docker-compose.yml` runs SurrealDB; `local.js` applies schema.
- **Tests: 93 passing** (`cd backend && npm test`). Kinship suite = 25.

## ⚠️ STILL NOT verified against a live DB — this is an environment egress problem, not code

Two containers in a row have been unable to reach Surreal Cloud. Findings from
this session, so the next one doesn't re-diagnose from scratch:

1. **The host is not allowlisted for this environment**, confirmed two ways:
   - `curl https://<instance>.surreal.cloud/version` → `403 CONNECT tunnel
     failed`; `curl "$HTTPS_PROXY/__agentproxy/status"` shows
     `recentRelayFailures: connect_rejected` (policy denial) for that host.
   - The SurrealDB JS SDK's own HTTP engine reports it more explicitly:
     `HttpConnectionError: Host not in allowlist: <instance>.surreal.cloud.
     Add this host to your network egress settings to allow access.`
   - **Fix:** the user/admin must add the Surreal Cloud host (or
     `*.surreal.cloud`) to this environment's network egress allowlist. Not
     something fixable from inside the session.
2. **Separately, `surreal.js` used to connect over WebSocket (`wss://.../rpc`)**
   for live-query support. This session's proxy docs list WebSocket upgrades
   as unsupported through it regardless of host allowlisting (plain HTTPS
   CONNECT tunnels only). **Fixed**: `surreal.js` now connects over
   `https://.../rpc` so the SDK selects its `HttpEngine` instead of
   `WebSocketEngine` — protocol-compatible with proxied environments. Trade-off:
   no `LIVE SELECT` support, which nothing in this codebase currently uses. If
   a future environment allows raw WebSocket egress and live queries become
   needed, revert to `wss://` (see git history on this file).
3. Once egress is actually open, resume the original plan:
   - `cd backend && npm run db:push` (applies `schema.surql`).
   - Validate `store/relations.js` `RELATE` + `store/graph.js` edge queries
     (SurrealQL syntax, RecordId param handling), `store/components.js`
     union-find merging, and recursive/graph query behavior against the
     **actual SurrealDB version** (pin it; traversal is level-wise BFS, which
     is version-safe regardless).
   - Fix any SurrealQL/SDK mismatches found, keep tests green, commit.

## Credentials

In gitignored `backend/.env` (NEVER commit): `SURREAL_URL`, `SURREAL_NS=kalki5`,
`SURREAL_DB=kilaigal`, `SURREAL_USER=kilaigal`, `SURREAL_PASS`. `.env.example`
has the placeholder shape. `.env` currently exists in this container with the
live Surreal Cloud creds the user provided (NS `kalki5`, DB `kilaigal`); if
missing in a fresh container, ask the user for creds again — do not guess.

## Next up (after live verification)

- **Frontend** (the remaining roadmap item): union-node layout in `Canvas.jsx`,
  HTML overlay card for the focused node, terminology-pack switcher wired to
  `GET /api/kinship/packs`. Frontend still uses the unchanged relation API shape.
- Open questions (design doc §8): SurrealDB hosting/Lambda fit, community-pack
  validation by native speakers, birth-order when DOB unknown.

## Conventions / guardrails

- ES modules, plain JS (no TS). camelCase / PascalCase components.
- Keep the external HTTP relation shape `{id,fromId,toId,type}` stable (frontend
  depends on it); map to primitive edges inside `store/`.
- Community kinship terms need native-speaker validation — do not invent them as
  fact; mark stubs clearly.
- Do not commit `backend/.env`. Do not create a PR unless asked.
