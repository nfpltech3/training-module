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

## 🚀 Setup Instructions

### 1. Backend (FastAPI)
Open a terminal in the root directory:

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
.\venv\Scripts\activate   # For Windows

# Install the required dependencies
pip install -r requirements.txt

# Start the API server
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
*The API will be available at http://localhost:8000. Run Alembic migrations and the seed script before starting the app.*

### 2. Frontend (React/Vite)
Open a secondary terminal:

```bash
cd frontend

# Install Node dependencies
npm install

# Start the Vite development server
npm run dev -- --host
```
*The client app will be available at http://localhost:5173.*
for phone, http://192.168.1.23:5173
---

## 🔑 Default Admin Credentials
When the database runs for the first time, it automatically creates a root administrator. You can use these credentials to log in, assign real departments, and manage global settings.

- **Username / Email:** `admin@nagarkot.com` / `admin`
- **Password:** `admin123`

---

## 🔗 Linking Trainings with the OS Portal

Trainings authenticates users via the Nagarkot OS (the central identity portal). The two systems communicate through:
- **SSO tokens** — RS256 JWTs issued by OS and verified by Trainings
- **Internal API calls** — Trainings calls OS to create users, verify passwords, and deactivate accounts; secured by a shared `INTERNAL_API_KEY`

All OS connection settings live in `backend/.env`.

---

### Step 1 — Get the values from OS

You need three things from whoever runs the OS backend:

| What | Where to find it in OS |
|------|------------------------|
| **Public key** (`OS_JWT_PUBLIC_KEY`) | OS project → `OS/public.pem` (or the `JWT_PUBLIC_KEY` env var on the OS server) |
| **OS backend URL** (`OS_BACKEND_URL`) | The base URL where the OS API is running |
| **Internal API key** (`INTERNAL_API_KEY`) | Must match the `INTERNAL_API_KEY` set on the OS server exactly |

---

### Step 2 — Edit `backend/.env`

```env
# ── Trainings own secrets ──────────────────────────────────────────────
SECRET_KEY=replace-with-a-long-random-string-for-jwt-signing
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/nagarkot_training

# ── OS public key (paste the full PEM block, keep the quotes) ──────────
OS_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
<paste the contents of OS/public.pem here>
-----END PUBLIC KEY-----"

# ── OS connection ──────────────────────────────────────────────────────
OS_BACKEND_URL=http://localhost:3001       # local dev
# OS_BACKEND_URL=https://os.nagarkot.com  # production

INTERNAL_API_KEY=<exact same key as set in OS .env>

# ── CORS — origins allowed to call this API ────────────────────────────
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
# production: ALLOWED_ORIGINS=https://trainings.nagarkot.com
```

---

### Step 3 — Configure the frontend API URL (optional)

By default the frontend calls `http://localhost:8000`. To point it at a different backend, create `frontend/.env`:

```env
# local dev (default — only needed if your backend runs on a different port)
VITE_API_URL=http://localhost:8000

# production
# VITE_API_URL=https://trainings-api.nagarkot.com
```

---

### Local Development Setup (both systems on the same machine)

| Service | Default URL |
|---------|-------------|
| OS backend | `http://localhost:3001` |
| Trainings backend | `http://localhost:8000` |
| Trainings frontend | `http://localhost:5173` |

1. Start the OS backend first (`npm run dev` or equivalent in the OS project).
2. Copy `OS/public.pem` content into `backend/.env` as `OS_JWT_PUBLIC_KEY`.
3. Copy the `INTERNAL_API_KEY` from the OS `.env` into `backend/.env`.
4. Start the Trainings backend: `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`
5. Start the Trainings frontend: `npm run dev -- --host`
6. Log in via OS portal → SSO redirects to `http://localhost:5173/sso?token=...` → Trainings validates the token and issues its own JWT.

---

### Production Deployment

1. Set real HTTPS URLs for both `OS_BACKEND_URL` and `ALLOWED_ORIGINS` in `backend/.env`.
2. Set `VITE_API_URL` in `frontend/.env` to the production Trainings API URL before building:
   ```bash
   cd frontend
   npm run build    # output goes to frontend/dist/
   ```
3. Generate a strong `SECRET_KEY` (minimum 32 random characters). Do not reuse the dev key.
4. The `INTERNAL_API_KEY` must be the same value on both the OS server and the Trainings server. Rotate it the same way on both sides simultaneously.
5. Make sure the OS server has `https://trainings.nagarkot.com` (or your domain) added to its allowed redirect/CORS origins for SSO tokens.

---

### How SSO Login Works (for reference)

```
User clicks "Login with OS"
        │
        ▼
OS portal authenticates the user
        │
        ▼
OS issues a short-lived RS256 token and redirects to:
  https://trainings.nagarkot.com/sso?token=<RS256_token>
        │
        ▼
Trainings frontend sends token to POST /auth/sso
        │
        ▼
Trainings backend:
  1. Verifies RS256 signature using OS_JWT_PUBLIC_KEY
  2. Checks token has not been used before (replay protection)
  3. Calls OS /auth/verify-session to confirm account is still active
  4. Finds or creates local user, syncs role from is_app_admin / user_type
  5. Issues a Trainings HS256 JWT → returned to frontend
        │
        ▼
Frontend stores JWT in localStorage, user is logged in
```
1. Root Directory Setup
All commands assume you are starting from c:\projects\Training Module.

Terminal 1: Nagarket OS Backend (Hub API)
This is the central identity provider. It must be running for the Training Module to verify users.

Directory: c:\projects\Training Module\OS
Command:
powershell
npm run backend
URL: http://localhost:3001
Terminal 2: Nagarkot OS Frontend (Hub Portal)
This is the main dashboard where you log in initially.

Directory: c:\projects\Training Module\OS
Command:
powershell
npm run frontend
URL: http://localhost:3000
Terminal 3: Training Module Backend (Spoke API)
This is the FastAPI server we just updated with the new settings logic.

Directory: c:\projects\Training Module\backend
Command:
powershell
venv\Scripts\activate; python server.py
Alternative Command: venv\Scripts\activate ; python -m uvicorn app.main:app --port 8000 --reload
URL: http://localhost:8000
Terminal 4: Training Module Frontend (Spoke Client)
This is the learner/admin interface for trainings.

Directory: c:\projects\Training Module\frontend
Command:
powershell
npm run dev
URL: http://localhost:5173
Testing Workflow
Ensure DB is running: Make sure your PostgreSQL instance is active.
Start OS Services first: Start Terminals 1 and 2.
Start Training Services: Start Terminals 3 and 4.
Login Process:
Open http://localhost:5173 (Training Module).
Click "Login". It will redirect you to the OS Portal (localhost:3000).
Log in with your OS credentials.
OS will redirect you back to the Training Module with an SSO token.
Verify Settings:
Log in as an Admin (admin@nagarkot.com).
Navigate to the new Settings tab in the top navigation.
Try changing the video limit and verify it updates correctly!