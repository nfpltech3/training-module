/**
 * Auth Context — manages the authenticated user for cookie-backed sessions.
 *
 * The JWT lives only in an httpOnly cookie. On app mount, the frontend
 * rehydrates auth state by asking the backend for the current user.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authLogout, getMe } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [auth, setAuth] = useState({
        user: null,
        isLoading: true,
    });

    useEffect(() => {
        let isMounted = true;

        const hydrateAuth = async () => {
            if (window.location.pathname.startsWith('/sso')) {
                if (isMounted) setAuth({ user: null, isLoading: false });
                return;
            }

            try {
                const res = await getMe();
                if (isMounted) {
                    setAuth({ user: res.data, isLoading: false });
                }
            } catch {
                if (isMounted) {
                    setAuth({ user: null, isLoading: false });
                }
            }
        };

        hydrateAuth();

        return () => {
            isMounted = false;
        };
    }, []);

    const login = useCallback((user) => {
        setAuth({ user, isLoading: false });
    }, []);

    const logout = useCallback(async () => {
        try {
            await authLogout();
        } catch {
            // Local auth state should still be cleared even if the backend call fails.
        } finally {
            setAuth({ user: null, isLoading: false });
        }
    }, []);

    const updateUser = useCallback((updatedUser) => {
        setAuth((prev) => ({ ...prev, user: updatedUser }));
    }, []);

    const value = useMemo(() => ({
        user: auth.user,
        isLoading: auth.isLoading,
        isAuthenticated: !!auth.user,
        isAdmin: auth.user?.role?.name === 'ADMIN',
        isManager: auth.user?.role?.name === 'ADMIN' || auth.user?.role?.name === 'TEAM LEAD',
        isAppAdmin: !!auth.user?.is_app_admin,
        login,
        logout,
        updateUser,
    }), [auth, login, logout, updateUser]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
    return ctx;
}
