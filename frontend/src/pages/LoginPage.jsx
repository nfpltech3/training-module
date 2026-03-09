/**
 * LoginPage — Secure JWT authentication form.
 *
 * Calls POST /auth/login and stores the returned JWT + user in AuthContext.
 * Redirects to / (learner dashboard) or /admin (if admin) after login.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authLogin } from '../lib/api';
import { Eye, EyeOff, BookOpen, Loader2 } from 'lucide-react';

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await authLogin(identifier.trim(), password);
            const { access_token, user } = res.data;

            // Store in AuthContext + localStorage
            login(access_token, user);

            // Redirect based on role (role is an object { name: 'ADMIN' })
            if (user.role?.name === 'ADMIN') {
                navigate('/admin', { replace: true });
            } else {
                navigate('/', { replace: true });
            }
        } catch (err) {
            const detail = err.response?.data?.detail;
            setError(detail || 'Unable to connect. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-4 font-sans">
            <div className="w-full max-w-md">
                {/* Card */}
                <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-10 text-center">
                        <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mx-auto mb-4">
                            <BookOpen className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-white">
                            Nagarkot Learning
                        </h1>
                        <p className="text-blue-100 text-sm mt-2">
                            Knowledge Sharing & Tracking Platform
                        </p>
                    </div>

                    {/* Form */}
                    <div className="p-8">
                        {error && (
                            <div className="bg-red-50 text-red-700 text-sm font-medium p-4 rounded-xl border border-red-100 mb-6 text-center">
                                <p>{error}</p>
                                {error.includes('portal') && (
                                    <a
                                        href="http://localhost:3000"
                                        style={{ color: '#2563eb', fontSize: 13, display: 'block', marginTop: 6 }}
                                    >
                                        → Go to Nagarkot OS Portal
                                    </a>
                                )}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">
                                    Email or Username
                                </label>
                                <input
                                    type="text"
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    required
                                    autoFocus
                                    placeholder="admin@nagarkot.com"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">
                                    Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        placeholder="••••••••"
                                        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none text-sm pr-12"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                                    >
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-blue-200 transition-all text-sm flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Signing in...
                                    </>
                                ) : (
                                    'Sign In'
                                )}
                            </button>
                        </form>
                    </div>
                </div>

                <p className="text-center text-xs text-slate-400 mt-6">
                    © {new Date().getFullYear()} Nagarkot Forwarders Pvt. Ltd.
                </p>
            </div>
        </div>
    );
}
