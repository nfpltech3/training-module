/**
 * Auth Context — provides JWT token management, login/logout, and user state.
 * * Token is stored in localStorage for persistence across page refreshes.
 * The user object is cached alongside the token to avoid extra API calls.
 */
import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const AuthContext = createContext(null);

const TOKEN_KEY = 'nagarkot_token';
const USER_KEY = 'nagarkot_user';

function getStoredAuth() {
    try {
        const token = localStorage.getItem(TOKEN_KEY);
        const user = JSON.parse(localStorage.getItem(USER_KEY));
        if (token && user) return { token, user };
    } catch {
        // Corrupted storage — clear it
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    }
    return { token: null, user: null };
}

export function AuthProvider({ children }) {
    const [auth, setAuth] = useState(getStoredAuth);

    const login = useCallback((token, user) => {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        setAuth({ token, user });
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setAuth({ token: null, user: null });
    }, []);

    const updateUser = useCallback((updatedUser) => {
        localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
        setAuth(prev => ({ ...prev, user: updatedUser }));
    }, []);

    const value = useMemo(() => ({
        token: auth.token,
        user: auth.user,
        isAuthenticated: !!auth.token,
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