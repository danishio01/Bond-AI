import React, { useEffect, useState } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { CompatibilityResult } from '../../server/services/matching';

export const CompatibilityReportPage: React.FC<{ userId: string; navigate: (to: string) => void }> = ({
  userId,
  navigate,
}) => {
  const { apiFetch } = useAuth();
  const [data, setData] = useState<{
    compatibility: CompatibilityResult;
    explanation: string;
    usedAi: boolean;
    aiConsentActive: boolean;
  } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch(`/api/ai/compatibility/${userId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Unable to compute report');
        setData(d);
      })
      .catch((err) => setError((err as Error).message));
  }, [apiFetch, userId]);

  if (error) {
    return (
      <div className="max-w-xl mx-auto rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-8 text-center">
        <p className="text-sm text-rose-600">{error}</p>
      </div>
    );
  }

  if (!data) {
    return <div className="max-w-3xl mx-auto h-72 rounded-3xl bg-white dark:bg-[#161220] animate-pulse" />;
  }

  const { compatibility, explanation, usedAi, aiConsentActive } = data;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <button
        type="button"
        onClick={() => navigate(`/profile/${userId}`)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-[#7C5CFC]"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Profile
      </button>

      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[#7C5CFC]">Explainable Compatibility Report</p>
            <h1 className="mt-1 font-display text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white">
              How your preferences &amp; values align
            </h1>
          </div>
          <div className="text-right">
            <span className="font-mono text-4xl font-bold text-[#7C5CFC] tabular-nums">
              {compatibility.overallScore}%
            </span>
            <p className="text-xs text-slate-500">Weighted alignment</p>
          </div>
        </div>

        <div className="rounded-2xl bg-[#F6F3FD] dark:bg-[#201933] p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-[#6D4AFF] dark:text-[#C4B5FD]">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              {usedAi ? 'Gemini Summary (from calculated metrics)' : 'Deterministic Summary'}
            </span>
            {!aiConsentActive && (
              <button
                type="button"
                onClick={() => navigate('/privacy')}
                className="underline"
              >
                Enable AI explanations in Privacy
              </button>
            )}
          </div>
          <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">{explanation}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          {[
            { label: 'Values (25%)', val: compatibility.breakdown.sharedValues },
            { label: 'Personality (25%)', val: compatibility.breakdown.personality },
            { label: 'Interests (20%)', val: compatibility.breakdown.interests },
            { label: 'Goals (20%)', val: compatibility.breakdown.relationshipGoals },
            { label: 'Lifestyle (10%)', val: compatibility.breakdown.lifestyle },
          ].map((b) => (
            <div
              key={b.label}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4"
            >
              <p className="text-xs text-slate-500 dark:text-slate-400">{b.label}</p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums">{b.val}%</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 text-sm">
          <div className="space-y-3">
            <h2 className="font-semibold text-slate-900 dark:text-white">Shared Ground</h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              <strong>Interests:</strong>{' '}
              {compatibility.sharedInterests.length > 0
                ? compatibility.sharedInterests.join(', ')
                : 'Complementary interests'}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              <strong>Relationship Goals:</strong>{' '}
              {compatibility.sharedGoals.join(', ') || 'Open to exploring alignment'}
            </p>
            {compatibility.similarTraits.length > 0 && (
              <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
                {compatibility.similarTraits.map((t, idx) => (
                  <li key={idx}>{t}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="font-semibold text-slate-900 dark:text-white">
              Lifestyle &amp; Potential Differences
            </h2>
            {compatibility.lifestyleSimilarities.length > 0 && (
              <p className="text-xs text-slate-600 dark:text-slate-300">
                <strong>Lifestyle match:</strong> {compatibility.lifestyleSimilarities.join(' · ')}
              </p>
            )}
            {compatibility.potentialDifferences.length > 0 ? (
              <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
                {compatibility.potentialDifferences.map((d, idx) => (
                  <li key={idx}>{d}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">No major lifestyle friction detected.</p>
            )}
          </div>
        </div>

        <p className="pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          {compatibility.disclaimer}
        </p>
      </div>
    </div>
  );
};
