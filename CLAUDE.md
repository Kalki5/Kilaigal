# CLAUDE.md — Kilaigal working notes (resume context)

> Purpose: let a fresh Claude Code session pick up the DynamoDB→SurrealDB graph
> migration + Tamil kinship work without re-deriving decisions. Read this, then
> `docs/surrealdb-graph-design.md` for the full design.

Working branch: **`claude/dynamodb-surrealdb-graph-5fn570`** (develop + push here; do
not push elsewhere without permission).

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

## ⚠️ NOT yet verified against a live DB (do this first in the new session)

The previous container's egress was bound before `*.surreal.cloud` was allowed,
so the schema was never pushed and no live query ran. **First actions:**

1. Confirm egress works: `curl -sS https://<instance>.surreal.cloud/version`
   (should NOT be a 403 CONNECT). If still 403, check the proxy status endpoint.
2. `cd backend && npm run db:push` (applies `schema.surql`).
3. Start the app / hit endpoints and **validate the parts that are logic-only so
   far**:
   - `store/relations.js` `RELATE` + `store/graph.js` edge queries (SurrealQL
     syntax, RecordId param handling).
   - `store/components.js` **union-find** — merging components on edge write.
   - Recursive/graph query behavior against the **actual SurrealDB version**
     (pin it; the `.{..N}` recursive syntax noted in the design doc is 2.x and
     was NOT used — traversal is level-wise BFS, which is version-safe).
4. Fix any SurrealQL/SDK mismatches found, keep tests green, commit.

## Credentials

In gitignored `backend/.env` (NEVER commit): `SURREAL_URL`, `SURREAL_NS=kalki5`,
`SURREAL_DB=kilaigal`, `SURREAL_USER`, `SURREAL_PASS`. `.env.example` has the
placeholder shape. If `.env` is missing (fresh container), recreate it from the
creds the user provided.

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
