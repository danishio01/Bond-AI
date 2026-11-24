import React, { useCallback, useEffect, useState } from 'react';
import { Download, Lock, ShieldCheck, Trash2, UserX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const PrivacyDashboardPage: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => {
  const { consent, apiFetch, refreshMe, logout } = useAuth();
  const [profileVisibility, setProfileVisibility] = useState<'everyone' | 'matches_only' | 'hidden'>(
    consent?.profileVisibility || 'everyone'
  );
  const [photoVisibility, setPhotoVisibility] = useState<'everyone' | 'matches_only' | 'blind_only'>(
    consent?.photoVisibility || 'everyone'
  );
  const [showOnlineStatus, setShowOnlineStatus] = useState(consent?.showOnlineStatus ?? false);
  const [readReceipts, setReadReceipts] = useState(consent?.readReceipts ?? false);
  const [shareApproxLocation, setShareApproxLocation] = useState(consent?.shareApproxLocation ?? true);
  const [aiProcessingConsent, setAiProcessingConsent] = useState(consent?.aiProcessingConsent ?? false);
  const [discoveryPaused, setDiscoveryPaused] = useState(consent?.discoveryPaused ?? false);
  const [blockedUsers, setBlockedUsers] = useState<Array<{ userId: string; displayName: string }>>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadBlocks = useCallback(async () => {
    const res = await apiFetch('/api/safety/blocks');
    if (res.ok) {
      const d = await res.json();
      setBlockedUsers(d.blockedUsers || []);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  const savePrivacy = async () => {
    setStatusMsg('');
    const res = await apiFetch('/api/safety/privacy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileVisibility,
        photoVisibility,
        showOnlineStatus,
        readReceipts,
        shareApproxLocation,
        aiProcessingConsent,
        discoveryPaused,
      }),
    });
    if (res.ok) {
      await refreshMe();
      setStatusMsg('Privacy preferences saved.');
    }
  };

  const handleExport = async () => {
    const res = await apiFetch('/api/safety/export');
    if (res.ok) {
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bondai-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#7C5CFC]">Privacy Control Center</p>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold">
          Control your visibility, consent &amp; personal data
        </h1>
      </div>

      {/* Visibility & AI Consent */}
      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Profile Visibility</label>
            <select
              value={profileVisibility}
              onChange={(e) => setProfileVisibility(e.target.value as typeof profileVisibility)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2 text-sm"
            >
              <option value="everyone">Compatible adults in Discover</option>
              <option value="matches_only">Matches only</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Photo Visibility</label>
            <select
              value={photoVisibility}
              onChange={(e) => setPhotoVisibility(e.target.value as typeof photoVisibility)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2 text-sm"
            >
              <option value="everyone">Standard discovery</option>
              <option value="matches_only">Matches only</option>
              <option value="blind_only">Blind Connect mutual reveal only</option>
            </select>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          {[
            { label: 'Pause Discovery (hide from new recommendations)', checked: discoveryPaused, set: setDiscoveryPaused },
            { label: 'Share approximate city/region', checked: shareApproxLocation, set: setShareApproxLocation },
            { label: 'Show online status to mutual matches', checked: showOnlineStatus, set: setShowOnlineStatus },
            { label: 'Send read receipts in encrypted chat', checked: readReceipts, set: setReadReceipts },
            {
              label: 'Allow Gemini AI processing for compatibility summaries, icebreakers & date ideas (withdraw anytime)',
              checked: aiProcessingConsent,
              set: setAiProcessingConsent,
            },
          ].map((item) => (
            <label key={item.label} className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(e) => item.set(e.target.checked)}
                className="mt-1 accent-[#7C5CFC]"
              />
              <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">{item.label}</span>
            </label>
          ))}
        </div>

        {statusMsg && <p className="text-xs text-emerald-600 font-semibold">{statusMsg}</p>}

        <button
          type="button"
          onClick={savePrivacy}
          className="px-5 py-2.5 rounded-xl bg-[#7C5CFC] text-white text-xs font-semibold"
        >
          Save Privacy Controls
        </button>
      </section>

      {/* Honest Data Boundary Disclosure */}
      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-3">
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <Lock className="w-5 h-5 text-[#7C5CFC]" />
          Honest Data Architecture Disclosure
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="rounded-2xl bg-[#FAF8FC] dark:bg-[#1E192C] p-4">
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">End-to-End Encrypted</p>
            <p className="mt-1 text-slate-600 dark:text-slate-300 leading-relaxed">
              Private match messages, voice notes, and chat image attachments are encrypted on-device with Signal Protocol. BondAI servers and administrators cannot read them.
            </p>
          </div>
          <div className="rounded-2xl bg-[#FAF8FC] dark:bg-[#1E192C] p-4">
            <p className="font-semibold text-[#7C5CFC]">Encrypted at Rest (Server-Processed)</p>
            <p className="mt-1 text-slate-600 dark:text-slate-300 leading-relaxed">
              Email, legal name, and date of birth use AES-256-GCM field-level encryption. Discovery profiles, preferences, and quiz vectors are processed server-side for matching.
            </p>
          </div>
          <div className="rounded-2xl bg-[#FAF8FC] dark:bg-[#1E192C] p-4">
            <p className="font-semibold text-[#E85D93]">Visible to Matches / Moderators</p>
            <p className="mt-1 text-slate-600 dark:text-slate-300 leading-relaxed">
              Matches see only profile fields allowed by your visibility and Blind Connect settings. Moderators see only safety reports and excerpts you explicitly disclose.
            </p>
          </div>
        </div>
      </section>

      {/* Blocked Users */}
      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-3">
        <h2 className="font-display text-lg font-semibold">Blocked Users ({blockedUsers.length})</h2>
        {blockedUsers.length === 0 ? (
          <p className="text-xs text-slate-500">No blocked accounts.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {blockedUsers.map((b) => (
              <div key={b.userId} className="py-2.5 flex items-center justify-between text-xs">
                <span className="font-semibold">{b.displayName}</span>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/safety/block/${b.userId}`, { method: 'DELETE' });
                    loadBlocks();
                  }}
                  className="text-[#7C5CFC] font-semibold hover:underline"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Export, Deactivate, Delete */}
      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#7C5CFC]" />
          Your Data Rights (Export &amp; Deletion)
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
          >
            <Download className="w-4 h-4" />
            Export My Data (JSON)
          </button>

          <button
            type="button"
            onClick={async () => {
              await apiFetch('/api/safety/account/deactivate', { method: 'POST' });
              await logout();
              navigate('/');
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-300 text-amber-700 dark:text-amber-400 text-xs font-semibold"
          >
            <UserX className="w-4 h-4" />
            Deactivate Account
          </button>

          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-semibold"
          >
            <Trash2 className="w-4 h-4" />
            Permanently Delete Account
          </button>
        </div>

        {confirmDelete && (
          <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-4 space-y-3 text-xs">
            <p className="font-semibold text-rose-800 dark:text-rose-200">
              Confirm permanent deletion: This removes your profile, photos, matches, and account records immediately.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  const res = await apiFetch('/api/safety/account', { method: 'DELETE' });
                  if (res.ok) {
                    await logout();
                    navigate('/');
                  }
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white font-semibold"
              >
                Yes, Delete Permanently
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
