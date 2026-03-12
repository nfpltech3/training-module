import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function SsoPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState('');
  const hasConsumed = useRef(false);

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setError('No SSO token provided.');
      return;
    }

    // Prevent second call entirely — ref persists across StrictMode remount
    if (hasConsumed.current) return;
    hasConsumed.current = true;

    async function consumeToken() {
      try {
        const res = await fetch(`${API_BASE}/auth/sso`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail || 'SSO failed');
        }

        const data = await res.json();
        login(data.user);
        window.history.replaceState({}, '', '/');
        navigate('/', { replace: true });

      } catch (err) {
        setError(err.message || 'SSO login failed. Please try again.');
      }
    }

    consumeToken();
  }, []);

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
        color: '#f8fafc',
        fontFamily: 'sans-serif',
      }}>
        <p style={{ color: '#f87171', marginBottom: 16 }}>{error}</p>
        <a href={`${import.meta.env.VITE_OS_PORTAL_URL || 'http://localhost:3000'}/dashboard`} style={{ color: '#60a5fa', fontSize: 14 }}>
          ← Return to OS Portal
        </a>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f172a',
      color: '#94a3b8',
      fontFamily: 'sans-serif',
      gap: 12,
    }}>
      <div style={{
        width: 20,
        height: 20,
        border: '2px solid #3b82f6',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <span>Signing you in...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
