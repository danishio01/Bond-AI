import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Lock, RefreshCw, ShieldAlert, ShieldCheck, Sliders } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  totalMatches: number;
  blindMatches: number;
  pendingReports: number;
  failedLogins24h: number;
  dailySwipeLimit: number;
  uptimeSeconds: number;
  e2eeBoundary: string;
}

interface ModerationReport {
  id: string;
  reporterId: string;
  reporterName: string;
  reportedUserId: string;
  reportedName: string;
  targetStatus: string;
  category: string;
  description: string;
  disclosedExcerpt: string;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  moderatorNotes: string;
  createdAt: number;
}

interface AuditLogEntry {
  id: string;
  actorId: string;
  action: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export const AdminDashboardPage: React.FC = () => {
  const { user, apiFetch, refreshMe, setAccessTokenInMemory } = useAuth();

  const [bootstrap, setBootstrap] = useState<{ hasAdminUser: boolean; envPasscodeConfigured: boolean } | null>(
    null
  );
  const [passcode, setPasscode] = useState('');
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [swipeLimitInput, setSwipeLimitInput] = useState('50');
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [loadingAdminData, setLoadingAdminData] = useState(false);

  const loadBootstrap = useCallback(async () => {
    const res = await apiFetch('/api/admin/bootstrap-status');
    if (res.ok) {
      setBootstrap(await res.json());
    }
  }, [apiFetch]);

  const loadAdminConsole = useCallback(async () => {
    setLoadingAdminData(true);
    try {
      const [overviewRes, reportsRes, logsRes] = await Promise.all([
        apiFetch('/api/admin/overview'),
        apiFetch('/api/admin/reports'),
        apiFetch('/api/admin/audit-logs'),
      ]);

      if (overviewRes.ok) {
        const d = await overviewRes.json();
        setStats(d.stats);
        setSwipeLimitInput(String(d.stats?.dailySwipeLimit || 50));
      }
      if (reportsRes.ok) {
        const d = await reportsRes.json();
        setReports(d.reports || []);
      }
      if (logsRes.ok) {
        const d = await logsRes.json();
        setLogs(d.logs || []);
      }
    } finally {
      setLoadingAdminData(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (user && (user.role === 'admin' || user.role === 'moderator') && user.mfaVerified) {
      loadAdminConsole();
    }
  }, [user, loadAdminConsole]);

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    const res = await apiFetch('/api/admin/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAuthError(data.error || 'Could not claim admin role');
      return;
    }
    if (data.accessToken) {
      setAccessTokenInMemory(data.accessToken);
    }
    if (data.totpSetup) {
      setTotpSetup(data.totpSetup);
    }
    setAuthSuccess('Admin role granted. Complete 6-digit TOTP MFA verification below to unlock console access.');
    await refreshMe();
    await loadBootstrap();
  };

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    const res = await apiFetch('/api/admin/verify-mfa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: mfaCode }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAuthError(data.error || 'Invalid authenticator code');
      return;
    }
    if (data.accessToken) {
      setAccessTokenInMemory(data.accessToken);
    }
    setMfaCode('');
    setTotpSetup(null);
    setAuthSuccess('MFA verified for this session.');
    await refreshMe();
    await loadAdminConsole();
  };

  const handleModerationAction = async (
    reportId: string,
    status: ModerationReport['status'],
    suspendTarget = false
  ) => {
    const res = await apiFetch(`/api/admin/reports/${reportId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        moderatorNotes: noteById[reportId] || '',
        suspendTarget,
      }),
    });
    if (res.ok) {
      await loadAdminConsole();
    }
  };

  const handleUnsuspend = async (userId: string) => {
    const res = await apiFetch(`/api/admin/users/${userId}/unsuspend`, { method: 'POST' });
    if (res.ok) {
      await loadAdminConsole();
    }
  };

  const handleSaveLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    const limit = Number(swipeLimitInput);
    if (!Number.isFinite(limit)) return;
    const res = await apiFetch('/api/admin/config/limits', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dailySwipeLimit: limit }),
    });
    if (res.ok) {
      await loadAdminConsole();
    }
  };

  const isPrivileged = user?.role === 'admin' || user?.role === 'moderator';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#7C5CFC]">Platform Operations &amp; Moderation</p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold">Admin Governance Console</h1>
        </div>
        {isPrivileged && user?.mfaVerified && (
          <button
            type="button"
            onClick={loadAdminConsole}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold min-h-[40px]"
          >
            <RefreshCw className={`w-4 h-4 ${loadingAdminData ? 'animate-spin' : ''}`} />
            Refresh Telemetry
          </button>
        )}
      </div>

      {/* Zero-Access E2EE Boundary Banner */}
      <div className="rounded-3xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 p-5 flex items-start gap-3">
        <Lock className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-semibold text-emerald-900 dark:text-emerald-200">
            Cryptographic Privacy Boundary Active
          </p>
          <p className="text-emerald-800 dark:text-emerald-300 leading-relaxed">
            {stats?.e2eeBoundary ||
              'Administrators cannot access or decrypt private conversations. Moderation displays only aggregate metrics, safety report descriptions, and excerpts explicitly disclosed by the reporter.'}
          </p>
        </div>
      </div>

      {/* Step 1 or 2: Claim Admin / Verify TOTP MFA */}
      {(!isPrivileged || !user?.mfaVerified) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {!isPrivileged && (
            <form
              onSubmit={handleClaimAdmin}
              className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-4"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#7C5CFC]" />
                <h2 className="font-display text-lg font-semibold">
                  {bootstrap?.envPasscodeConfigured
                    ? 'Unlock Administrator Role'
                    : bootstrap?.hasAdminUser
                    ? 'Authenticate Existing Admin Passcode'
                    : 'First-Run Interactive Admin Claim'}
                </h2>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {bootstrap?.envPasscodeConfigured
                  ? 'Enter the server ADMIN_PASSCODE configured in your environment to elevate this verified account and enroll TOTP MFA.'
                  : bootstrap?.hasAdminUser
                  ? 'An administrator has already been claimed. Enter the claimed admin passcode (8+ chars) to verify.'
                  : 'No administrator exists yet. Choose an 8+ character admin passcode to claim first-run admin control on this instance and set up mandatory TOTP MFA.'}
              </p>
              <div>
                <label className="block text-xs font-semibold mb-1">Admin Passcode (min 8 characters)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Enter admin passcode..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-[#7C5CFC] text-white text-xs font-semibold min-h-[44px]"
              >
                Claim &amp; Configure TOTP 2FA
              </button>
            </form>
          )}

          <form
            onSubmit={handleVerifyMfa}
            className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-[#E85D93]" />
              <h2 className="font-display text-lg font-semibold">Mandatory Admin MFA Verification</h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Every administrative session requires an active TOTP authenticator verification before moderation queues, config controls, or audit logs become accessible.
            </p>

            {totpSetup && (
              <div className="rounded-2xl bg-[#FAF8FC] dark:bg-[#1E192C] p-4 flex flex-col sm:flex-row items-center gap-4">
                <img
                  src={totpSetup.qrDataUrl}
                  alt="Admin TOTP QR Code"
                  className="w-32 h-32 rounded-xl bg-white p-1 border border-slate-200"
                />
                <div className="text-xs space-y-1.5 break-all">
                  <p className="font-semibold">Scan with Google Authenticator, 1Password, or Authy</p>
                  <p className="text-slate-500">Manual Secret Key:</p>
                  <code className="block px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#161220] border border-slate-200 dark:border-slate-700 font-mono text-[11px]">
                    {totpSetup.secret}
                  </code>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold mb-1">6-Digit Authenticator Code</label>
              <input
                type="text"
                inputMode="numeric"
                required
                minLength={6}
                maxLength={8}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="123456"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2 text-sm font-mono tracking-widest"
              />
            </div>

            <button
              type="submit"
              disabled={!isPrivileged}
              className="px-5 py-2.5 rounded-xl bg-[#E85D93] disabled:opacity-50 text-white text-xs font-semibold min-h-[44px]"
            >
              Verify MFA &amp; Open Console
            </button>
          </form>
        </div>
      )}

      {authError && <p className="text-xs font-semibold text-rose-600">{authError}</p>}
      {authSuccess && <p className="text-xs font-semibold text-emerald-600">{authSuccess}</p>}

      {/* Authenticated + MFA Verified Admin Console */}
      {isPrivileged && user?.mfaVerified && stats && (
        <>
          {/* KPI Grid */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Accounts', value: stats.totalUsers },
              { label: 'Active Adults', value: stats.activeUsers },
              { label: 'Active Matches', value: stats.totalMatches },
              { label: 'Blind Connects', value: stats.blindMatches },
              { label: 'Pending Reports', value: stats.pendingReports },
              { label: 'Suspended Users', value: stats.suspendedUsers },
              { label: 'Failed Logins (24h)', value: stats.failedLogins24h },
              { label: 'Server Uptime', value: `${Math.floor(stats.uptimeSeconds / 60)}m` },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-4"
              >
                <p className="text-xs text-slate-500">{kpi.label}</p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums">{kpi.value}</p>
              </div>
            ))}
          </section>

          {/* Operational Limits */}
          <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6">
            <form onSubmit={handleSaveLimit} className="flex flex-wrap items-end gap-4">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold mb-1">
                  <Sliders className="w-4 h-4 text-[#7C5CFC]" />
                  Daily Discovery Swipe Limit (5–500)
                </label>
                <input
                  type="number"
                  min={5}
                  max={500}
                  value={swipeLimitInput}
                  onChange={(e) => setSwipeLimitInput(e.target.value)}
                  className="w-40 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2 text-sm tabular-nums"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#7C5CFC] text-white text-xs font-semibold min-h-[40px]"
              >
                Update Limit
              </button>
            </form>
          </section>

          {/* Moderation Queue */}
          <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-600" />
              <h2 className="font-display text-lg font-semibold">Moderation Queue ({reports.length})</h2>
            </div>

            {reports.length === 0 ? (
              <p className="text-xs text-slate-500">No safety reports filed yet.</p>
            ) : (
              <div className="space-y-4">
                {reports.map((rep) => (
                  <div
                    key={rep.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#FAF8FC] dark:bg-[#1E192C] p-4 space-y-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold">
                        {rep.category} · Target: {rep.reportedName} ({rep.targetStatus}) · Reported by {rep.reporterName}
                      </div>
                      <span className="font-mono text-[11px] uppercase tracking-wide text-[#7C5CFC]">
                        {rep.status}
                      </span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-200">{rep.description}</p>
                    {rep.disclosedExcerpt && (
                      <div className="rounded-xl bg-white dark:bg-[#161220] border border-slate-200 dark:border-slate-700 p-3">
                        <p className="text-[11px] font-semibold text-slate-500 mb-1">
                          User-Consented Message Excerpt
                        </p>
                        <p className="font-mono text-[11px]">{rep.disclosedExcerpt}</p>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={noteById[rep.id] ?? rep.moderatorNotes}
                        onChange={(e) => setNoteById((prev) => ({ ...prev, [rep.id]: e.target.value }))}
                        placeholder="Moderator resolution note..."
                        className="flex-1 min-w-[200px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161220] px-3 py-1.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleModerationAction(rep.id, 'reviewing')}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold"
                      >
                        Mark Reviewing
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModerationAction(rep.id, 'dismissed')}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold"
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModerationAction(rep.id, 'resolved', true)}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold"
                      >
                        Resolve &amp; Suspend User
                      </button>
                      {rep.targetStatus === 'suspended' && (
                        <button
                          type="button"
                          onClick={() => handleUnsuspend(rep.reportedUserId)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold"
                        >
                          Unsuspend User
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Security Audit Logs (No PII) */}
          <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-3">
            <h2 className="font-display text-lg font-semibold">Security Audit Trail (Zero-PII)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Timestamp</th>
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 pr-4">Actor ID</th>
                    <th className="py-2 pr-4">Target ID</th>
                    <th className="py-2">Metadata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {logs.slice(0, 40).map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 pr-4 font-mono text-[11px] whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 font-semibold whitespace-nowrap">{log.action}</td>
                      <td className="py-2 pr-4 font-mono text-[11px]">{log.actorId}</td>
                      <td className="py-2 pr-4 font-mono text-[11px]">{log.targetId}</td>
                      <td className="py-2 font-mono text-[11px] text-slate-500">
                        {JSON.stringify(log.metadata)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
