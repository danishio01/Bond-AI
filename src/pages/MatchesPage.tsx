import React, { useCallback, useEffect, useState } from 'react';
import { CalendarHeart, EyeOff, Gamepad2, MessageSquareLock, UserX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export interface MatchSummary {
  matchId: string;
  conversationId: string;
  partnerId: string;
  displayName: string;
  age: number;
  cityRegion: string;
  occupation: string;
  bio: string;
  interests: string[];
  relationshipGoal: string;
  photos: { id: string; url: string; order: number }[];
  photosHidden: boolean;
  isBlindMatch: boolean;
  photosRevealed: boolean;
  myRevealApproved: boolean;
  partnerRevealApproved: boolean;
  revealDeclinedBy: string;
  compatibilityScore: number;
  disappearingSeconds: number;
  lastMessageAt: number;
  showOnlineStatus: boolean;
  isDevDemo: boolean;
}

export const MatchesPage: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => {
  const { apiFetch } = useAuth();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/discovery/matches');
      if (res.ok) {
        const d = await res.json();
        setMatches(d.matches || []);
      }
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  const handleUnmatch = async (matchId: string) => {
    await apiFetch(`/api/discovery/matches/${matchId}`, { method: 'DELETE' });
    setMatches((prev) => prev.filter((m) => m.matchId !== matchId));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
            Mutual Matches
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Start a Signal Protocol encrypted conversation, plan a public date, or play compatibility games.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/discover')}
          className="px-4 py-2 rounded-xl bg-[#7C5CFC] text-white text-xs font-semibold"
        >
          Discover More
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-44 rounded-3xl bg-white dark:bg-[#161220] animate-pulse" />
          <div className="h-44 rounded-3xl bg-white dark:bg-[#161220] animate-pulse" />
        </div>
      ) : matches.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-10 text-center">
          <p className="font-display text-xl font-semibold">No mutual matches yet</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Explore Discover or Blind Connect to like profiles that resonate with your values.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {matches.map((m) => (
            <div
              key={m.matchId}
              className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-5 flex flex-col justify-between gap-4"
            >
              <div className="flex items-start gap-4">
                {m.photosHidden || m.photos.length === 0 ? (
                  <div className="w-16 h-16 rounded-2xl bg-[#F1EBFE] dark:bg-[#231B38] flex items-center justify-center shrink-0">
                    <EyeOff className="w-6 h-6 text-[#7C5CFC]" />
                  </div>
                ) : (
                  <img
                    src={m.photos[0].url}
                    alt={m.displayName}
                    className="w-16 h-16 rounded-2xl object-cover shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {m.isBlindMatch ? 'Blind Connect · ' : ''}
                    {m.compatibilityScore}% alignment · {m.cityRegion}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate(`/profile/${m.partnerId}`)}
                    className="mt-0.5 font-display text-lg font-semibold text-slate-900 dark:text-white hover:text-[#7C5CFC] text-left truncate block"
                  >
                    {m.displayName}, {m.age}
                  </button>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                    {m.bio}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => navigate(`/messages/${m.matchId}`)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#7C5CFC] text-white text-xs font-semibold"
                >
                  <MessageSquareLock className="w-3.5 h-3.5" />
                  Chat
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/date-planner')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  <CalendarHeart className="w-3.5 h-3.5" />
                  Date Plan
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/games')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  <Gamepad2 className="w-3.5 h-3.5" />
                  Games
                </button>
                <button
                  type="button"
                  onClick={() => handleUnmatch(m.matchId)}
                  aria-label="Unmatch"
                  className="ml-auto inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs text-slate-500 hover:text-rose-600"
                >
                  <UserX className="w-3.5 h-3.5" />
                  Unmatch
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
