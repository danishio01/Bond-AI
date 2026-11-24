import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Ban,
  CheckCircle2,
  EyeOff,
  Flag,
  Heart,
  Info,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { CompatibilityResult } from '../../server/services/matching';

interface Candidate {
  userId: string;
  displayName: string;
  age: number;
  gender: string;
  cityRegion: string;
  occupation: string;
  bio: string;
  interests: string[];
  prompts: { question: string; answer: string }[];
  photos: { id: string; url: string; order: number }[];
  photosHidden: boolean;
  relationshipGoal: string;
  verifiedBadge: boolean;
  blindConnectEnabled: boolean;
  isDevDemo: boolean;
  compatibility: CompatibilityResult;
}

export const DiscoverPage: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => {
  const { apiFetch } = useAuth();
  const [mode, setMode] = useState<'standard' | 'blind'>('standard');
  const [minScore, setMinScore] = useState(0);
  const [goalFilter, setGoalFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [dailyStats, setDailyStats] = useState({ used: 0, limit: 50, remaining: 50 });
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [matchBanner, setMatchBanner] = useState<{
    matchId: string;
    name: string;
    score: number;
    isBlind: boolean;
  } | null>(null);
  const [reportTarget, setReportTarget] = useState<Candidate | null>(null);
  const [reportCat, setReportCat] = useState('Spam or Scam');
  const [reportDesc, setReportDesc] = useState('');

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        mode,
        minScore: String(minScore),
        ...(goalFilter ? { goal: goalFilter } : {}),
      });
      const res = await apiFetch(`/api/discovery?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to load recommendations');
        return;
      }
      setPaused(Boolean(data.paused));
      setCandidates(data.candidates || []);
      if (data.dailyStats) setDailyStats(data.dailyStats);
    } catch {
      setError('Connection issue while loading discovery feed');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, goalFilter, minScore, mode]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const topCandidate = candidates[0];

  const handleSwipe = useCallback(
    async (action: 'like' | 'pass' | 'superlike') => {
      if (!topCandidate) return;
      const target = topCandidate;
      setCandidates((prev) => prev.slice(1));

      try {
        const res = await apiFetch('/api/discovery/swipe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId: target.userId, action, mode }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Swipe failed');
          setCandidates((prev) => [target, ...prev]);
          return;
        }
        if (data.dailyStats) setDailyStats(data.dailyStats);
        if (data.matched && data.match) {
          setMatchBanner({
            matchId: data.match.id,
            name: target.displayName,
            score: data.match.compatibilityScore,
            isBlind: data.match.isBlindMatch,
          });
        }
      } catch {
        setCandidates((prev) => [target, ...prev]);
      }
    },
    [apiFetch, mode, topCandidate]
  );

  const handleUndo = useCallback(async () => {
    const res = await apiFetch('/api/discovery/undo', { method: 'POST' });
    if (res.ok) {
      await loadFeed();
    } else {
      const data = await res.json();
      setError(data.error || 'Nothing to undo');
    }
  }, [apiFetch, loadFeed]);

  // Keyboard accessible controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (reportTarget || matchBanner) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') handleSwipe('pass');
      if (e.key === 'ArrowRight') handleSwipe('like');
      if (e.key === 'ArrowUp') handleSwipe('superlike');
      if (e.key.toLowerCase() === 'z') handleUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSwipe, handleUndo, matchBanner, reportTarget]);

  const handleBlock = async (target: Candidate) => {
    await apiFetch(`/api/safety/block/${target.userId}`, { method: 'POST' });
    setCandidates((prev) => prev.filter((c) => c.userId !== target.userId));
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTarget) return;
    const res = await apiFetch('/api/safety/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportedUserId: reportTarget.userId,
        category: reportCat,
        description: reportDesc,
      }),
    });
    if (res.ok) {
      setCandidates((prev) => prev.filter((c) => c.userId !== reportTarget.userId));
      setReportTarget(null);
      setReportDesc('');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
            Discover
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {dailyStats.remaining} of {dailyStats.limit} daily introductions remaining · Arrow keys supported
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#1B1628]">
            <button
              type="button"
              onClick={() => setMode('standard')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'standard'
                  ? 'bg-white dark:bg-[#2C2340] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => setMode('blind')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'blind'
                  ? 'bg-[#7C5CFC] text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <EyeOff className="w-3.5 h-3.5" />
              Blind Connect
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] text-xs font-semibold min-h-[40px]"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1">
              Minimum Compatibility Score ({minScore}%)
            </label>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full accent-[#7C5CFC]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Relationship Goal Filter</label>
            <input
              value={goalFilter}
              onChange={(e) => setGoalFilter(e.target.value)}
              placeholder="e.g. Long-term, Intentional"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-xs"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setMinScore(0);
                setGoalFilter('');
              }}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
            >
              Reset Filters
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-[500px] rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] animate-pulse p-8 flex flex-col justify-end gap-4">
          <div className="h-6 w-48 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-4 w-72 rounded bg-slate-200 dark:bg-slate-800" />
        </div>
      ) : paused ? (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-10 text-center">
          <h2 className="font-display text-xl font-semibold">Discovery is Paused</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Your profile is hidden from discovery. Resume anytime from your Privacy Dashboard.
          </p>
          <button
            type="button"
            onClick={() => navigate('/privacy')}
            className="mt-5 px-5 py-2.5 rounded-xl bg-[#7C5CFC] text-white text-sm font-semibold"
          >
            Open Privacy Dashboard
          </button>
        </div>
      ) : !topCandidate ? (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-10 text-center">
          <Sparkles className="w-8 h-8 text-[#7C5CFC] mx-auto" />
          <h2 className="mt-3 font-display text-xl font-semibold">No more profiles match your current queue</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Adjust age/gender preferences, undo your last pass, or switch between Standard and Blind Connect modes.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              onClick={handleUndo}
              className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
            >
              Undo Last Swipe
            </button>
            <button
              type="button"
              onClick={() => navigate('/edit-profile')}
              className="px-4 py-2.5 rounded-xl bg-[#7C5CFC] text-white text-xs font-semibold"
            >
              Update Preferences
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Interactive Card */}
          <div className="lg:col-span-7">
            <AnimatePresence mode="wait">
              <motion.div
                key={topCandidate.userId + mode}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={(_, info) => {
                  if (info.offset.x > 110) handleSwipe('like');
                  else if (info.offset.x < -110) handleSwipe('pass');
                }}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, x: 40 }}
                transition={{ duration: 0.2 }}
                className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] overflow-hidden shadow-sm cursor-grab active:cursor-grabbing"
              >
                {topCandidate.photosHidden || topCandidate.photos.length === 0 ? (
                  <div className="h-72 bg-gradient-to-br from-[#F1EBFE] via-[#FDF0F5] to-[#FAF8FC] dark:from-[#231B38] dark:to-[#181326] p-6 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs font-semibold text-[#6D4AFF] dark:text-[#C4B5FD]">
                      <span className="inline-flex items-center gap-1.5">
                        <EyeOff className="w-4 h-4" />
                        Blind Connect · Photos Withheld on Server
                      </span>
                      <span className="font-mono tabular-nums">
                        {topCandidate.compatibility.overallScore}% alignment
                      </span>
                    </div>
                    <div>
                      <p className="font-display text-3xl font-semibold text-slate-900 dark:text-white">
                        {topCandidate.displayName}, {topCandidate.age}
                      </p>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        {topCandidate.cityRegion} · {topCandidate.relationshipGoal}
                        {topCandidate.isDevDemo ? ' · Demo Profile' : ''}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="relative h-96 bg-slate-100 dark:bg-slate-900">
                    <img
                      src={topCandidate.photos[0].url}
                      alt={topCandidate.displayName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                    <div className="absolute bottom-5 left-5 right-5 text-white">
                      <p className="text-xs text-white/80">
                        {topCandidate.cityRegion} · {topCandidate.relationshipGoal}
                        {topCandidate.verifiedBadge ? ' · Verified' : ''}
                        {topCandidate.isDevDemo ? ' · Demo Profile' : ''}
                      </p>
                      <div className="mt-1 flex items-baseline justify-between gap-4">
                        <h2 className="font-display text-2xl sm:text-3xl font-semibold">
                          {topCandidate.displayName}, {topCandidate.age}
                        </h2>
                        <span className="font-mono text-xl font-bold text-[#C4B5FD] tabular-nums">
                          {topCandidate.compatibility.overallScore}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-6 space-y-4">
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {topCandidate.bio || 'No bio added yet.'}
                  </p>

                  {topCandidate.interests.length > 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Interests: {topCandidate.interests.join(' · ')}
                    </p>
                  )}

                  {topCandidate.prompts[0] && (
                    <div className="rounded-2xl bg-[#FAF8FC] dark:bg-[#1E192C] p-4">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {topCandidate.prompts[0].question}
                      </p>
                      <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">
                        {topCandidate.prompts[0].answer}
                      </p>
                    </div>
                  )}

                  {/* Swipe Action Buttons (>= 44px touch targets) */}
                  <div className="pt-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={handleUndo}
                      aria-label="Undo previous swipe"
                      className="min-w-[48px] min-h-[48px] rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-[#1F1A2D]"
                    >
                      <RotateCcw className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSwipe('pass')}
                      aria-label="Pass"
                      className="flex-1 min-h-[48px] rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-[#1F1A2D]"
                    >
                      <X className="w-5 h-5 text-slate-500" />
                      Pass
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSwipe('superlike')}
                      aria-label="Super Like"
                      className="min-w-[52px] min-h-[48px] rounded-2xl border border-[#7C5CFC]/40 bg-[#7C5CFC]/10 text-[#7C5CFC] flex items-center justify-center hover:bg-[#7C5CFC]/20"
                    >
                      <Star className="w-5 h-5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSwipe('like')}
                      aria-label="Like"
                      className="flex-1 min-h-[48px] rounded-2xl bg-[#E85D93] hover:bg-[#D64B82] text-white flex items-center justify-center gap-2 text-sm font-semibold"
                    >
                      <Heart className="w-5 h-5" />
                      Like
                    </button>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Explainable Compatibility Breakdown Sidebar */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold">Why you matched</h3>
                <span className="font-mono text-lg font-bold text-[#7C5CFC] tabular-nums">
                  {topCandidate.compatibility.overallScore}/100
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                {[
                  { label: 'Shared Values (25%)', val: topCandidate.compatibility.breakdown.sharedValues },
                  { label: 'Personality (25%)', val: topCandidate.compatibility.breakdown.personality },
                  { label: 'Interests (20%)', val: topCandidate.compatibility.breakdown.interests },
                  { label: 'Relationship Goals (20%)', val: topCandidate.compatibility.breakdown.relationshipGoals },
                  { label: 'Lifestyle (10%)', val: topCandidate.compatibility.breakdown.lifestyle },
                ].map((bar) => (
                  <div key={bar.label}>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-600 dark:text-slate-300">{bar.label}</span>
                      <span className="font-mono font-semibold tabular-nums">{bar.val}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-[#7C5CFC]"
                        style={{ width: `${bar.val}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {topCandidate.compatibility.sharedInterests.length > 0 && (
                <p className="text-xs text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <strong>Shared interests:</strong>{' '}
                  {topCandidate.compatibility.sharedInterests.join(', ')}
                </p>
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {topCandidate.compatibility.disclaimer}
              </p>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => navigate(`/profile/${topCandidate.userId}`)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  <Info className="w-3.5 h-3.5" />
                  Full Profile
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/compatibility/${topCandidate.userId}`)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#7C5CFC]/10 text-[#6D4AFF] dark:text-[#C4B5FD] text-xs font-semibold"
                >
                  Compatibility Report
                </button>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4 text-xs text-slate-500">
                <button
                  type="button"
                  onClick={() => setReportTarget(topCandidate)}
                  className="inline-flex items-center gap-1 hover:text-rose-600"
                >
                  <Flag className="w-3.5 h-3.5" />
                  Report
                </button>
                <button
                  type="button"
                  onClick={() => handleBlock(topCandidate)}
                  className="inline-flex items-center gap-1 hover:text-rose-600"
                >
                  <Ban className="w-3.5 h-3.5" />
                  Block
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Match Celebration Modal */}
      {matchBanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="max-w-sm w-full rounded-3xl bg-white dark:bg-[#161220] border border-slate-200 dark:border-slate-800 p-6 text-center shadow-xl"
          >
            <CheckCircle2 className="w-12 h-12 text-[#E85D93] mx-auto" />
            <h2 className="mt-3 font-display text-2xl font-semibold">
              {matchBanner.isBlind ? 'Blind Connect Match' : 'Mutual Match'}
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              You and <strong>{matchBanner.name}</strong> liked each other ({matchBanner.score}% alignment).
              {matchBanner.isBlind
                ? ' Photos stay hidden until both of you consent to reveal.'
                : ' Your Signal encrypted conversation is ready.'}
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const id = matchBanner.matchId;
                  setMatchBanner(null);
                  navigate(`/messages/${id}`);
                }}
                className="w-full py-3 rounded-xl bg-[#7C5CFC] text-white font-semibold text-sm"
              >
                Open Encrypted Chat
              </button>
              <button
                type="button"
                onClick={() => setMatchBanner(null)}
                className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Keep Discovering
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Report Modal */}
      {reportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
          <form
            onSubmit={handleReportSubmit}
            className="max-w-md w-full rounded-3xl bg-white dark:bg-[#161220] border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-semibold">Report {reportTarget.displayName}</h3>
            <select
              value={reportCat}
              onChange={(e) => setReportCat(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2 text-sm"
            >
              <option>Spam or Scam</option>
              <option>Harassment</option>
              <option>Impersonation</option>
              <option>Underage Concern</option>
              <option>Inappropriate Content</option>
              <option>Other Safety Concern</option>
            </select>
            <textarea
              required
              minLength={10}
              rows={3}
              value={reportDesc}
              onChange={(e) => setReportDesc(e.target.value)}
              placeholder="Describe the safety concern clearly for human moderation..."
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold"
              >
                Submit Safety Report
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
