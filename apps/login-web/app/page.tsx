'use client';

import { useState } from 'react';
import { Loader2, Mail, Lock } from 'lucide-react';

import { login, storeToken } from '@/lib/auth';

type FormErrors = {
  identifier?: string;
  password?: string;
  general?: string;
};

type LoginRole = 'admin' | 'store';

export default function LoginPage() {
  const [loginRole, setLoginRole] = useState<LoginRole>('admin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  const validate = (): FormErrors => {
    const errs: FormErrors = {};
    if (!identifier.trim()) {
      errs.identifier = 'Email or phone is required';
    }
    if (!password) {
      errs.password = 'Password is required';
    } else if (password.length < 10) {
      errs.password = 'Password must be at least 10 characters';
    }
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);

    try {
      const data = await login(identifier, password);
      storeToken(data.accessToken);

      if (loginRole === 'admin') {
        window.location.href = `http://localhost:3001/?token=${data.accessToken}`;
      } else {
        window.location.href = `http://localhost:3002/?token=${data.accessToken}`;
      }
    } catch (err) {
      setErrors({
        general: err instanceof Error ? err.message : 'Login failed. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="rounded-md border border-border bg-card transition-[border-color,background-color,box-shadow] duration-200 hover:border-foreground/15 hover:shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
          {/* Header */}
          <div className="border-b border-border px-6 py-6">
            {/* Role toggle */}
            <div className="mb-5 flex rounded-md border border-border bg-muted p-0.5">
              <button
                type="button"
                onClick={() => setLoginRole('admin')}
                className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-all ${
                  loginRole === 'admin'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Platform Admin
              </button>
              <button
                type="button"
                onClick={() => setLoginRole('store')}
                className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-all ${
                  loginRole === 'store'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Store Staff
              </button>
            </div>

            <h2
              className="text-center text-2xl font-semibold tracking-tight"
              style={{ color: 'rgb(17, 17, 17)' }}
            >
              {loginRole === 'admin' ? 'Admin sign in' : 'Store sign in'}
            </h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {loginRole === 'admin'
                ? 'Manage stores, staff, and platform settings.'
                : 'Sign in with your store credentials.'}
            </p>
            {loginRole === 'admin' && (
              <p className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
                Use the seeded platform admin account created with `BOOTSTRAP_PLATFORM_ADMIN_*`.
              </p>
            )}
          </div>

          {/* Form */}
          <div className="px-6 py-6">
            {errors.general && (
              <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2">
                <p className="text-xs text-destructive">{errors.general}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="flex items-center gap-2 text-sm leading-none font-medium select-none"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    disabled={loading}
                    autoComplete="username"
                    autoFocus
                    className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-2.5 text-sm shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] h-11 pl-9"
                  />
                </div>
                {errors.identifier && (
                  <p className="text-xs text-destructive">{errors.identifier}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="flex items-center gap-2 text-sm leading-none font-medium select-none"
                  >
                    Password
                  </label>
                  <a
                    className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    href="/reset-password"
                  >
                    Forgot password?
                  </a>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="current-password"
                    className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-2.5 text-sm shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] h-11 pl-9"
                  />
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2.5 h-11 w-full"
                style={{ backgroundColor: 'rgb(17, 17, 17)', color: 'rgb(255, 255, 255)' }}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>
          </div>

        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          By signing in, you agree to our{' '}
          <a className="underline underline-offset-4 hover:text-foreground" href="/terms">
            Terms of Service
          </a>{' '}
          and{' '}
          <a className="underline underline-offset-4 hover:text-foreground" href="/privacy">
            Privacy Policy
          </a>.
        </p>
      </div>
    </div>
  );
}
