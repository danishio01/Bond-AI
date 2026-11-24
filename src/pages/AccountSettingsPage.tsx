import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Laptop, Lock, LogOut, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SessionItem {
  id: string;
  deviceInfo: string;
  ipMasked: string;
  isCurrent: boolean;
  createdAt: number;
  lastUsedAt: number;
}

interface E2eeDeviceItem {
  id: string;
  deviceId: number;
  deviceLabel: string;
  identityKeyB64: string;
  remainingPreKeys: number;
  revoked: boolean;
}

export const AccountSettingsPage: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => {
  const { user, e2eeDeviceId, apiFetch, refreshMe, logout } = useAuth();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [devices, setDevices] = useState<E2eeDeviceItem[]>([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  const [totpQr, setTotpQr] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [disablePw, setDisablePw] = useState('');
  const [mfaMsg, setMfaMsg] = useState('');

  const loadSecurityLists = useCallback(async () => {
    const [sRes, dRes] = await Promise.all([
      apiFetch('/api/auth/sessions'),
      apiFetch('/api/e2ee/devices'),
    ]);
    if (sRes.ok) {
      const sd = await sRes.json();
      setSessions(sd.sessions || []);
    }
    if (dRes.ok) {
      const dd = await dRes.json();
      setDevices(dd.devices || []);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadSecurityLists();
  }, [loadSecurityLists]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg('');
    const res = await apiFetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const d = await res.json();
    setPwMsg(d.message || d.error || '');
    if (res.ok) {
      setCurrentPassword('');
      setNewPassword('');
    }
  };

  const start2faSetup = async () => {
    setMfaMsg('');
    const res = await apiFetch('/api/auth/2fa/setup', { method: 'POST' });
    const d = await res.json();
    if (res.ok) {
      setTotpQr(d.qrDataUrl);
      setTotpSecret(d.secret);
    }
  };

  const verify2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/auth/2fa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: totpCode }),
    });
    const d = await res.json();
    if (res.ok) {
      setTotpQr('');
      setTotpCode('');
      setMfaMsg('Two-factor authentication is now enabled.');
      await refreshMe();
    } else {
      setMfaMsg(d.error || 'Verification failed');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold">Account &amp; Security Settings</h1>
        <p className="text-xs text-slate-500 mt-1">
          Signed in as {user?.email} · Account status: {user?.status}
        </p>
      </div>

      {/* Two-Factor Authentication */}
      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#7C5CFC]" />
              Authenticator Two-Factor Authentication (TOTP)
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Status: {user?.totpEnabled ? 'Enabled' : 'Not enabled'}
            </p>
          </div>
          {!user?.totpEnabled && !totpQr && (
            <button
              type="button"
              onClick={start2faSetup}
              className="px-4 py-2 rounded-xl bg-[#7C5CFC] text-white text-xs font-semibold"
            >
              Enable 2FA
            </button>
          )}
        </div>

        {totpQr && (
          <form onSubmit={verify2fa} className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-5 items-center">
            <img src={totpQr} alt="Scan TOTP QR code" className="w-40 h-40 rounded-xl border border-slate-200 bg-white p-2" />
            <div className="space-y-3 flex-1">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Scan with Google Authenticator, Authy, or 1Password, or enter secret:{' '}
                <span className="font-mono font-semibold select-all">{totpSecret}</span>
              </p>
              <div className="flex gap-2">
                <input
                  required
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="6-digit code"
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm font-mono w-36"
                />
                <button type="submit" className="px-4 py-2 rounded-xl bg-[#7C5CFC] text-white text-xs font-semibold">
                  Verify &amp; Activate
                </button>
              </div>
            </div>
          </form>
        )}

        {user?.totpEnabled && user.role !== 'admin' && (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <input
              type="password"
              value={disablePw}
              onChange={(e) => setDisablePw(e.target.value)}
              placeholder="Confirm password to disable 2FA"
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-xs"
            />
            <button
              type="button"
              onClick={async () => {
                const res = await apiFetch('/api/auth/2fa/disable', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ password: disablePw }),
                });
                const d = await res.json();
                setMfaMsg(d.message || d.error || '');
                if (res.ok) await refreshMe();
              }}
              className="px-3.5 py-2 rounded-xl border border-rose-300 text-rose-600 text-xs font-semibold"
            >
              Disable 2FA
            </button>
          </div>
        )}
        {mfaMsg && <p className="text-xs text-[#7C5CFC] font-semibold">{mfaMsg}</p>}
      </section>

      {/* Change Password */}
      <form
        onSubmit={handlePasswordChange}
        className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-4"
      >
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-[#7C5CFC]" />
          Change Password
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Current password"
            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3.5 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={10}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New strong password (10+ chars)"
            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3.5 py-2 text-sm"
          />
        </div>
        {pwMsg && <p className="text-xs text-emerald-600">{pwMsg}</p>}
        <button type="submit" className="px-4 py-2 rounded-xl bg-[#7C5CFC] text-white text-xs font-semibold">
          Update Password
        </button>
      </form>

      {/* Active Sessions */}
      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Laptop className="w-5 h-5 text-[#7C5CFC]" />
            Active Sessions ({sessions.length})
          </h2>
          <button
            type="button"
            onClick={async () => {
              await apiFetch('/api/auth/logout-all', { method: 'POST' });
              await logout();
              navigate('/');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-300 text-rose-600 text-xs font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out All Devices
          </button>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {sessions.map((s) => (
            <div key={s.id} className="py-3 flex items-center justify-between gap-4 text-xs">
              <div>
                <p className="font-semibold">
                  {s.deviceInfo} {s.isCurrent ? '· Current Session' : ''}
                </p>
                <p className="text-slate-500">
                  IP: {s.ipMasked} · Last active {new Date(s.lastUsedAt).toLocaleString()}
                </p>
              </div>
              {!s.isCurrent && (
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/auth/sessions/${s.id}`, { method: 'DELETE' });
                    loadSecurityLists();
                  }}
                  className="text-rose-600 hover:underline font-semibold"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* E2EE Device Keys & Recovery Explanation */}
      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-3">
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <Lock className="w-5 h-5 text-emerald-600" />
          Signal Protocol E2EE Devices
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          Recovery limitation: Private identity and ratchet keys are stored exclusively in this browser&apos;s IndexedDB. If you clear browser storage or lose access to all registered devices, prior encrypted message history cannot be recovered by BondAI.
        </p>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {devices.map((d) => (
            <div key={d.id} className="py-2.5 flex items-center justify-between text-xs">
              <div>
                <p className="font-semibold">
                  Device #{d.deviceId} {d.deviceId === e2eeDeviceId ? '(This Browser)' : ''}{' '}
                  {d.revoked ? '· Revoked' : ''}
                </p>
                <p className="font-mono text-[11px] text-slate-500">
                  Identity key: {d.identityKeyB64.slice(0, 18)}... · {d.remainingPreKeys} one-time prekeys left
                </p>
              </div>
              {!d.revoked && (
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/e2ee/devices/${d.deviceId}`, { method: 'DELETE' });
                    loadSecurityLists();
                  }}
                  className="inline-flex items-center gap-1 text-rose-600 font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
