import React, { useEffect, useState } from 'react';
import { ArrowLeft, Ban, EyeOff, Flag, MessageSquareLock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface FullProfile {
  userId: string;
  displayName: string;
  age: number;
  gender: string;
  cityRegion: string;
  occupation: string;
  education: string;
  languages: string[];
  bio: string;
  interests: string[];
  favoriteMusic: string;
  favoriteMovies: string;
  favoriteActivities: string;
  prompts: { question: string; answer: string }[];
  photos: { id: string; url: string; order: number }[];
  photosHidden: boolean;
  voiceIntroUrl: string;
  relationshipGoal: string;
  lifestyle: Record<string, string>;
  verifiedBadge: boolean;
  matchId: string | null;
}

export const ProfileDetailPage: React.FC<{ userId: string; navigate: (to: string) => void }> = ({
  userId,
  navigate,
}) => {
  const { apiFetch } = useAuth();
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch(`/api/profiles/${userId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Unavailable');
        setProfile(d.profile);
      })
      .catch((err) => setError((err as Error).message));
  }, [apiFetch, userId]);

  if (error) {
    return (
      <div className="max-w-xl mx-auto rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-8 text-center">
        <p className="text-sm text-rose-600">{error}</p>
        <button
          type="button"
          onClick={() => navigate('/discover')}
          className="mt-4 px-4 py-2 rounded-xl bg-[#7C5CFC] text-white text-xs font-semibold"
        >
          Back to Discover
        </button>
      </div>
    );
  }

  if (!profile) {
    return <div className="max-w-3xl mx-auto h-80 rounded-3xl bg-white dark:bg-[#161220] animate-pulse" />;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <button
        type="button"
        onClick={() => navigate('/discover')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-[#7C5CFC]"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {profile.cityRegion} · {profile.gender} · {profile.relationshipGoal}
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              {profile.displayName}, {profile.age}
              {profile.verifiedBadge && <ShieldCheck className="w-5 h-5 text-[#7C5CFC]" />}
            </h1>
            {profile.occupation && (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {profile.occupation} {profile.education ? `· ${profile.education}` : ''}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate(`/compatibility/${profile.userId}`)}
              className="px-4 py-2 rounded-xl border border-[#7C5CFC]/40 text-[#7C5CFC] text-xs font-semibold"
            >
              Compatibility Report
            </button>
            {profile.matchId && (
              <button
                type="button"
                onClick={() => navigate(`/messages/${profile.matchId}`)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#7C5CFC] text-white text-xs font-semibold"
              >
                <MessageSquareLock className="w-3.5 h-3.5" />
                Message
              </button>
            )}
          </div>
        </div>

        {profile.photosHidden ? (
          <div className="rounded-2xl bg-[#F4EFFC] dark:bg-[#221A34] p-6 flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
            <EyeOff className="w-5 h-5 text-[#7C5CFC] shrink-0" />
            <span>
              Photos are protected by Blind Connect until both you and {profile.displayName} explicitly consent to reveal.
            </span>
          </div>
        ) : (
          profile.photos.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {profile.photos.map((ph) => (
                <div key={ph.id} className="aspect-[3/4] rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <img src={ph.url} alt={profile.displayName} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )
        )}

        {profile.voiceIntroUrl && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs font-semibold mb-2">Voice Introduction</p>
            <audio controls src={profile.voiceIntroUrl} className="w-full" />
          </div>
        )}

        <div className="space-y-4">
          <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed">
            {profile.bio}
          </p>
          {profile.interests.length > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <strong>Interests:</strong> {profile.interests.join(' · ')}
            </p>
          )}
          {(profile.favoriteMusic || profile.favoriteMovies || profile.favoriteActivities) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
              {profile.favoriteMusic && (
                <div>
                  <p className="font-semibold text-slate-500">Music</p>
                  <p className="mt-0.5 text-slate-800 dark:text-slate-200">{profile.favoriteMusic}</p>
                </div>
              )}
              {profile.favoriteMovies && (
                <div>
                  <p className="font-semibold text-slate-500">Movies</p>
                  <p className="mt-0.5 text-slate-800 dark:text-slate-200">{profile.favoriteMovies}</p>
                </div>
              )}
              {profile.favoriteActivities && (
                <div>
                  <p className="font-semibold text-slate-500">Activities</p>
                  <p className="mt-0.5 text-slate-800 dark:text-slate-200">{profile.favoriteActivities}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {profile.prompts.length > 0 && (
          <div className="space-y-3 pt-2">
            {profile.prompts.map((pr, i) => (
              <div key={i} className="rounded-2xl bg-[#FAF8FC] dark:bg-[#1E192C] p-4">
                <p className="text-xs font-semibold text-slate-500">{pr.question}</p>
                <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">{pr.answer}</p>
              </div>
            ))}
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4 text-xs">
          <button
            type="button"
            onClick={async () => {
              await apiFetch(`/api/safety/block/${profile.userId}`, { method: 'POST' });
              navigate('/discover');
            }}
            className="inline-flex items-center gap-1.5 text-rose-600 hover:underline"
          >
            <Ban className="w-3.5 h-3.5" />
            Block User
          </button>
          <button
            type="button"
            onClick={() => navigate('/safety')}
            className="inline-flex items-center gap-1.5 text-slate-500 hover:text-rose-600"
          >
            <Flag className="w-3.5 h-3.5" />
            Report Safety Concern
          </button>
        </div>
      </div>
    </div>
  );
};
