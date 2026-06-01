# Nagarkot Knowledge Sharing & Tracking Platform

This project is a strictly scoped application designed to distribute training videos and documents across an organization. It focuses on clean content delivery, absolute organizational isolation based on departments, and reliable audit tracking. It explicitly removes extraneous features of a traditional LMS (like quizzes or forums) to prioritize speed and reliability.

## 🏗 Tech Stack
- **Backend**: Python (FastAPI), PostgreSQL (SQLAlchemy ORM), Pydantic v2
- **Auth**: JWT via `python-jose`, strict password hashing via `bcrypt`
- **Frontend**: React 19 (Vite), React Router v6
- **Styling**: Tailwind CSS v4, Lucide React Icons
- **Data Fetching**: Axios with strict Request/Response Interceptors

## 🗄 Core Data Models & Relations
1. **Departments**: Organizational buckets with an `is_global` flag. If `is_global` is true, the content is visible to every user across all departments.
2. **Users**: Must belong to a specific (non-global) Department and hold a role (`USER` or `ADMIN`).
3. **Modules**: Containers for content items, directly assigned to a specific Department.
4. **Content**: Training items inside a module. Can be a `VIDEO` (YouTube URL) or a `DOCUMENT` (natively uploaded PDF/Word/Excel file).
5. **UserProgress**: Securely tracks how many seconds of a video were watched, or logs the completion date of a document once the minimum reading time has expired.

---

## 🚀 Running Locally (Full Guide)

This project has **two systems** that work together:

| System | What it is | Repo folder |
|--------|-----------|-------------|
| **Nagarkot OS** | Central identity portal (login, user management) | `OS/` |
| **Trainings** | This app (training videos & documents) | `backend/` + `frontend/` |

Trainings depends on OS for authentication (SSO). **You must run both to log in.**

---

### Prerequisites

- **Node.js** ≥ 20 and **npm** ≥ 10
- **Python** ≥ 3.10
- **PostgreSQL** running locally (default: `localhost:5432`)

---

### Step 1 — Install dependencies (one-time)

**OS** (from the project root):
```bash
cd OS
npm install
```

**Trainings Backend** (from the project root):
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

**Trainings Frontend** (from the project root):
```bash
cd frontend
npm install
```

---

### Step 2 — Configure environment files (one-time)

#### 2a. Trainings Backend (`backend/.env`)

Copy `backend/.env.example` → `backend/.env` and fill in:

```env
# App secret (any long random string)
SECRET_KEY=replace-with-a-long-random-jwt-secret

# PostgreSQL connection
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/nagarkot_training

# OS connection (must match the OS .env values)
OS_BACKEND_URL=http://localhost:3001
INTERNAL_API_KEY=<copy from OS/apps/os-backend/.env>

# OS public key — paste the full contents of OS/apps/os-backend/public.pem
OS_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
<paste contents of OS/apps/os-backend/public.pem>
-----END PUBLIC KEY-----"

# CORS — allow local dev origins
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:3000,http://localhost:8000

# Cookie settings
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
```

> **Where to find OS values:**
> - `INTERNAL_API_KEY` → open `OS/apps/os-backend/.env` and copy the `INTERNAL_API_KEY` value
> - `OS_JWT_PUBLIC_KEY` → open `OS/apps/os-backend/public.pem` and paste the full PEM block

#### 2b. Trainings Frontend (`frontend/.env`) — optional

Only needed if your backend runs on a non-default port:
```env
VITE_API_URL=http://localhost:8000
```

---

### Step 3 — Start all services (4 terminals)

Open **4 separate terminals** and run the commands below **in this order**:

| # | Terminal | Directory | Command | URL |
|:-:|:---------|:----------|:--------|:----|
| 1 | OS Backend | `OS/` | `npm run backend` | http://localhost:3001 |
| 2 | OS Frontend | `OS/` | `npm run frontend` | http://localhost:3000 |
| 3 | Training API | `backend/` | `venv\Scripts\activate ; uvicorn app.main:app --reload --port 8000` | http://localhost:8000 |
| 4 | Training UI | `frontend/` | `npm run dev` | http://localhost:5173 |

> **⚠️ Start OS first (terminals 1 & 2), then Trainings (terminals 3 & 4).**
> Trainings calls OS on startup to verify the connection.

To expose on your local network (e.g. for testing on your phone):
```bash
# Terminal 3 — add --host
venv\Scripts\activate ; uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 4 — add --host
npm run dev -- --host
```
Then open `http://<your-local-ip>:5173` on your phone.

---

### Step 4 — Log in

1. Open http://localhost:5173 (Training Module).
2. Click **Login** → you will be redirected to the OS Portal at http://localhost:3000.
3. Enter credentials and authenticate.
4. OS redirects you back to Trainings with an SSO token → you are logged in.

#### 🔑 Default Admin Credentials
- **Email:** `admin@nagarkot.com`
- **Password:** `admin123`

#### 🔍 Verification
- **Dashboard**: The department name should display correctly (e.g. "Operations Modules"), not "Your Department".
- **Admin Settings**: Verify you can access and change the **Video limit** in the Settings tab.

---

## 🔗 How SSO Authentication Works

Trainings never handles passwords directly. It delegates authentication to OS:

```
User clicks "Login" on Trainings (localhost:5173)
        │
        ▼
Redirected to OS Portal (localhost:3000)
        │
        ▼
User enters credentials → OS authenticates
        │
        ▼
OS issues a short-lived RS256 JWT and redirects to:
  http://localhost:5173/sso?token=<RS256_token>
        │
        ▼
Trainings frontend sends the token to POST /auth/sso
        │
        ▼
Trainings backend:
  1. Verifies RS256 signature using OS_JWT_PUBLIC_KEY
  2. Checks token has not been used before (replay protection)
  3. Calls OS /auth/verify-session to confirm account is active
  4. Finds or creates local user, syncs role
  5. Issues a Trainings HS256 JWT → returned to frontend
        │
        ▼
Frontend stores JWT in a cookie → user is logged in
```

---

## 🚢 Production Deployment

1. Set real HTTPS URLs in `backend/.env`:
   ```env
   OS_BACKEND_URL=https://os.nagarkot.com
   ALLOWED_ORIGINS=https://trainings.nagarkot.com
   COOKIE_SECURE=true
   ```
2. Set `VITE_API_URL` in `frontend/.env` **before** building:
   ```bash
   cd frontend
   npm run build          # output → frontend/dist/
   ```
3. Generate a strong `SECRET_KEY` (minimum 32 random characters). Do **not** reuse the dev key.
4. The `INTERNAL_API_KEY` must be identical on both the OS and Trainings servers.
5. Ensure the OS server allows your Trainings domain in its CORS / redirect origins.

---

## 🧹 Deleting Orphaned Users

Normally, when a user is deleted in the Nagarkot OS, a webhook (`user.deleted`) is sent to the Trainings backend to automatically remove the user and all their progress data.

However, if the Trainings backend is down or unreachable when the user is deleted from the OS, the user becomes an **"orphaned user"** (they exist in the Trainings database but not in the OS).

You can manually clean up orphaned users using the provided Python script.

### Using the Python Script (Direct DB Deletion)
This is the safest and most direct method, especially in production. It connects directly to the PostgreSQL database, cascade-deletes the user and all their progress records, and requires email confirmation.

**Running locally:**
```bash
cd backend
venv\Scripts\activate

# 1. Preview what will be deleted (Dry Run)
python delete_user.py --email "user@example.com" --dry-run

# 2. Actually delete the user
python delete_user.py --email "user@example.com"
```

**Running in Production (e.g., Dokploy):**
1. Open your Dokploy dashboard.
2. Go to your Project -> Trainings Backend application.
3. Open the **Terminal** tab for the backend container.
4. Run the script directly (the Docker container already has Python configured and the `DATABASE_URL` environment variable set):
```bash
# Dry run
python delete_user.py --email "user@example.com" --dry-run

# Actual deletion
python delete_user.py --email "user@example.com"
```
