'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, Lock } from 'lucide-react';

import { getWorkspaceUrl, hasOnlyAdminContext, hasOnlyStoreContext, login, storeStoreId, storeToken } from '@/lib/auth';
import { IntroSplash } from './intro-splash';

type FormErrors = {
  identifier?: string;
  password?: string;
  general?: string;
};

type LoginRole = 'admin' | 'store';

export default function LoginPage() {
  const router = useRouter();
  const identifierInputRef = useRef<HTMLInputElement | null>(null);
  const [loginRole, setLoginRole] = useState<LoginRole>('admin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [splashComplete, setSplashComplete] = useState(false);

  useEffect(() => {
    if (!splashComplete) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      identifierInputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [splashComplete]);

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

      if (loginRole === 'admin' && hasOnlyAdminContext(data.contexts)) {
        storeStoreId(null);
        window.location.href = getWorkspaceUrl('admin');
        return;
      }

      if (loginRole === 'store' && hasOnlyStoreContext(data.contexts)) {
        const ctx = data.contexts[0];
        storeStoreId(ctx.type === 'store' ? ctx.storeId : null);
        window.location.href = getWorkspaceUrl('store');
        return;
      }

      router.push('/select-context');
    } catch (err) {
      setErrors({
        general: err instanceof Error ? err.message : 'Login failed. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <IntroSplash onComplete={() => setSplashComplete(true)} />
      <div className={`login-shell flex min-h-screen items-center justify-center bg-background px-4 ${splashComplete ? 'login-shell--ready' : ''}`}>
        <div
          aria-hidden="true"
          className={`login-ambient-glow ${splashComplete ? 'login-ambient-glow--ready' : ''}`}
        />
        <div className={`login-panel w-full max-w-md ${splashComplete ? 'login-panel--ready' : ''}`}>
        {/* Card */}
          <div className="rounded-md border border-border bg-card transition-[border-color,background-color,box-shadow] duration-200 hover:border-foreground/15 hover:shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
          {/* Header */}
            <div className="border-b border-border px-6 py-6">
              <div className="mb-5 flex flex-col items-center">
                <img
                  src="/marketone-logo.svg"
                  alt="Market One logo"
                  className={`login-brand-logo h-16 w-16 object-contain ${splashComplete ? 'login-brand-logo--ready' : ''}`}
                />
                <p className={`login-brand-text mt-3 text-center text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground ${splashComplete ? 'login-brand-text--ready' : ''}`}>
                  Market One BD
                </p>
              </div>
            {/* Role toggle */}
              <div className={`login-stagger login-stagger--1 mb-5 flex rounded-md border border-border bg-muted p-0.5 ${splashComplete ? 'login-stagger--ready' : ''}`}>
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
                className={`login-stagger login-stagger--2 text-center text-2xl font-semibold tracking-tight ${splashComplete ? 'login-stagger--ready' : ''}`}
                style={{ color: 'rgb(17, 17, 17)' }}
              >
                {loginRole === 'admin' ? 'Admin sign in' : 'Store sign in'}
              </h2>
              <p className={`login-stagger login-stagger--3 mt-2 text-center text-sm text-muted-foreground ${splashComplete ? 'login-stagger--ready' : ''}`}>
                {loginRole === 'admin'
                  ? 'Manage stores, staff, and platform settings.'
                  : 'Sign in with your store credentials.'}
              </p>
            </div>

          {/* Form */}
            <div className="px-6 py-6">
            {errors.general && (
              <div className={`login-stagger login-stagger--4 mb-4 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 ${splashComplete ? 'login-stagger--ready' : ''}`}>
                <p className="text-xs text-destructive">{errors.general}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className={`login-stagger login-stagger--4 space-y-2 ${splashComplete ? 'login-stagger--ready' : ''}`}>
                <label
                  htmlFor="email"
                  className="flex items-center gap-2 text-sm leading-none font-medium select-none"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <input
                    ref={identifierInputRef}
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    disabled={loading || !splashComplete}
                    autoComplete="username"
                    autoFocus={false}
                    className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-2.5 text-sm shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] h-11 pl-9"
                  />
                </div>
                {errors.identifier && (
                  <p className="text-xs text-destructive">{errors.identifier}</p>
                )}
              </div>

              <div className={`login-stagger login-stagger--5 space-y-2 ${splashComplete ? 'login-stagger--ready' : ''}`}>
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
                    disabled={loading || !splashComplete}
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
                disabled={loading || !splashComplete}
                className={`login-stagger login-stagger--6 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2.5 h-11 w-full ${splashComplete ? 'login-stagger--ready' : ''}`}
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
        </div>
      </div>
    </>
  );
}
