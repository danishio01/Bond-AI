import React, { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => {
  const { apiFetch, refreshMe, setAccessTokenInMemory } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [mfaStep, setMfaStep] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<
    Array<{ id: string; email: string; displayName: string; cityRegion: string }>
  >([]);

  useEffect(() => {
    fetch('/api/auth/dev-demo-accounts')
      .then((r) => r.json())
      .then((d) => {
        if (d.enabled && Array.isArray(d.accounts)) setDemoAccounts(d.accounts);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, ...(mfaStep ? { totpCode } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to sign in');
        return;
      }
      if (data.mfaRequired) {
        setMfaStep(true);
        return;
      }
      if (data.accessToken) {
        setAccessTokenInMemory(data.accessToken);
      }
      await refreshMe();
      if ((data.user?.onboardingStep || 1) < 6 && !data.user?.isDevDemo) {
        navigate('/onboarding');
      } else {
        navigate('/discover');
      }
    } catch {
      setError('Network error while signing in');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 sm:p-8 shadow-sm">
        <p className="text-xs font-semibold text-[#7C5CFC]">Secure Sign In</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-slate-900 dark:text-white">
          Welcome back to BondAI
        </h1>
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
          Protected with Argon2id, HTTP-only cookies, and optional TOTP two-factor authentication.
        </p>

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Email address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Password
              </label>
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="text-xs text-[#7C5CFC] hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]"
              placeholder="••••••••••"
            />
          </div>

          {mfaStep && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                6-digit Authenticator Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3.5 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]"
                placeholder="123456"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-[#7C5CFC] hover:bg-[#6A48F5] disabled:opacity-60 text-white font-semibold py-3 text-sm transition-colors"
          >
            {submitting ? 'Signing in...' : mfaStep ? 'Verify 2FA & Sign In' : 'Sign In'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-600 dark:text-slate-400">
          New here?{' '}
          <button type="button" onClick={() => navigate('/register')} className="font-semibold text-[#7C5CFC] hover:underline">
            Create an 18+ account
          </button>
        </p>

        {demoAccounts.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Development Demo Accounts (Disabled in Production)
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Select a fictional demo account to test matching &amp; two-account E2EE messaging:
            </p>
            <div className="mt-2.5 space-y-1.5">
              {demoAccounts.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => {
                    setEmail(acc.email);
                    setPassword('BondAI-Dev-Demo-2026!');
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#1F1A2D] text-left text-xs"
                >
                  <span className="font-medium text-slate-800 dark:text-slate-200">{acc.displayName}</span>
                  <span className="text-slate-500 font-mono text-[11px]">{acc.email}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const RegisterPage: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptGuidelines, setAcceptGuidelines] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [previewToken, setPreviewToken] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'BondAI-Client' },
        body: JSON.stringify({
          name,
          email,
          dateOfBirth,
          password,
          acceptTerms,
          acceptGuidelines,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return;
      }
      setPreviewToken(data.verificationTokenPreview || 'CHECK_EMAIL');
    } catch {
      setError('Network error during registration');
    } finally {
      setSubmitting(false);
    }
  };

  if (previewToken) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 sm:p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
          <h1 className="mt-3 font-display text-2xl font-semibold text-slate-900 dark:text-white">
            Verify your email
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Your account is created with age-18+ validation and Argon2id password protection. Complete email verification to sign in.
          </p>
          {previewToken !== 'CHECK_EMAIL' && (
            <div className="mt-4 rounded-xl bg-slate-100 dark:bg-[#1F1A2D] p-3 text-left">
              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                Development Verification Token:
              </p>
              <p className="mt-1 font-mono text-xs break-all text-[#7C5CFC] select-all">
                {previewToken}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => navigate(`/verify-email?token=${encodeURIComponent(previewToken)}`)}
            className="mt-6 w-full rounded-xl bg-[#7C5CFC] hover:bg-[#6A48F5] text-white font-semibold py-3 text-sm"
          >
            Continue to Email Verification
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 sm:p-8 shadow-sm">
        <p className="text-xs font-semibold text-[#E85D93]">Step 1 · Adults 18+ Only</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-slate-900 dark:text-white">
          Create your BondAI account
        </h1>

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Full Name (stored encrypted; only first/display name shown)
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3.5 py-2.5 text-sm"
              placeholder="Aarav Sharma"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3.5 py-2.5 text-sm"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Date of Birth (Must be 18+)
            </label>
            <input
              type="date"
              required
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3.5 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Password (10+ chars, uppercase, lowercase, number)
            </label>
            <input
              type="password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3.5 py-2.5 text-sm"
              placeholder="Create a strong passphrase"
            />
          </div>

          <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-0.5 accent-[#7C5CFC]"
            />
            <span>
              I confirm I am at least 18 years old and accept the{' '}
              <button type="button" onClick={() => navigate('/legal/terms')} className="text-[#7C5CFC] underline">
                Terms of Service
              </button>{' '}
              and{' '}
              <button type="button" onClick={() => navigate('/legal/privacy')} className="text-[#7C5CFC] underline">
                Privacy Policy
              </button>
              .
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptGuidelines}
              onChange={(e) => setAcceptGuidelines(e.target.checked)}
              className="mt-0.5 accent-[#7C5CFC]"
            />
            <span>
              I agree to uphold the{' '}
              <button
                type="button"
                onClick={() => navigate('/legal/guidelines')}
                className="text-[#7C5CFC] underline"
              >
                Community Guidelines
              </button>{' '}
              and respectful consent standards.
            </span>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-[#7C5CFC] hover:bg-[#6A48F5] disabled:opacity-60 text-white font-semibold py-3 text-sm"
          >
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-600 dark:text-slate-400">
          Already registered?{' '}
          <button type="button" onClick={() => navigate('/login')} className="font-semibold text-[#7C5CFC] hover:underline">
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
};

export const VerifyEmailPage: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => {
  const initialToken =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('token') || ''
      : '';
  const [token, setToken] = useState(initialToken === 'CHECK_EMAIL' ? '' : initialToken);
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('idle');
    const res = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'BondAI-Client' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (res.ok) {
      setStatus('ok');
      setMessage(data.message);
    } else {
      setStatus('error');
      setMessage(data.error || 'Verification failed');
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 sm:p-8">
        <ShieldCheck className="w-8 h-8 text-[#7C5CFC]" />
        <h1 className="mt-3 font-display text-2xl font-semibold text-slate-900 dark:text-white">
          Email Verification
        </h1>
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
          Enter your single-use verification token to activate your BondAI account.
        </p>

        {message && (
          <div
            className={`mt-4 rounded-xl px-3.5 py-2.5 text-xs ${
              status === 'ok'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}
          >
            {message}
          </div>
        )}

        <form onSubmit={handleVerify} className="mt-5 space-y-4">
          <input
            type="text"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste verification token"
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3.5 py-2.5 text-sm font-mono"
          />
          <button
            type="submit"
            className="w-full rounded-xl bg-[#7C5CFC] hover:bg-[#6A48F5] text-white font-semibold py-3 text-sm"
          >
            Verify Email
          </button>
        </form>

        {status === 'ok' && (
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="mt-4 w-full rounded-xl border border-[#7C5CFC] text-[#7C5CFC] font-semibold py-2.5 text-sm"
          >
            Proceed to Sign In →
          </button>
        )}
      </div>
    </div>
  );
};

export const ForgotPasswordPage: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<'request' | 'reset' | 'done'>('request');
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'BondAI-Client' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Request failed');
      return;
    }
    if (data.resetTokenPreview) setToken(data.resetTokenPreview);
    setInfo(data.message);
    setStep('reset');
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'BondAI-Client' },
      body: JSON.stringify({ token, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Reset failed');
      return;
    }
    setInfo(data.message);
    setStep('done');
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 sm:p-8">
        <KeyRound className="w-8 h-8 text-[#7C5CFC]" />
        <h1 className="mt-3 font-display text-2xl font-semibold text-slate-900 dark:text-white">
          Reset Password
        </h1>
        {info && (
          <div className="mt-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 p-3 text-xs text-indigo-800 dark:text-indigo-200">
            {info}
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        {step === 'request' && (
          <form onSubmit={handleRequest} className="mt-5 space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Account email address"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3.5 py-2.5 text-sm"
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-[#7C5CFC] text-white font-semibold py-3 text-sm"
            >
              Request Single-Use Reset Token
            </button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={handleReset} className="mt-5 space-y-4">
            <input
              type="text"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Single-use reset token"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3.5 py-2.5 text-sm font-mono"
            />
            <input
              type="password"
              required
              minLength={10}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New strong password (10+ chars)"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3.5 py-2.5 text-sm"
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-[#7C5CFC] text-white font-semibold py-3 text-sm"
            >
              Update Password &amp; Revoke Old Sessions
            </button>
          </form>
        )}

        {step === 'done' && (
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="mt-5 w-full rounded-xl bg-[#7C5CFC] text-white font-semibold py-3 text-sm"
          >
            Sign In with New Password
          </button>
        )}

        <div className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-500">
          <Lock className="w-3.5 h-3.5" />
          <span>Reset tokens expire in 30 minutes and revoke all prior sessions.</span>
        </div>
      </div>
    </div>
  );
};
