# Audit — OS↔Trainings Deactivation & Inbound Webhook Gap Analysis
**Date:** 2026-03-09  
**Auditor:** GitHub Copilot  
**Scope:** Read-only. No changes made.

---

## 1. Does OS notify Trainings when a user is deactivated?

**Answer: NO.**

There is no inbound webhook, no listener endpoint, and no polling job in the Trainings backend that receives a deactivation or deletion event from OS.

The flow is **one-way and outbound only**: when a Trainings admin marks a user as `is_active=false`, Trainings calls OS to push that change (`PATCH /users/{os_user_id}`). The reverse — OS calling Trainings when it deactivates a user — does not exist.

A user deactivated in OS will remain `is_active=true` in the Trainings database and will be blocked only if:
- They attempt to log in via SSO (the `verify-session` check in sso.py catches it — see Point 5), or
- They attempt a password login and OS rejects the `verify-password` call.

A user who already holds a valid Trainings JWT can continue to access Trainings until that token expires (no real-time revocation).

---

## 2. Does any endpoint exist to deactivate/delete a user by os_user_id?

**Answer: NO.**

There is no endpoint in `main.py` or `sso.py` that accepts an inbound call keyed by `os_user_id` to deactivate or delete a user. Every endpoint here is either:
- Frontend-facing (requires a Trainings JWT via `get_current_user` / `require_admin`), or
- Outbound (Trainings calling OS, not OS calling Trainings).

The only endpoint that touches `is_active` is:

```
PUT /admin/users/{user_id}
```

This requires a Trainings JWT with ADMIN role. There is no equivalent endpoint for OS to call with an `os_user_id`.

---

## 3. admin_update_user() — the is_active=false block

File: `backend/app/main.py`, lines ~317–377

The full `admin_update_user` function, with the deactivation notification block:

```python
@app.put("/admin/users/{user_id}", response_model=schemas.UserResponse)
def admin_update_user(user_id: str, payload: schemas.AdminUserUpdate,
                      db: Session = Depends(get_db),
                      admin: models.User = Depends(require_admin)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "password" in update_data:
        if update_data["password"]:
            db_user.password_hash = hash_password(update_data["password"])
        del update_data["password"]
    if "email" in update_data and update_data["email"]:
        if db.query(models.User).filter(models.User.email == update_data["email"],
                                        models.User.id != user_id).first():
            raise HTTPException(status_code=400, detail="Email taken")
        db_user.email = update_data["email"]
    update_data.pop("email", None)

    # [FIX 2 guard — ADMIN role protection]
    if "role_id" in update_data and update_data["role_id"] is not None:
        admin_role = db.query(models.Role).filter(models.Role.name == "ADMIN").first()
        if admin_role and update_data["role_id"] == admin_role.id:
            if not db_user.is_app_admin:
                raise HTTPException(status_code=403, detail="ADMIN role can only be granted via OS portal...")

    for key, value in update_data.items():
        if value is not None:
            setattr(db_user, key, value)

    # [FIX 3 — department_slug sync]
    if "department_id" in update_data:
        if update_data["department_id"]:
            dept = db.query(models.Department).filter(
                models.Department.id == update_data["department_id"]
            ).first()
            if dept:
                db_user.department_slug = dept.name.lower().replace(" ", "_")
        else:
            db_user.department_slug = None

    db.commit()
    db.refresh(db_user)

    # If user was deactivated, notify OS
    if 'is_active' in update_data and not update_data['is_active']:
        if db_user.os_user_id:
            try:
                httpx.patch(
                    f"{OS_BACKEND_URL}/users/{db_user.os_user_id}",
                    json={"is_active": False},
                    headers={"x-internal-key": INTERNAL_API_KEY},
                    timeout=5.0,
                )
            except httpx.RequestError:
                # Log but don't block — local deactivation still happened
                print(f"WARNING: Could not deactivate user {db_user.os_user_id} in OS")

    return db_user
```

**Key observations on the deactivation block:**
- It only fires when `is_active` is explicitly in the payload **and** set to `false`.
- It calls `PATCH {OS_BACKEND_URL}/users/{os_user_id}` with `{"is_active": false}`.
- If `db_user.os_user_id` is `None` (local-only user), **OS is never notified** — silent.
- If the OS call fails (`httpx.RequestError`), it only prints a warning. The local deactivation has already been committed. No retry, no alarm.
- The OS call happens **after** `db.commit()` — the local deactivation is permanent even if OS call fails.
- There is **no response check** on the OS PATCH — if OS returns 400 or 500, Trainings ignores it.

---

## 4. What happens when a user logs in with a deactivated OS account?

### 4a. SSO login path (`POST /auth/sso` via sso.py)

**Trace:**

1. Token is decoded (RS256 signature verified).
2. Replay check passes.
3. Token is consumed (written to `SsoTokenLog`).
4. **Step 3b — verify-session call to OS:**
   ```python
   check = httpx.post(
       f"{OS_BACKEND_URL}/auth/verify-session",
       json={"os_user_id": os_user_id},
       headers={"x-internal-key": INTERNAL_API_KEY},
       timeout=5.0,
   )
   if check.status_code == 200 and not check.json().get("is_active", True):
       raise HTTPException(status_code=403,
           detail="Your account has been deactivated. Contact your administrator.")
   ```
   - If OS returns `{"is_active": false}` → **403 Forbidden, access denied**. ✓
   - If OS is unreachable (`httpx.RequestError`) → **fail open**: warning is logged, login proceeds.
5. If step 4 passes: local user is found or created, Trainings JWT is issued.
6. Final `is_active` check on local user: if `is_active=false` in Trainings DB → **403 Forbidden**.

**Result:** A user whose OS account is deactivated is blocked at step 4 **only if OS is reachable**. If OS is down, the deactivated user can still log in.

---

### 4b. Password login path (`POST /auth/login` in main.py)

**Trace:**

1. User looked up by email/username.
2. Local `is_active` check:
   ```python
   if not user.is_active:
       raise HTTPException(status_code=403, detail="Account is deactivated")
   ```
   - If local `is_active=false` → **403 immediately**. But this only helps if Trainings was already notified.
3. If user's `password_hash == "SSO_USER_NO_PASSWORD"` (SSO user):
   ```python
   res = httpx.post(
       f"{OS_BACKEND_URL}/auth/verify-password",
       json={"email": user.email, "password": payload.password, "app_slug": "trainings"},
       headers={"x-internal-key": INTERNAL_API_KEY},
       timeout=10.0,
   )
   data = res.json()
   if res.status_code != 200 or not data.get("valid"):
       raise HTTPException(status_code=401, detail="Invalid email or password")
   ```
   - OS's `verify-password` endpoint is expected to return `valid: false` for a deactivated user. If it does → **401** (user sees "invalid password", not a clear deactivation message).
   - If OS is unreachable → **503 service unavailable**.
4. Local user: password check is entirely local — OS deactivation has **zero effect** unless Trainings was already notified.

**Result for SSO users at password login:** Blocked at the `verify-password` step, **but the error message ("Invalid email or password") does not tell them they were deactivated**. A separate `reason=no_app_access` path exists for app access revocation, but no explicit deactivated-account reason is handled.

**Result for local (non-SSO) users:** Only the local `is_active` flag matters. OS deactivation has no effect on local users at login.

---

## 5. Full verify-session call in sso.py

File: `backend/app/sso.py`, lines ~119–135

```python
# ── 3b. Verify user is still active in OS ─────────────────────
try:
    check = httpx.post(
        f"{OS_BACKEND_URL}/auth/verify-session",
        json={"os_user_id": os_user_id},
        headers={"x-internal-key": INTERNAL_API_KEY},
        timeout=5.0,
    )
    if check.status_code == 200 and not check.json().get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Contact your administrator.",
        )
except httpx.RequestError:
    # OS unreachable — fail open, log warning
    print(f"WARNING: Could not reach OS to verify user {os_user_id} — proceeding")
```

**What it checks:** Posts `{"os_user_id": ...}` to OS `/auth/verify-session` with the internal API key. Reads `is_active` from the response.

**What it does if OS says `is_active=false`:** Returns HTTP 403 with message `"Your account has been deactivated. Contact your administrator."` — the SSO token is already consumed (replay-safe) so a deactivated user cannot retry with the same token.

**What it does if OS is unreachable:** Fails open — catches `httpx.RequestError`, prints a warning to stdout, and continues as if the user is active. This is an explicit design choice (comment says "fail open").

**What it does NOT check:**
- It does not check the HTTP status code other than 200. If OS returns 4xx or 5xx (not a network error), the `check.json()` call may raise an exception that is not caught, potentially crashing the request.
- It does not sync the local `is_active` flag — even if OS says the user is inactive, Trainings does not update `users.is_active` in the DB at this point. The user remains `is_active=true` locally.

---

## 6. Background sync job / polling mechanism

**Answer: NO.**

There is no background job, scheduled task, cron, or polling mechanism anywhere in the Trainings backend that:
- Periodically syncs user state from OS
- Checks which users OS has deactivated and mirrors that locally
- Runs any async or scheduled work

The only file that could contain such logic was checked: `main.py`, `sso.py`, `auth.py`, `models.py`, `database.py`, `schemas.py`. None contain `threading`, `asyncio` (beyond FastAPI's own), `apscheduler`, `celery`, `BackgroundTasks`, `cron`, or any similar mechanism.

Sync only happens at authentication time (SSO login or password login).

---

## 7. All Trainings backend endpoints designed to receive inbound calls from OS

**Answer: NONE.**

There is no endpoint in `main.py` or `sso.py` that is designed to be called **by OS** (inbound direction). Every endpoint either:
- Requires a Trainings JWT (`get_current_user` or `require_admin`) — OS has no Trainings JWT, so it cannot call these, or
- Is the SSO endpoint (`POST /auth/sso`) which is called by the **Trainings frontend** (not directly by OS), or
- Is publicly accessible but not keyed by internal API key or `os_user_id` for OS use.

### Full endpoint inventory with caller intent:

| Method | Path | Auth | Designed caller |
|--------|------|------|----------------|
| GET | `/` | None | Anyone (healthcheck) |
| POST | `/auth/sso` | RS256 SSO token | Trainings frontend (after OS redirect) |
| POST | `/auth/login` | None (validates credentials) | Trainings frontend |
| GET | `/departments/` | None | Trainings frontend |
| POST | `/departments/` | Trainings JWT (ADMIN) | Trainings frontend (admin) |
| PUT | `/departments/{dept_id}` | Trainings JWT (ADMIN) | Trainings frontend (admin) |
| POST | `/users/` | Trainings JWT (ADMIN) | Trainings frontend (admin) |
| GET | `/users/me` | Trainings JWT | Trainings frontend |
| PUT | `/users/me` | Trainings JWT | Trainings frontend |
| GET | `/users/` | Trainings JWT (ADMIN) | Trainings frontend (admin) |
| PUT | `/admin/users/{user_id}` | Trainings JWT (ADMIN) | Trainings frontend (admin) |
| GET | `/roles/` | None | Trainings frontend |
| GET | `/modules/` | Trainings JWT | Trainings frontend |
| POST | `/modules/` | Trainings JWT (ADMIN) | Trainings frontend (admin) |
| PUT | `/modules/{module_id}` | Trainings JWT (ADMIN) | Trainings frontend (admin) |
| PUT | `/modules/{module_id}/reorder` | Trainings JWT (ADMIN) | Trainings frontend (admin) |
| POST | `/content/` | Trainings JWT (ADMIN) | Trainings frontend (admin) |
| PUT | `/content/{content_id}` | Trainings JWT (ADMIN) | Trainings frontend (admin) |
| PUT | `/content/{content_id}/reorder` | Trainings JWT (ADMIN) | Trainings frontend (admin) |
| POST | `/content/upload-document` | Trainings JWT (ADMIN) | Trainings frontend (admin) |
| POST | `/progress/` | Trainings JWT | Trainings frontend |
| GET | `/progress/` | Trainings JWT | Trainings frontend |
| GET | `/admin/reports/summary` | Trainings JWT (ADMIN) | Trainings frontend (admin) |
| GET | `/admin/reports/user/{user_id}` | Trainings JWT (ADMIN) | Trainings frontend (admin) |

**No endpoint accepts an `x-internal-key` header for OS to call Trainings.** The key only flows outbound (Trainings → OS).

---

## Summary of Gaps Found

| # | Gap | Severity |
|---|-----|----------|
| G1 | No inbound webhook endpoint for OS to notify Trainings of user deactivation | High |
| G2 | No inbound webhook endpoint for OS to notify Trainings of user deletion | High |
| G3 | `verify-session` fails open — OS unreachable = deactivated user can still SSO in | Medium |
| G4 | `verify-session` response: non-200 (non-network) errors are not caught — may crash request | Medium |
| G5 | Local `users.is_active` is never synced from OS (only set by Trainings admin action) | Medium |
| G6 | Outbound deactivation PATCH to OS has no response validation — silent if OS rejects it | Low |
| G7 | Outbound deactivation PATCH skipped if `os_user_id` is null — local-only users never synced | Low |
| G8 | Password login failure message for deactivated SSO users is "Invalid email or password" — not informative | Low |
| G9 | No background sync — a user deactivated in OS retains full Trainings access until next login attempt | Medium |
| G10 | Valid Trainings JWTs are not revoked when a user is deactivated — existing sessions continue until token expiry | Medium |
