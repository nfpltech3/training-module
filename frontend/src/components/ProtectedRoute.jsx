/**
 * ProtectedRoute — Guards routes that require authentication.
 *
 * If the user is not authenticated, redirects to /login.
 * If `requireAdmin` is true, non-admin users are redirected to /.
 */
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export default function ProtectedRoute({ children, requireAdmin = false, requireManager = false }) {
    const { isAuthenticated, isAdmin, isLoading, isManager } = useAuth();

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
                Checking session...
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (requireAdmin && !isAdmin) {
        return <Navigate to="/" replace />;
    }

    if (requireManager && !isManager) {
        return <Navigate to="/" replace />;
    }

    return children;
}
