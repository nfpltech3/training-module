# Context: Trainings Module Architecture & Systems

## Overview
The Training Module is a strictly scoped web application built to distribute training videos and documents across the organization. It focuses on clean content delivery, strict organizational isolation (via departments and client orgs), and reliable audit tracking. It is intrinsically tied to the central Nagarkot OS portal for identity and SSO.

## Tech Stack
*   **Backend:** Python (FastAPI), PostgreSQL via SQLAlchemy ORM, Pydantic v2
*   **Authentication:** JWT (HS256 internal) via `python-jose`, SSO integration with OS via RS256 JWTs.
*   **Frontend:** React 19 (Vite) with React Router v6.
*   **Styling:** Tailwind CSS v4, Lucide React Icons.
*   **Data Fetching:** Axios.

## Database Connections & Schema

### PostgreSQL Structure
The backend stores application-specific state while caching necessary identity data synchronized from the Nagarkot OS through webhooks.

#### Core Tables
*   **`departments`**: Caches OS departments.
    *   `id` (PK), `os_department_id` (Unique, OS ref), `slug`, `name`, `status`.
    *   Global content falls to modules with no department references.
*   **`roles`**: Contains platform roles (`ADMIN`, `TEAM LEAD`, `MANAGER`, `EMPLOYEE`, `CLIENT`).
*   **`users`**: Caches user metadata from OS.
    *   `id` (PK), `os_user_id` (Unique, OS ref), `email`, `role_id` (FK to `roles`), `department_slug` (cached), `org_id` (cached).
*   **`modules`**: Containers for the training materials.
    *   `id` (PK), `title`, `description`, `module_type` (Enum: `DEPARTMENT_TRAINING`, `CLIENT_TRAINING`, `ON_BOARDING`), `is_active`.
*   **`content`**: Individual training items inside a module.
    *   `id` (PK), `title`, `content_type` (Enum: `VIDEO`, `DOCUMENT`), `embed_url`, `document_url`, `module_id`, `total_duration`, `is_active`.
*   **`user_progress`**: Tracks content viewing.
    *   `id` (PK), `user_id` (FK to `users`), `content_id` (FK to `content`), `furthest_second_watched`, `is_completed`, `completed_at`.

#### Association Tables
*   **`module_departments`**: Links modules to specific internal departments.
*   **`module_client_orgs`**: Links modules to specific external client organizations.
*   **`module_roles`**: Links modules to specific target user roles.

### Schema Relationships
* `User` belongs to one `Role` (M:1).
* `User` progresses through `Content` via `UserProgress` (M:N).
* `Module` contains many `Content` (1:N).
* `Module` restricts visibility via `ModuleDepartment`, `ModuleClientOrg`, `ModuleRole` (M:N).

## External Connections
*   **Nagarkot OS Base**: Identity and SSO are managed centrally.
    *   `SSO Redirection`: Frontend redirects to OS, gets an RS256 token, passes it to the Backend.
    *   `Verify Session API`: Backend POSTs credentials or session info to `/auth/verify-password` / `/auth/verify-session` at the OS.
    *   `Webhook Catch-Up` (`/webhooks/os`): The backend exposes endpoints for OS to broadcast changes (creates, renames, disables) for Users and Departments to keep the local DB cache fresh. Security ensured by `INTERNAL_API_KEY`.

## Visibility & Role Management

Modules employ tri-layered filtering. A module must pass all active filters to be visible on a user's dashboard.

### Roles and Their Permissions

1.  **ADMIN (App Admin / Super Admin)**
    *   **Visibility**: Sees all content designated for the `ADMIN` role. On the Learner Dashboard, `ADMIN` role tags override department strictness.
    *   **Abilities**: Can view all backend data, bypass department filters on management boards, sync departments, force resync data.
2.  **TEAM LEAD (Department Head)**
    *   **Visibility**: Sees content tagged for `TEAM LEAD` and filtered to their specific `department_slug`, plus `Global` (no department).
    *   **Abilities**: Can create and assign modules to their *own* department (or global). Can view reports for users in their own department.
3.  **MANAGER**
    *   *(Note: Manager currently behaves similarly to Team Lead based on routes config, though logic explicitly gates on `ADMIN` or `TEAM LEAD` for actions).*
4.  **EMPLOYEE**
    *   **Visibility**: Sees content tagged for `EMPLOYEE` that is either scoped to their `department_slug` or marked fully Global.
    *   **Abilities**: Read-only learner access to available modules.
5.  **CLIENT**
    *   **Visibility**: Strict organization wall. Client only sees modules specifically linked to their OS `org_id` via `module_client_orgs`, or globally available Client content.
    *   **Abilities**: Read-only learner access.

### Filtering Logic Snippet (from `get_modules`)
*   If Learner:
    *   Filter by **Role Match**: Module must be tagged with user's role.
    *   Filter by **Department/Client Match**:
        *   If Client: Check `org_id` intersect.
        *   If Employee/Lead: Check `department_slug` intersect OR if module has 0 assigned departments (Global).

## File Structure Highlights
*   **Backend (`/backend/app/`)**:
    *   `main.py`: Houses FastAPI setup, Webhooks, Auth SSO logic, Module/Content endpoints, and Report endpoints.
    *   `models.py`: SQLAlchemy Database definitions.
    *   `schemas.py`: Pydantic V2 schemas for API I/O.
    *   `auth.py`: JWT utilities.
*   **Frontend (`/frontend/src/`)**:
    *   `components/AdminModulesTab.jsx`: The core hub for managing modules, uploading docs, embedding videos, handling drag/drop.
    *   `pages/ModuleViewer.jsx`: The learner's execution container where the continuous viewing timer executes and securely manages progress without user bypass.
    *   `pages/LearnerDashboard.jsx`: Role-computed display matrix for employees/clients.
    *   `lib/api.js`: All outgoing Axios configurations calling out to backend routes.

