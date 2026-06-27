import { fetchStoreApi, isStoreApiConfigured } from '../../lib/api';
import {
  emptyStateStyle,
  metricLabelStyle,
  metricNoteStyle,
  metricValueStyle,
  pageLeadStyle,
  pageShellStyle,
  pageTitleStyle,
  sectionIntroStyle,
  sectionLabelStyle,
  pillStyle,
  tokenMutedStyle,
  surfaceCardStyle,
} from '../motocore-theme';

type SessionProfile = {
  user?: {
    id?: string;
    email?: string | null;
    phone?: string | null;
    preferredLocale?: string | null;
    status?: string;
  };
  contexts?: Array<{
    type: string;
    storeId?: string | null;
    storeName?: string | null;
    roles?: string[];
    permissions?: string[];
  }>;
  permissions?: string[];
  session?: {
    expiresAt?: string | null;
  };
};

export default async function StoreSessionPage() {
  const profile = await fetchStoreApi<SessionProfile>('/auth/me');
  const configured = isStoreApiConfigured();

  return (
    <main style={{ ...pageShellStyle, display: 'grid', gap: 24 }}>
      <section style={sectionIntroStyle}>
        <span style={sectionLabelStyle}>
          Session status
        </span>
        <h2 style={pageTitleStyle}>See exactly which identity and permissions are active.</h2>
        <p style={pageLeadStyle}>
          This closes the last UX gap by making the auth/session state visible to the operator instead of hidden.
        </p>
        <p style={tokenMutedStyle}>
          {configured
            ? 'The session endpoint is reachable.'
            : 'Set `API_BASE_URL`, `STORE_DEMO_BEARER_TOKEN`, and `STORE_DEMO_STORE_ID` to inspect a live session.'}
        </p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <div style={metricLabelStyle}>Status</div>
          <div style={metricValueStyle}>{profile?.user?.status ?? '—'}</div>
          <p style={metricNoteStyle}>Identity status from the auth service.</p>
        </article>
        <article style={surfaceCardStyle}>
          <div style={metricLabelStyle}>Contexts</div>
          <div style={metricValueStyle}>{profile?.contexts?.length ?? 0}</div>
          <p style={metricNoteStyle}>Available operating contexts for this account.</p>
        </article>
        <article style={surfaceCardStyle}>
          <div style={metricLabelStyle}>Permissions</div>
          <div style={metricValueStyle}>{profile?.permissions?.length ?? 0}</div>
          <p style={metricNoteStyle}>Granted permissions expanded from roles.</p>
        </article>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Identity</h3>
          {profile?.user ? (
            <div style={{ display: 'grid', gap: 8, lineHeight: 1.6 }}>
              <div>User ID: {profile.user.id ?? '—'}</div>
              <div>Email: {profile.user.email || '—'}</div>
              <div>Phone: {profile.user.phone || '—'}</div>
              <div>Locale: {profile.user.preferredLocale || '—'}</div>
              <div>Session expiry: {profile.session?.expiresAt ? new Date(profile.session.expiresAt).toLocaleString() : '—'}</div>
            </div>
          ) : (
            <div style={emptyStateStyle}>No live session profile is available yet.</div>
          )}
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Contexts and roles</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {profile?.contexts?.length ? (
              profile.contexts.map((context, index) => (
                <article key={`${context.type}-${context.storeId || index}`} style={{ ...surfaceCardStyle, padding: 12 }}>
                  <div style={{ fontWeight: 600 }}>{context.type}</div>
                  <div style={{ color: '#475569' }}>{context.storeName || context.storeId || 'No store selected'}</div>
                  <div style={{ color: '#64748b' }}>{context.roles?.join(', ') || 'No roles'}</div>
                </article>
              ))
            ) : (
              <div style={emptyStateStyle}>No contexts are available for this session.</div>
            )}
          </div>
        </article>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Permissions</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {profile?.permissions?.length ? (
              profile.permissions.map((permission) => (
                <span key={permission} style={pillStyle}>
                  {permission}
                </span>
              ))
            ) : (
              <div style={emptyStateStyle}>No permissions were returned by the backend.</div>
            )}
          </div>
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>What this tells us</h3>
          <p style={tokenMutedStyle}>
            The session view makes auth state visible, which helps operators debug context issues, expired tokens, and
            permission mismatches without leaving the workspace.
          </p>
        </article>
      </section>
    </main>
  );
}
