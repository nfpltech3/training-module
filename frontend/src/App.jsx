/**
 * App — Root component.
 *
 * Wraps the application in AuthProvider and defines React Router routes.
 * All authenticated routes use AppLayout as a shared shell.
 * Admin routes are further guarded by ProtectedRoute with requireAdmin.
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import LearnerDashboard from './pages/LearnerDashboard';
import ModuleViewer from './pages/ModuleViewer';
import AdminDashboard from './pages/AdminDashboard';
import AdminReports from './pages/AdminReports';
import SsoPage from './pages/SsoPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/sso" element={<SsoPage />} />

          {/* Authenticated routes — wrapped in AppLayout shell */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            {/* Learner dashboard (all authenticated users) */}
            <Route index element={<LearnerDashboard />} />
            <Route path="module/:moduleId" element={<ModuleViewer />} />

            {/* Admin-only routes */}
            <Route
              path="admin"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/reports"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminReports />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Catch-all: redirect unknown paths to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
