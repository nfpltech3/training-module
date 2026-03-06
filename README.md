# Nagarkot Knowledge Sharing & Tracking Platform

This project is a strictly scoped application designed to distribute training videos and documents across an organization. It focuses on clean content delivery, absolute organizational isolation based on departments, and reliable audit tracking. It explicitly removes extraneous features of a traditional LMS (like quizzes or forums) to prioritize speed and reliability.

## 🏗 Tech Stack
- **Backend**: Python (FastAPI), SQLite (SQLAlchemy ORM), Pydantic v2
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
python -m uvicorn app.main:app --reload
```
*The API will be available at http://localhost:8000. On the first startup, it will automatically generate the `nagarkot.db` file alongside the seed data.*

### 2. Frontend (React/Vite)
Open a secondary terminal:

```bash
cd frontend

# Install Node dependencies
npm install

# Start the Vite development server
npm run dev
```
*The client app will be available at http://localhost:5173.*

---

## 🔑 Default Admin Credentials
When the database runs for the first time, it automatically creates a root administrator. You can use these credentials to log in, assign real departments, and manage global settings.

- **Username / Email:** `admin@nagarkot.com` / `admin`
- **Password:** `admin123`
