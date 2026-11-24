import React, { useEffect, useState } from 'react';
import { CalendarHeart, ShieldAlert, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { MatchSummary } from './MatchesPage';
import type { DateIdea } from '../../server/services/gemini';

export const DatePlannerPage: React.FC = () => {
  const { apiFetch } = useAuth();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [matchId, setMatchId] = useState('');
  const [budget, setBudget] = useState('Moderate ($20–$45)');
  const [dietary, setDietary] = useState('Vegetarian options');
  const [availability, setAvailability] = useState('Saturday afternoon');
  const [ideas, setIdeas] = useState<DateIdea[]>([]);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch('/api/discovery/matches')
      .then((r) => r.json())
      .then((d) => {
        const list = (d.matches || []) as MatchSummary[];
        setMatches(list);
        if (list[0]) setMatchId(list[0].matchId);
      });
  }, [apiFetch]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchId) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/ai/date-planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, budget, dietary, availability }),
      });
      const d = await res.json();
      if (res.ok) {
        setIdeas(d.ideas || []);
        setNotice(d.notice || '');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#7C5CFC]">AI Date Planner</p>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white">
          Thoughtful, public-first date concepts
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Tailored to mutual interests and approximate city—never sharing home addresses or fabricating venue reservations.
        </p>
      </div>

      <form
        onSubmit={handleGenerate}
        className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        <div>
          <label className="block text-xs font-semibold mb-1">Matched Partner</label>
          <select
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2.5 text-sm"
          >
            {matches.length === 0 && <option value="">No active matches yet</option>}
            {matches.map((m) => (
              <option key={m.matchId} value={m.matchId}>
                {m.displayName} ({m.compatibilityScore}% alignment)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1">Estimated Budget</label>
          <select
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2.5 text-sm"
          >
            <option>Low ($0–$20)</option>
            <option>Moderate ($20–$45)</option>
            <option>Comfortable ($45–$85)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1">Dietary Preferences</label>
          <input
            value={dietary}
            onChange={(e) => setDietary(e.target.value)}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3.5 py-2.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1">Voluntary Availability</label>
          <input
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3.5 py-2.5 text-sm"
          />
        </div>

        <div className="sm:col-span-2 flex justify-end">
          <button
            type="submit"
            disabled={!matchId || loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#7C5CFC] disabled:opacity-50 text-white text-sm font-semibold"
          >
            <Sparkles className="w-4 h-4" />
            {loading ? 'Planning...' : 'Generate Date Ideas'}
          </button>
        </div>
      </form>

      {notice && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-4 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {ideas.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ideas.map((idea, i) => (
            <div
              key={i}
              className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-5 flex flex-col justify-between gap-3"
            >
              <div>
                <p className="text-xs text-[#7C5CFC] font-semibold">
                  {idea.category} · {idea.duration}
                </p>
                <h2 className="mt-1 font-display text-lg font-semibold flex items-start gap-2">
                  <CalendarHeart className="w-4 h-4 text-[#E85D93] shrink-0 mt-1" />
                  <span>{idea.title}</span>
                </h2>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {idea.whyItFits}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1">
                <p className="font-mono text-slate-700 dark:text-slate-200">
                  Budget: {idea.estimatedBudget}
                </p>
                <p className="text-slate-500 dark:text-slate-400">
                  Safety: {idea.safetyGuidance}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
