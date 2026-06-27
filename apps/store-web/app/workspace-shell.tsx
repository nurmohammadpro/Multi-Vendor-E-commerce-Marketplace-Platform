'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

import { motocoreColors } from './motocore-theme';

type NavItem = {
  href: string;
  label: string;
};

type WorkspaceShellProps = {
  accent: 'blue' | 'rose' | 'motocore';
  badge: string;
  description: string;
  navItems: NavItem[];
  title: string;
  children: ReactNode;
};

export function WorkspaceShell({ accent, badge, description, navItems, title, children }: WorkspaceShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!sidebarOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [sidebarOpen]);

  const activeItem = useMemo(() => {
    return navItems.find((item) => {
      if (item.href === '/') {
        return pathname === '/';
      }

      return pathname === item.href || pathname.startsWith(`${item.href}/`);
    });
  }, [navItems, pathname]);

  return (
    <div className={`workspace-shell theme-${accent}`}>
      <header className="workspace-topbar">
        <button
          type="button"
          className="workspace-menu-button"
          aria-expanded={sidebarOpen}
          aria-controls="workspace-sidebar"
          onClick={() => setSidebarOpen((value) => !value)}
        >
          Menu
        </button>

        <div className="workspace-topbar-copy">
          <span className="workspace-badge">{badge}</span>
          <div>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
        </div>

        <a className="workspace-download workspace-download-mobile" href="/api/code/download" download>
          Download ZIP
        </a>
      </header>

      <aside
        id="workspace-sidebar"
        className={`workspace-sidebar ${sidebarOpen ? 'is-open' : ''}`}
        aria-label={`${title} navigation`}
      >
        <div className="workspace-brand">
          <span className="workspace-brand-kicker">{badge}</span>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>

        <nav className="workspace-nav">
          {navItems.map((item) => {
            const isActive = activeItem?.href === item.href;

            return (
              <a key={item.href} href={item.href} data-active={isActive ? 'true' : 'false'}>
                <span>{item.label}</span>
                {isActive ? <span className="workspace-nav-indicator">Current</span> : null}
              </a>
            );
          })}
        </nav>

        <div className="workspace-sidebar-footer">
          <a className="workspace-download workspace-download-desktop" href="/api/code/download" download>
            Download ZIP
          </a>
          <p>Bundle the current workspace when you need an offline handoff or archival copy.</p>
        </div>
      </aside>

      <button
        type="button"
        className={`workspace-backdrop ${sidebarOpen ? 'is-visible' : ''}`}
        aria-label="Close navigation"
        onClick={() => setSidebarOpen(false)}
      />

      <main className="workspace-main">
        <div className="workspace-current">
          <span>{activeItem?.label ?? 'Dashboard'}</span>
        </div>
        {children}
      </main>

      <style>{`
        :root {
          color-scheme: light;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          min-height: 100%;
          background:
            radial-gradient(circle at top left, rgba(37, 99, 235, 0.1), transparent 28%),
            radial-gradient(circle at top right, rgba(37, 99, 235, 0.05), transparent 24%),
            linear-gradient(180deg, ${motocoreColors.background} 0%, ${motocoreColors.backgroundAlt} 100%);
          color: ${motocoreColors.ink};
          font-family:
            var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',
            sans-serif;
        }

        a {
          color: inherit;
        }

        .theme-blue {
          --shell-ink: ${motocoreColors.ink};
          --shell-muted: ${motocoreColors.muted};
          --shell-surface: ${motocoreColors.surface};
          --shell-surface-strong: ${motocoreColors.surfaceSoft};
          --shell-border: ${motocoreColors.border};
          --shell-accent: ${motocoreColors.accent};
          --shell-accent-soft: ${motocoreColors.accentSoft};
          --shell-active: rgba(37, 99, 235, 0.08);
          --shell-shadow: ${motocoreColors.shadowStrong};
        }

        .theme-blue .workspace-download {
          border-color: rgba(37, 99, 235, 0.26);
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(37, 99, 235, 0.06));
        }

        .theme-rose .workspace-download {
          border-color: rgba(244, 114, 182, 0.26);
          background: linear-gradient(135deg, rgba(190, 24, 93, 0.12), rgba(249, 115, 22, 0.06));
        }

        .workspace-shell {
          display: grid;
          grid-template-columns: 256px minmax(0, 1fr);
          min-height: 100dvh;
        }

        .workspace-topbar {
          display: none;
        }

        .workspace-sidebar {
          position: sticky;
          top: 0;
          align-self: start;
          min-height: 100dvh;
          padding: 20px;
          border-right: 1px solid var(--shell-border, rgba(148, 163, 184, 0.16));
          background: linear-gradient(180deg, var(--shell-surface, rgba(255, 255, 255, 0.96)), rgba(248, 250, 252, 0.92));
          display: flex;
          flex-direction: column;
        }

        .workspace-brand {
          margin-bottom: 20px;
        }

        .workspace-brand-kicker,
        .workspace-badge {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          margin-bottom: 8px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .theme-blue .workspace-brand-kicker,
        .theme-blue .workspace-badge {
          color: #93c5fd;
        }

        .theme-rose .workspace-brand-kicker,
        .theme-rose .workspace-badge {
          color: #f9a8d4;
        }

        .theme-motocore .workspace-brand-kicker,
        .theme-motocore .workspace-badge {
          color: var(--shell-accent);
        }

        .workspace-brand strong {
          display: block;
          font-size: 20px;
          line-height: 1.15;
          letter-spacing: -0.03em;
          color: var(--shell-ink, #0f172a);
        }

        .workspace-brand p {
          margin: 8px 0 0;
          color: var(--shell-muted, #475569);
          line-height: 1.45;
          font-size: 13px;
        }

        .workspace-nav {
          display: grid;
          gap: 8px;
        }

        .workspace-nav a {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid var(--shell-border, rgba(148, 163, 184, 0.16));
          background: var(--shell-surface-strong, rgba(248, 250, 252, 0.96));
          text-decoration: none;
          font-weight: 500;
          color: var(--shell-ink, rgba(226, 232, 240, 0.95));
          transition:
            transform 0.18s ease,
            border-color 0.18s ease,
            background 0.18s ease;
        }

        .workspace-nav a:hover {
          transform: translateY(-1px);
          border-color: var(--shell-accent-soft, rgba(96, 165, 250, 0.5));
          background: #fff;
        }

        .workspace-nav a[data-active='true'] {
          border-color: var(--shell-accent, rgba(96, 165, 250, 0.56));
          background: var(--shell-active, rgba(37, 99, 235, 0.08));
        }

        .workspace-nav-indicator {
          font-size: 11px;
          font-weight: 600;
          color: var(--shell-muted, rgba(148, 163, 184, 0.84));
        }

        .workspace-sidebar-footer {
          margin-top: auto;
          padding-top: 16px;
          display: grid;
          gap: 8px;
        }

        .workspace-sidebar-footer p {
          margin: 0;
          color: var(--shell-muted, #64748b);
          font-size: 13px;
          line-height: 1.45;
        }

        .workspace-main {
          min-width: 0;
          padding: 24px;
        }

        .workspace-current {
          display: inline-flex;
          align-items: center;
          margin-bottom: 18px;
          padding: 6px 10px;
          border-radius: 6px;
          background: var(--shell-surface-strong, rgba(15, 23, 42, 0.72));
          border: 1px solid var(--shell-border, rgba(148, 163, 184, 0.16));
          color: var(--shell-muted, #475569);
          font-size: 12px;
          font-weight: 500;
        }

        .workspace-download,
        .workspace-menu-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 32px;
          padding: 6px 12px;
          border-radius: 6px;
          border: 1px solid var(--shell-border, rgba(148, 163, 184, 0.16));
          text-decoration: none;
          font-weight: 500;
          color: var(--shell-ink, #0f172a);
        }

        .workspace-menu-button {
          display: none;
          background: var(--shell-surface-strong, rgba(248, 250, 252, 0.96));
        }

        .workspace-download {
          width: fit-content;
        }

        .workspace-download-mobile {
          display: none;
        }

        .workspace-download-desktop {
          display: inline-flex;
        }

        .workspace-backdrop {
          display: none;
        }

        @media (max-width: 1024px) {
          .workspace-shell {
            grid-template-columns: 1fr;
          }

          .workspace-topbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 14px 16px;
            border-bottom: 1px solid var(--shell-border, rgba(148, 163, 184, 0.16));
            background: rgba(248, 250, 252, 0.92);
            position: sticky;
            top: 0;
            z-index: 20;
            backdrop-filter: blur(14px);
          }

          .workspace-topbar-copy {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            min-width: 0;
          }

          .workspace-topbar-copy h1 {
            margin: 0;
            font-size: 16px;
            line-height: 1.2;
            letter-spacing: -0.03em;
          }

          .workspace-topbar-copy p {
            margin: 3px 0 0;
            color: var(--shell-muted, #64748b);
            font-size: 13px;
            line-height: 1.4;
          }

          .workspace-menu-button {
            display: inline-flex;
            flex: 0 0 auto;
          }

          .workspace-download-mobile {
            display: inline-flex;
          }

          .workspace-sidebar {
            position: fixed;
            inset: 0 auto 0 0;
            width: min(84vw, 320px);
            min-height: 100vh;
            transform: translateX(-102%);
            transition: transform 0.22s ease;
            z-index: 30;
            box-shadow: 0 20px 50px var(--shell-shadow, rgba(2, 6, 23, 0.18));
          }

          .workspace-sidebar.is-open {
            transform: translateX(0);
          }

          .workspace-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            border: 0;
            padding: 0;
            background: rgba(15, 23, 42, 0.16);
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.22s ease;
            z-index: 25;
          }

          .workspace-backdrop.is-visible {
            opacity: 1;
            pointer-events: auto;
          }

          .workspace-main {
            padding: 16px;
          }

          .workspace-current {
            margin-bottom: 18px;
          }

          .workspace-download-desktop {
            display: none;
          }
        }

        @media (max-width: 640px) {
          .workspace-topbar-copy h1 {
            font-size: 16px;
          }

          .workspace-topbar-copy p {
            display: none;
          }

          .workspace-nav a {
            padding: 11px 12px;
          }
        }
      `}</style>
    </div>
  );
}
