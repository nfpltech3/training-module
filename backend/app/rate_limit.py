"""
Shared rate-limiter instance (slowapi).

Imported by both main.py (to register on the app) and sso.py
(to decorate the /auth/sso route) — avoiding circular imports.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
