import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Lock, ShieldAlert, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface MatchOption {
  matchId: string;
  partnerId: string;
  displayName: string;
}

export const SafetyCenterPage: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => {
  const { user, apiFetch } = useAuth();
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [reportedUserId, setReportedUserId] = useState('');
  const [category, setCategory] = useState('Harassment');
  const [description, setDescription] = useState('');
  const [disclosedExcerpt, setDisclosedExcerpt] = useState('');
  const [consentToShareExcerpt, setConsentToShareExcerpt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/discovery/matches')
      .then((res) => (res.ok ? res.json() : { matches: [] }))
      .then((data) => {
        const list = (data.matches || []) as MatchOption[];
        setMatches(list);
        if (list.length > 0 && !reportedUserId) {
          setReportedUserId(list[0].partnerId);
        }
      })
      .catch(() => {});
  }, [user, apiFetch, reportedUserId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setConfirmation('');
    if (!reportedUserId.trim()) {
      setError('Please select a match or enter the reported account ID.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/safety/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportedUserId: reportedUserId.trim(),
          category,
          description,
          disclosedExcerpt: consentToShareExcerpt ? disclosedExcerpt : '',
          consentToShareExcerpt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not submit report.');
        return;
      }
      setConfirmation(data.message || 'Safety report submitted.');
      setDescription('');
      setDisclosedExcerpt('');
      setConsentToShareExcerpt(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-0 py-6 space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#7C5CFC]">Trust &amp; Safety Center</p>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold">
          Protecting adult members while respecting private messaging
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
          BondAI enforces strict 18+ age verification at signup, instant unmatch &amp; block controls, and zero-access encrypted chat. Moderators only review evidence you explicitly choose to disclose.
        </p>
      </div>

      {/* Safety pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-5 space-y-2">
          <UserCheck className="w-5 h-5 text-[#7C5CFC]" />
          <h2 className="font-display text-base font-semibold">Strict 18+ Adult Gate</h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Every registration enforces a minimum age of 18 server-side before creating an account. Report any suspected underage account immediately for priority suspension.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-5 space-y-2">
          <Lock className="w-5 h-5 text-emerald-600" />
          <h2 className="font-display text-base font-semibold">E2EE Report Boundary</h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Because private chat is encrypted on-device with Signal Protocol, staff cannot browse chat history. Only excerpts you paste and consent to share are sent with a report.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-5 space-y-2">
          <AlertTriangle className="w-5 h-5 text-[#E85D93]" />
          <h2 className="font-display text-base font-semibold">Anti-Scam &amp; Safe Meeting</h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Never send money, crypto, or verification codes to someone you meet online. Use Blind Connect until trust is earned, verify Safety Numbers, and meet first in public spaces.
          </p>
        </div>
      </div>

      {/* Report User Form */}
      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-rose-600" />
          <h2 className="font-display text-lg font-semibold">Submit a Confidential Safety Report</h2>
        </div>

        {!user ? (
          <div className="rounded-2xl bg-[#FAF8FC] dark:bg-[#1E192C] p-5 space-y-3 text-sm">
            <p className="text-slate-600 dark:text-slate-300">
              Sign in to report a specific member or match directly, or contact our Trust &amp; Safety team through Support for account appeals or urgent concerns.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="px-4 py-2 rounded-xl bg-[#7C5CFC] text-white text-xs font-semibold min-h-[40px]"
              >
                Sign In to Report
              </button>
              <button
                type="button"
                onClick={() => navigate('/support')}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold min-h-[40px]"
              >
                Open Support Inquiry
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {matches.length > 0 && (
              <div>
                <label className="block text-xs font-semibold mb-1">Select a Recent Match (optional)</label>
                <select
                  value={matches.some((m) => m.partnerId === reportedUserId) ? reportedUserId : ''}
                  onChange={(e) => setReportedUserId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2 text-sm"
                >
                  <option value="">Enter Member ID manually below...</option>
                  {matches.map((m) => (
                    <option key={m.matchId} value={m.partnerId}>
                      {m.displayName} ({m.partnerId})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Reported Member ID</label>
                <input
                  type="text"
                  required
                  value={reportedUserId}
                  onChange={(e) => setReportedUserId(e.target.value)}
                  placeholder="usr_..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2 text-sm"
                >
                  <option value="Harassment">Harassment</option>
                  <option value="Spam or Scam">Spam or Scam</option>
                  <option value="Impersonation">Impersonation</option>
                  <option value="Underage Concern">Underage Concern</option>
                  <option value="Inappropriate Content">Inappropriate Content</option>
                  <option value="Other Safety Concern">Other Safety Concern</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">What happened? (10–1200 characters)</label>
              <textarea
                required
                minLength={10}
                maxLength={1200}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the behavior or profile concern clearly..."
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2 text-sm"
              />
            </div>

            <div className="rounded-2xl bg-[#FAF8FC] dark:bg-[#1E192C] p-4 space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={consentToShareExcerpt}
                  onChange={(e) => setConsentToShareExcerpt(e.target.checked)}
                  className="mt-0.5 accent-[#7C5CFC]"
                />
                <span className="text-slate-700 dark:text-slate-300">
                  I explicitly consent to include the decrypted message excerpt below for human safety moderation.
                </span>
              </label>

              {consentToShareExcerpt && (
                <textarea
                  maxLength={1500}
                  rows={3}
                  value={disclosedExcerpt}
                  onChange={(e) => setDisclosedExcerpt(e.target.value)}
                  placeholder="Optional: Paste specific abusive or scam messages you wish moderators to review..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161220] px-3 py-2 text-xs"
                />
              )}
            </div>

            {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
            {confirmation && (
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{confirmation}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold min-h-[44px]"
              >
                {submitting ? 'Submitting Report...' : 'Submit Safety Report'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/privacy')}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold min-h-[44px]"
              >
                Manage Blocked Users
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Appeals & Moderation Transparency */}
      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#7C5CFC]" />
          <h2 className="font-display text-base font-semibold">Suspension Appeals &amp; Human Review</h2>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          If an account is suspended following a Community Guidelines report, the member may request a human review via the Support center within 30 days. Automated scoring never triggers permanent bans without moderator confirmation.
        </p>
      </section>
    </div>
  );
};
