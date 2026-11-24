import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { PERSONALITY_QUESTIONS } from '../../shared/questionnaire';
import { useAuth } from '../context/AuthContext';

export const QuestionnairePage: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => {
  const { assessment, apiFetch, refreshMe } = useAuth();
  const [answers, setAnswers] = useState<Record<string, number>>(assessment.answers || {});
  const [idx, setIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');

  const q = PERSONALITY_QUESTIONS[idx];
  const answeredCount = Object.keys(answers).length;
  const pct = Math.round((answeredCount / PERSONALITY_QUESTIONS.length) * 100);

  const handleSave = async (goNextRoute?: string) => {
    setSaving(true);
    setSavedNotice('');
    try {
      const res = await apiFetch('/api/profiles/assessment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      if (res.ok) {
        await refreshMe();
        setSavedNotice('Assessment saved and compatibility vectors updated.');
        if (goNextRoute) navigate(goNextRoute);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-[#7C5CFC]">
            Personality &amp; Values Assessment · {answeredCount}/{PERSONALITY_QUESTIONS.length} answered
          </p>
          <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
            Help BondAI understand how you connect
          </h1>
        </div>
        <span className="font-mono text-sm font-semibold text-[#7C5CFC] tabular-nums">{pct}%</span>
      </div>

      <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#7C5CFC] to-[#E85D93] transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 sm:p-8">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="capitalize">
            Topic: {q.category} {q.optional ? '· Optional' : ''}
          </span>
          <span className="font-mono tabular-nums">
            Question {idx + 1} / {PERSONALITY_QUESTIONS.length}
          </span>
        </div>

        <h2 className="mt-3 font-display text-xl font-semibold text-slate-900 dark:text-white">
          {q.prompt}
        </h2>

        <div className="mt-5 space-y-2.5">
          {q.options.map((opt) => {
            const selected = answers[q.id] === opt.score;
            return (
              <button
                key={opt.score}
                type="button"
                onClick={() => {
                  setAnswers((prev) => ({ ...prev, [q.id]: opt.score }));
                  if (idx < PERSONALITY_QUESTIONS.length - 1) {
                    setTimeout(() => setIdx((i) => Math.min(PERSONALITY_QUESTIONS.length - 1, i + 1)), 120);
                  }
                }}
                className={`w-full text-left px-4 py-3.5 rounded-2xl border text-sm transition-colors flex items-center justify-between gap-3 ${
                  selected
                    ? 'border-[#7C5CFC] bg-[#7C5CFC]/10 text-slate-900 dark:text-white font-semibold'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <span>{opt.label}</span>
                {selected && <CheckCircle2 className="w-4 h-4 text-[#7C5CFC] shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={idx === 0}
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold disabled:opacity-40"
            >
              Previous
            </button>
            {idx < PERSONALITY_QUESTIONS.length - 1 && (
              <button
                type="button"
                onClick={() => setIdx((i) => i + 1)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                {q.optional ? 'Skip Optional' : 'Next'}
              </button>
            )}
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave('/discover')}
            className="px-5 py-2.5 rounded-xl bg-[#7C5CFC] hover:bg-[#6A48F5] text-white text-xs font-semibold"
          >
            {saving ? 'Saving...' : 'Save & Discover Matches'}
          </button>
        </div>

        {savedNotice && <p className="mt-3 text-xs text-emerald-600">{savedNotice}</p>}
      </div>
    </div>
  );
};
