# Nagarkot Ecosystem - Context & Analysis

## 1. Overall System Architecture
The workspace consists of two primary, decoupled systems that communicate securely:
1. **Nagarkot OS (`/OS`)**: The central identity provider and administrative portal. It acts as the source of truth for Users, Departments (`department_slug`), Client Organizations (`org_id`), and Roles (`is_app_admin`, `user_type`).
2. **Training Module (`/`)**: A strictly scoped, standalone application for delivering training videos (YouTube) and documents (Natively uploaded PDFs/Docs). It delegates all user authentication to the OS via an SSO (Single Sign-On) flow.

**Integration/SSO Flow:**
- Authentication is strictly handled via SSO using **RS256 JWTs**. 
- The OS portal authenticates the user, generates a short-lived token, and redirects them to the Training Module (`/sso?token=...`).
- The Training Backend verifies the token against the OS's public key (`OS_JWT_PUBLIC_KEY`), checks for replay attacks via `SsoTokenLog`, and performs a Just-In-Time (JIT) sync of the user profile (`os_user_id`, `department_slug`, `org_id`).
- Backchannel communications (like webhook lifecycle events: delete, deactivate, reactivate) occur securely using a shared `INTERNAL_API_KEY`.

## 2. Tech Stack

### Training Module
* **Backend**: Python, FastAPI, SQLite (with SQLAlchemy ORM), Pydantic v2.
* **Authentication**: JWT via `python-jose`, strict password hashing via `bcrypt` (primarily transitioned to SSO).
* **Frontend**: React 19 (Vite build system), React Router v6.
* **Styling & UI**: Tailwind CSS v4, Lucide React Icons.
* **Data Fetching**: Axios with strict Request/Response Interceptors.

### Nagarkot OS (Monorepo Workspace)
* **Backend (`apps/os-backend`)**: Node.js ecosystem, NestJS framework natively written in TypeScript.
* **Frontend (`apps/os-frontend`)**: Next.js (React) framework, likely utilizing Tailwind and Shadcn UI (referenced in devDependencies).
* **Shared Types (`packages/shared-types`)**: A local package meant for unified TypeScript definitions across both OS backend and OS frontend.

## 3. High-Level Folder Structure

```text
C:\projects\Training Module
├── backend/                       # Training Module - FastAPI Backend
│   ├── app/                       # Core application code (main.py, models.py, schemas.py, sso.py)
│   ├── alembic/                   # Database migrations (unused recently, manual migrations preferred)
│   ├── requirements.txt           # Python dependencies
│   ├── migrate_sso.py             # Manual SQLite schema migrations
│   └── migrate_cascade.py
├── frontend/                      # Training Module - React/Vite Frontend
│   ├── src/                       # Source code (pages/, components/, lib/api.js)
│   ├── package.json               # Node dependencies
│   └── vite.config.js
├── OS/                            # Nagarkot OS - Central Monorepo
│   ├── package.json               # NPM workspace definitions
│   ├── apps/
│   │   ├── os-backend/            # NestJS Backend API
│   │   └── os-frontend/           # Next.js Portal UI
│   └── packages/
│       └── shared-types/          # Shared TS interfaces
├── AUDIT.md                       # Historical schema & API audits
├── CONTEXT.md                     # You are reading this file
└── README.md                      # Deployment & setup documentation
```

## 4. Summary of Core Logic
* **Content Targeting Engine**: 
  - Modules are collections of Content (`VIDEO` or `DOCUMENT`). 
  - Content visibility is heavily permission-gated.
  - `ModuleDepartmentSlug` maps modules to specific employee departments.
  - `ModuleClientOrg` maps modules to external client organizations ("org walls").
  - If a user is an Employee, they see global modules or modules explicitly tagged for their department. Clients see modules tagged for their specific organization ID.
* **Progress Tracking**: 
  - `UserProgress` tightly tracks learning state, such as `furthest_second_watched` on videos, syncing periodically via heartbeats.
* **Data Synchronization**: 
  - Instead of managing passwords, the Training app maintains a "Read-Only Cache" of a User (`os_user_id`, `email`, `full_name`, `department_slug`). 
  - A webhook listener `POST /webhooks/os` listens for centralized deletion/deactivation events to purge or suspend access locally.

## 5. Current State of the Project
* **Development State**: Both applications are fully active in development mode.
  - OS Backend running on port 3001
  - OS Frontend running locally
  - Training Backend (`uvicorn app.main:app`) running on port 8000
  - Training Frontend (`vite`) running on port 5173 with `--host` exposed for local network testing (e.g. testing on mobile devices).
* **Recent Milestones**:
  - Transitioned the Training module from a legacy auth system to a fully secured RS256 SSO flow relying on the OS.
  - Improved the database with manual migration scripts adding `ON DELETE CASCADE` to prevent orphan tracking configurations when OS users get purged.
  - Rebuilt the primary Admin component (`AdminModulesTab.jsx`) into a dual-pane builder supporting drag-and-drop sequencing and granular audience targeting (Employees vs. Clients).
  - Ongoing objective: Refining the smart video player's heartbeat system to correctly resume progress from the exact second a learner left off.
