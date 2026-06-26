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
- **DynamoDB** via `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb`
- **Multer** for photo uploads (stored locally in `backend/uploads/`)
- **serverless-http** wrapper for AWS Lambda deployment
- **uuid** for ID generation

### Infrastructure
- **Terraform** provisioning on AWS
- DynamoDB table (`FamilyTreeTable`, on-demand billing, PK/SK single-table design)
- Lambda function behind API Gateway v2 (HTTP API)
- S3 buckets for frontend static hosting and media
- CloudFront CDN with S3 origin (frontend) and API Gateway origin (`/api/*`)

### Local Development
- `docker-compose.yml` runs DynamoDB Local on port 8000
- `backend/local.js` starts Express on port 3001, auto-creates the DynamoDB table
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

## Database Schema (DynamoDB Single-Table)

**Table:** `FamilyTreeTable` — PK (String), SK (String)

### Member Item
| Field       | Description                                |
|-------------|--------------------------------------------|
| PK          | `"MEMBERS"`                                |
| SK          | `"MEMBER#{uuid}"`                          |
| id          | UUID                                       |
| name        | Full name                                  |
| dob         | ISO date string or null                    |
| manualAge   | Number (used when dob is null)             |
| location    | City/location string                       |
| phone       | Phone number                               |
| photoUrl    | URL to uploaded photo                      |
| gender      | `"Male"` / `"Female"` / `"Other"`         |
| createdAt   | ISO timestamp                              |
| updatedAt   | ISO timestamp                              |
| createdBy   | Phone of the user who created this member  |

### Relation Item
| Field       | Description                                |
|-------------|--------------------------------------------|
| PK          | `"RELATIONS"`                              |
| SK          | `"REL#{uuid}"`                             |
| id          | UUID                                       |
| fromId      | Source member UUID                          |
| toId        | Target member UUID                         |
| type        | `"Parent"` / `"Child"` / `"Spouse"` / `"Sibling"` |
| createdAt   | ISO timestamp                              |
| createdBy   | Phone of the user who created this relation|

## API Endpoints

| Method   | Path                | Auth | Description                        |
|----------|---------------------|------|------------------------------------|
| GET      | `/api/members`      | No   | List all members                   |
| POST     | `/api/members`      | Yes  | Create a member                    |
| PUT      | `/api/members/:id`  | Yes  | Update a member                    |
| GET      | `/api/relations`    | No   | List all relations                 |
| POST     | `/api/relations`    | Yes  | Create a relation (duplicate check)|
| DELETE   | `/api/relations/:id`| Yes  | Delete a relation                  |
| POST     | `/api/upload`       | Yes  | Upload a photo (multipart/form-data)|

Auth is a simple `x-user-phone` header check — no tokens or passwords.

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
