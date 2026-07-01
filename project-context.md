# Kilaigal — Family Tree Application

## Overview

Kilaigal is a full-stack family tree visualization and management app. Users create family members, define relationships between them (Parent, Child, Spouse, Sibling), and view the family structure on an interactive hierarchical canvas. Authentication is phone-based.

## Tech Stack

### Frontend
- **React 19** with **Vite 8** (ES modules, JSX)
- **Tailwind CSS 3** with a custom dark theme and brand color palette (blue-based, `brand-50` to `brand-950`)
- **vis-network / vis-data** for hierarchical graph visualization
- **Axios** for HTTP with an interceptor that injects `x-user-phone` header
- **Lucide React** for icons
- **React Spring** and custom Tailwind keyframes for animations
- Utilities: `clsx`, `tailwind-merge`, `uuid`, `dagre`

### Backend
- **Express 5** (Node.js, ES modules)
- **SurrealDB** via the `surrealdb` JS SDK — native graph edges (`RELATE`) and
  traversal. Connection config in gitignored `backend/.env` (see `.env.example`).
- **Deterministic Tamil kinship engine** (`services/kinship/`) — resolves a graph
  path to a community-independent kin-slot, then a switchable terminology pack
  maps slot → surface term. The LLM is used only for narration.
- **Multer** for photo uploads (stored locally in `backend/uploads/`)
- **serverless-http** wrapper for AWS Lambda deployment
- **uuid** for ID generation

### Infrastructure
- **Terraform** provisioning on AWS (the DynamoDB table resource is superseded by
  SurrealDB hosting — Surreal Cloud in production; `main.tf` still to be updated)
- Lambda function behind API Gateway v2 (HTTP API)
- S3 buckets for frontend static hosting and media
- CloudFront CDN with S3 origin (frontend) and API Gateway origin (`/api/*`)

### Local Development
- `docker-compose.yml` runs SurrealDB on port 8000 (rocksdb-backed)
- `backend/local.js` starts Express on port 3001 and applies `schema.surql`
- `npm run db:push` applies the schema to whatever `backend/.env` points at
- Vite dev server on port 5173 proxies `/api` to `http://localhost:3001`
- Root `npm run dev` uses `concurrently` to start both frontend and backend

## Project Structure

```
├── backend/
│   ├── index.js          # Express app, API routes, serverless export
│   ├── db.js             # DynamoDB document client helpers (put, get, query, delete, updatePosition)
│   ├── local.js          # Local dev server with table auto-creation
│   └── uploads/          # Photo storage (local dev)
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # Root component — state management, auth, data fetching
│   │   ├── api.js        # Axios instance + memberApi, relationApi, authApi modules
│   │   ├── components/
│   │   │   ├── Canvas.jsx        # vis-network graph (hierarchical layout, gender styling, levels)
│   │   │   ├── MemberForm.jsx    # Member CRUD modal with details + relations tabs
│   │   │   ├── LoginModal.jsx    # Phone-based login
│   │   │   ├── MemberCard.jsx    # Standalone member card (currently unused in canvas)
│   │   │   └── RelationModal.jsx # Relationship type picker (currently unused in canvas)
│   │   ├── index.css     # Tailwind layers, glass/btn/input component classes, scrollbar
│   │   └── main.jsx      # React entry point
│   ├── vite.config.js    # Vite config with /api proxy
│   └── tailwind.config.js
├── infrastructure/
│   ├── main.tf           # DynamoDB, Lambda, API Gateway, S3, CloudFront, IAM
│   ├── variables.tf      # aws_region, stage
│   └── outputs.tf        # cloudfront_domain_name, dynamodb_table_name, api_endpoint
├── docker-compose.yml    # DynamoDB Local
└── package.json          # Root scripts (dev, install:all, infra:*)
```

## Database Schema (SurrealDB graph — `backend/schema.surql`)

Only **primitive** facts are stored as graph edges; siblings-by-blood,
grandparents, uncles, cousins, in-laws, and all Tamil terms are **derived** by
walking paths (see the kinship engine).

- **`member`** (record table): `name`, `gender`, `dob`, `manualAge`, `location`,
  `phone`, `photoUrl`, `x`, `y`, `componentId`, `createdBy`, timestamps.
- **`parent_of`** (`RELATION` edge): directed **parent → child**. Traversed both
  ways (`->parent_of->` children, `<-parent_of<-` parents). Field: `kind`
  (`birth`/`adopted`/`step`/`foster`).
- **`married_to`** (edge): one per couple, undirected in queries. Fields:
  `status`, `since`, `until`.
- **`sibling_of`** (edge): stored only when shared parentage is unknown.
- **`component`**: connected-component records for the "largest tree" counter.

The external HTTP relation shape stays `{ id, fromId, toId, type }` with
`type ∈ Parent|Child|Spouse|Sibling`; `store/relations.js` maps it onto the
primitive edges (Parent/Child ↔ `parent_of`, Spouse ↔ `married_to`, Sibling ↔
`sibling_of`), so the frontend is unaffected by the storage change.

## API Endpoints

| Method   | Path                          | Auth | Description                          |
|----------|-------------------------------|------|--------------------------------------|
| GET      | `/api/members`                | No   | List all members                     |
| POST     | `/api/members`                | Yes  | Create a member                      |
| PUT      | `/api/members/:id`            | Yes  | Update a member                      |
| PATCH    | `/api/members/:id/position`   | Yes  | Persist a dragged node position      |
| GET      | `/api/members/search?q=`      | No   | Search members (min 2 chars)         |
| GET      | `/api/members/:id/tree?depth=`| No   | BFS neighborhood subgraph            |
| GET      | `/api/members/:id/component`  | No   | Connected-component id + size        |
| GET      | `/api/relations`              | No   | List all relations                   |
| POST     | `/api/relations`              | Yes  | Create a relation (duplicate check)  |
| DELETE   | `/api/relations/:id`          | Yes  | Delete a relation                    |
| POST     | `/api/upload`                 | Yes  | Upload a photo (multipart/form-data) |
| GET      | `/api/kinship/packs`          | No   | List terminology packs               |
| POST     | `/api/ai/relationship`        | Yes  | Resolve kin term (+ optional narration) |

Auth is a simple `x-user-phone` header check — a handle only, no tokens/passwords.

## UI Patterns & Conventions

- **Dark theme** with slate-950 background and glassmorphism (`.glass`, `.glass-heavy`)
- **Component classes** defined in `index.css` `@layer components`: `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.input-field`, `.modal-overlay`, `.modal-panel`, `.member-card`
- **State management** is centralized in `App.jsx` using React hooks; no external state library
- **Data flow**: App fetches members + relations on mount → passes to Canvas and modals → mutations trigger `fetchData()` to refresh
- **Gender-based styling**: blue borders for Male, pink for Female, gray for Other
- **Hierarchical layout**: vis-network computes levels from parent-child edges; spouses share levels; disconnected nodes use age-based heuristic

## Key Conventions

- ES modules throughout (`"type": "module"` in both package.json files)
- UUIDs for all entity IDs (using `uuid` package)
- camelCase for variables/functions, PascalCase for React components
- Tailwind utility classes preferred; custom classes only in `index.css` component layer
- No TypeScript — plain JavaScript/JSX
- No test framework configured yet (backend `test` script is a placeholder)
