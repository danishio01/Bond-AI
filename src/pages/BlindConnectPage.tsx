import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, MessageSquareLock, ShieldCheck, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { MatchSummary } from './MatchesPage';

export const BlindConnectPage: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => {
  const { profile, apiFetch, refreshMe } = useAuth();
  const [blindMatches, setBlindMatches] = useState<MatchSummary[]>([]);
  const [toggling, setToggling] = useState(false);

  const loadBlindMatches = useCallback(async () => {
    const res = await apiFetch('/api/discovery/matches');
    if (res.ok) {
      const d = await res.json();
      setBlindMatches((d.matches || []).filter((m: MatchSummary) => m.isBlindMatch));
    }
  }, [apiFetch]);

  useEffect(() => {
    loadBlindMatches();
  }, [loadBlindMatches]);

  const toggleBlindMode = async () => {
    setToggling(true);
    try {
      await apiFetch('/api/profiles/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blindConnectEnabled: !profile?.blindConnectEnabled }),
      });
      await refreshMe();
    } finally {
      setToggling(false);
    }
  };

  const respondReveal = async (matchId: string, action: 'approve' | 'decline') => {
    const res = await apiFetch(`/api/blind-connect/${matchId}/reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      await loadBlindMatches();
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-7 space-y-3">
          <p className="text-xs font-semibold text-[#7C5CFC]">Signature Mode · Blind Connect</p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white">
            Connect through mind, values &amp; conversation first.
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            In Blind Connect, profile photos and last names are withheld at the server and media storage layer. Photos only unlock when <strong>both</strong> matches explicitly approve reveal. If either declines, photos remain permanently hidden.
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={toggling}
              onClick={toggleBlindMode}
              className={`px-5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                profile?.blindConnectEnabled
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#7C5CFC] text-white'
              }`}
            >
              {profile?.blindConnectEnabled
                ? 'Blind Connect Active on Your Profile'
                : 'Enable Blind Connect Participation'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/discover')}
              className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
            >
              Browse Blind Discover Queue
            </button>
          </div>
        </div>
        <div className="lg:col-span-5 aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100">
          <img
            src="/src/assets/images/blind_connect_abstract_1795508793218.jpg"
            alt="Frosted translucent glass layers representing privacy-first blind matching"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
          Your Blind Connect Matches ({blindMatches.length})
        </h2>

        {blindMatches.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-8 text-center text-sm text-slate-600 dark:text-slate-400">
            No Blind Connect matches yet. Switch Discover to <strong>Blind Connect</strong> mode to match on personality and values first.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {blindMatches.map((m) => (
              <div
                key={m.matchId}
                className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {m.photosRevealed && m.photos[0] ? (
                      <img
                        src={m.photos[0].url}
                        alt={m.displayName}
                        className="w-14 h-14 rounded-2xl object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-[#F1EBFE] dark:bg-[#231B38] flex items-center justify-center">
                        <EyeOff className="w-6 h-6 text-[#7C5CFC]" />
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-slate-500">
                        {m.compatibilityScore}% alignment · {m.cityRegion}
                      </p>
                      <h3 className="font-display text-lg font-semibold">
                        {m.displayName}, {m.age}
                      </h3>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-[#7C5CFC]">
                    {m.photosRevealed ? 'Photos Revealed' : 'Photos Hidden'}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {m.bio}
                </p>

                <div className="rounded-2xl bg-[#FAF8FC] dark:bg-[#1E192C] p-3.5 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Your reveal consent:</span>
                    <span className="font-semibold">
                      {m.myRevealApproved ? 'Consented' : 'Not yet'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Partner reveal consent:</span>
                    <span className="font-semibold">
                      {m.partnerRevealApproved ? 'Consented' : 'Pending'}
                    </span>
                  </div>
                  {m.revealDeclinedBy && (
                    <p className="text-rose-600 font-medium">
                      Photo reveal was declined; photos remain strictly hidden.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/messages/${m.matchId}`)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#7C5CFC] text-white text-xs font-semibold"
                  >
                    <MessageSquareLock className="w-3.5 h-3.5" />
                    Chat First
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/games')}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                  >
                    Play Games
                  </button>
                  {!m.photosRevealed && (
                    <>
                      <button
                        type="button"
                        onClick={() => respondReveal(m.matchId, 'approve')}
                        disabled={m.myRevealApproved}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 disabled:opacity-50 text-white text-xs font-semibold"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {m.myRevealApproved ? 'Approved' : 'Request / Consent Reveal'}
                      </button>
                      <button
                        type="button"
                        onClick={() => respondReveal(m.matchId, 'decline')}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-rose-300 text-rose-600 text-xs font-semibold"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Keep Hidden
                      </button>
                    </>
                  )}
                  {m.photosRevealed && (
                    <button
                      type="button"
                      onClick={() => navigate(`/profile/${m.partnerId}`)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-[#7C5CFC] text-[#7C5CFC] text-xs font-semibold"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      View Full Profile
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
        <ShieldCheck className="w-4 h-4 text-[#7C5CFC] shrink-0" />
        <span>
          Backend enforcement: Even direct requests to media URLs return HTTP 403 until both users have recorded reveal consent.
        </span>
      </div>
    </div>
  );
};
