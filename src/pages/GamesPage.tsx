import React, { useCallback, useEffect, useState } from 'react';
import { Eye, Gamepad2, Plus, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { MatchSummary } from './MatchesPage';

interface GameRound {
  id: string;
  gameType: string;
  promptText: string;
  options: string[];
  myAnswer: string;
  partnerAnswered: boolean;
  partnerAnswer: string;
  myConsentReveal: boolean;
  partnerConsentReveal: boolean;
  bothRevealed: boolean;
  aiSummary: string;
}

export const GamesPage: React.FC = () => {
  const { apiFetch, socket } = useAuth();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [matchId, setMatchId] = useState('');
  const [gameTypes, setGameTypes] = useState<string[]>([
    'Would You Rather',
    'This or That',
    'Two Truths and a Lie',
    'Travel Preferences',
    'Future Goals',
  ]);
  const [selectedType, setSelectedType] = useState('Would You Rather');
  const [rounds, setRounds] = useState<GameRound[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    apiFetch('/api/discovery/matches')
      .then((r) => r.json())
      .then((d) => {
        const list = (d.matches || []) as MatchSummary[];
        setMatches(list);
        if (list[0]) setMatchId(list[0].matchId);
      });
  }, [apiFetch]);

  const loadGames = useCallback(async () => {
    if (!matchId) return;
    const res = await apiFetch(`/api/games/${matchId}`);
    if (res.ok) {
      const d = await res.json();
      setGameTypes(d.gameTypes || []);
      setRounds(d.activities || []);
    }
  }, [apiFetch, matchId]);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  useEffect(() => {
    if (!socket || !matchId) return;
    const onUpdate = (ev: { matchId: string }) => {
      if (ev.matchId === matchId) loadGames();
    };
    socket.on('game:updated', onUpdate);
    return () => {
      socket.off('game:updated', onUpdate);
    };
  }, [loadGames, matchId, socket]);

  const createRound = async () => {
    if (!matchId) return;
    const res = await apiFetch(`/api/games/${matchId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameType: selectedType }),
    });
    if (res.ok) await loadGames();
  };

  const submitAnswer = async (gameId: string, answer: string, consentReveal = true) => {
    if (!answer.trim()) return;
    const res = await apiFetch(`/api/games/${matchId}/${gameId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer, consentReveal }),
    });
    if (res.ok) await loadGames();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#E85D93]">Couple Compatibility Games</p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white">
            Answer independently, reveal with consent
          </h1>
        </div>

        <select
          value={matchId}
          onChange={(e) => setMatchId(e.target.value)}
          className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3.5 py-2 text-sm"
        >
          {matches.length === 0 && <option value="">No matches available</option>}
          {matches.map((m) => (
            <option key={m.matchId} value={m.matchId}>
              Playing with {m.displayName}
            </option>
          ))}
        </select>
      </div>

      {matchId && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {gameTypes.map((gt) => (
              <button
                key={gt}
                type="button"
                onClick={() => setSelectedType(gt)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                  selectedType === gt
                    ? 'bg-[#7C5CFC] text-white'
                    : 'bg-slate-100 dark:bg-[#1E192C] text-slate-700 dark:text-slate-300'
                }`}
              >
                {gt}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={createRound}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E85D93] text-white text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            Start New Prompt
          </button>
        </div>
      )}

      <div className="space-y-4">
        {rounds.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-8 text-center text-sm text-slate-500">
            <Gamepad2 className="w-8 h-8 text-[#7C5CFC] mx-auto mb-2" />
            Start a prompt above to play Would You Rather, Two Truths &amp; a Lie, or Future Goals with your match.
          </div>
        ) : (
          rounds.map((r) => (
            <div
              key={r.id}
              className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-4"
            >
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold text-[#7C5CFC]">{r.gameType}</span>
                <span>
                  {r.bothRevealed
                    ? 'Both consented · Revealed'
                    : r.partnerAnswered
                      ? 'Partner answered · Waiting mutual consent'
                      : 'Waiting for partner'}
                </span>
              </div>

              <h2 className="font-display text-lg font-semibold">{r.promptText}</h2>

              {r.options.length > 0 && !r.myAnswer && (
                <div className="flex flex-wrap gap-2">
                  {r.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => submitAnswer(r.id, opt, true)}
                      className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-[#7C5CFC] text-xs font-semibold"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {!r.myAnswer && (
                <div className="flex gap-2">
                  <input
                    value={drafts[r.id] || ''}
                    onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: e.target.value }))}
                    placeholder="Write your independent answer..."
                    className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3.5 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => submitAnswer(r.id, drafts[r.id] || '', true)}
                    className="px-4 py-2 rounded-xl bg-[#7C5CFC] text-white text-xs font-semibold"
                  >
                    Submit &amp; Consent Reveal
                  </button>
                </div>
              )}

              {r.myAnswer && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-2xl bg-[#FAF8FC] dark:bg-[#1E192C] p-3.5">
                    <p className="font-semibold text-slate-500">Your Answer</p>
                    <p className="mt-1 text-sm text-slate-900 dark:text-white">{r.myAnswer}</p>
                  </div>
                  <div className="rounded-2xl bg-[#FAF8FC] dark:bg-[#1E192C] p-3.5">
                    <p className="font-semibold text-slate-500 flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      Partner&apos;s Answer
                    </p>
                    <p className="mt-1 text-sm text-slate-900 dark:text-white">
                      {r.bothRevealed
                        ? r.partnerAnswer
                        : r.partnerAnswered
                          ? 'Hidden until both consent to reveal'
                          : 'Waiting for response'}
                    </p>
                  </div>
                </div>
              )}

              {r.aiSummary && (
                <div className="rounded-2xl bg-[#F4EFFC] dark:bg-[#221A34] p-4 text-xs text-slate-700 dark:text-slate-200 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-[#7C5CFC] shrink-0 mt-0.5" />
                  <span>{r.aiSummary}</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
