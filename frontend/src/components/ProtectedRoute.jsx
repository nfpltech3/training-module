/**
 * ProtectedRoute — Guards routes that require authentication.
 *
 * If the user is not authenticated, redirects to /login.
 * If `requireAdmin` is true, non-admin users are redirected to /.
 */
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export default function ProtectedRoute({ children, requireAdmin = false }) {
    const { isAuthenticated, isAdmin } = useAuth();

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (requireAdmin && !isAdmin) {
        return <Navigate to="/" replace />;
    }

    return children;
}
