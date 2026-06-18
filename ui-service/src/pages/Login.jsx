import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { HeartPulse, LogIn, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Inline fetch — no external module dependency
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error('Server returned an unexpected response. Please try again.');
      }

      if (!res.ok) {
        throw new Error(data?.error || data?.message || 'Sign in failed. Please check your credentials.');
      }

      if (!data?.token || !data?.user) {
        throw new Error('Sign in failed. Please try again.');
      }

      // Persist session
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Route based on role
      const finalRole = (data.user.role || '').toUpperCase();
      if (finalRole === 'ELDER') navigate('/elder');
      else if (finalRole === 'FAMILY') navigate('/family');
      else if (finalRole === 'ADMIN') navigate('/admin');
      else if (finalRole === 'SUPER_ADMIN') navigate('/super-admin');
      else navigate('/family');

    } catch (err) {
      // Only show user-safe messages — never expose internals
      const raw = err?.message || '';
      if (
        !raw ||
        raw.includes('is not defined') ||
        raw.includes('is not a function') ||
        raw.includes('Cannot read') ||
        raw.includes('SyntaxError')
      ) {
        setError('Something went wrong. Please refresh the page and try again.');
      } else {
        setError(raw);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-white/20 backdrop-blur-md rounded-full shadow-xl mb-4 border border-white/30">
            <HeartPulse className="w-14 h-14 text-white" strokeWidth={1.5} />
          </div>
          <h1 className="text-5xl font-extrabold text-white tracking-tight drop-shadow-lg">ElderPing</h1>
          <p className="text-white/80 mt-2 text-xl font-medium">Your Daily Care Companion</p>
        </div>

        {/* Card */}
        <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] shadow-2xl p-10 border border-white/50 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-pink-500"></div>
          
          <h2 className="text-3xl font-extrabold text-gray-800 mb-8 text-center tracking-tight">Welcome Back</h2>

          {error && (
            <div
              id="login-error"
              role="alert"
              className="mb-6 bg-red-50 border-2 border-red-400 text-red-700 rounded-xl p-4 text-lg font-medium text-center"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xl font-semibold text-gray-700 mb-2" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                autoComplete="username"
                className="w-full border-2 border-gray-300 rounded-xl px-5 py-4 text-xl text-gray-800 focus:outline-none focus:border-blue-600 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xl font-semibold text-gray-700 mb-2" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  className="w-full border-2 border-gray-300 rounded-xl px-5 py-4 text-xl text-gray-800 focus:outline-none focus:border-blue-600 transition-colors pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  aria-label="Toggle password visibility"
                >
                  {showPass ? <EyeOff className="w-7 h-7" /> : <Eye className="w-7 h-7" />}
                </button>
              </div>
            </div>

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:from-indigo-400 disabled:to-purple-400 text-white text-xl font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              {loading ? (
                <span className="animate-spin inline-block w-6 h-6 border-4 border-white/30 border-t-white rounded-full" />
              ) : (
                <LogIn className="w-6 h-6" />
              )}
              {loading ? 'Signing In…' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-gray-600 text-lg mt-8 font-medium">
            Don&apos;t have an account?{' '}
            <Link
              id="go-to-register"
              to="/register"
              className="text-indigo-600 font-bold hover:text-indigo-800 transition-colors"
            >
              Register here
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}
