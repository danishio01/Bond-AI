import React, { useState } from 'react';
import { Save, Sparkles, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const EditProfilePage: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => {
  const { profile, preferences, apiFetch, refreshMe } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [cityRegion, setCityRegion] = useState(profile?.cityRegion || '');
  const [occupation, setOccupation] = useState(profile?.occupation || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [interestsText, setInterestsText] = useState((profile?.interests || []).join(', '));
  const [favoriteMusic, setFavoriteMusic] = useState(profile?.favoriteMusic || '');
  const [favoriteMovies, setFavoriteMovies] = useState(profile?.favoriteMovies || '');
  const [relationshipGoal, setRelationshipGoal] = useState(
    profile?.relationshipGoal || 'Long-term relationship'
  );
  const [minAge, setMinAge] = useState(preferences?.minAge || 21);
  const [maxAge, setMaxAge] = useState(preferences?.maxAge || 45);
  const [photos, setPhotos] = useState(profile?.photos || []);

  const [aiMode, setAiMode] = useState<'improve_bio' | 'grammar' | 'variations' | 'prompts' | 'completeness'>(
    'improve_bio'
  );
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [completenessTips, setCompletenessTips] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedMsg('');
    const interests = interestsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    await apiFetch('/api/profiles/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName,
        cityRegion,
        occupation,
        bio,
        interests,
        favoriteMusic,
        favoriteMovies,
        relationshipGoal,
      }),
    });

    await apiFetch('/api/profiles/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minAge, maxAge }),
    });

    await refreshMe();
    setSavedMsg('Profile and preferences saved.');
  };

  const runProfileAssistant = async () => {
    setAiLoading(true);
    try {
      const res = await apiFetch('/api/ai/profile-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: aiMode,
          bio,
          interests: interestsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          occupation,
          favoriteMusic,
          favoriteMovies,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setAiSuggestions(d.suggestions || []);
        setCompletenessTips(d.completenessTips || []);
      }
    } finally {
      setAiLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('photo', file);
    const res = await apiFetch('/api/profiles/media/photo', { method: 'POST', body: form });
    if (res.ok) {
      const d = await res.json();
      setPhotos(d.photos);
      await refreshMe();
    }
  };

  return (
    <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
      <form
        onSubmit={handleSave}
        className="lg:col-span-7 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold">Edit Profile</h1>
          <button
            type="button"
            onClick={() => navigate('/questionnaire')}
            className="text-xs font-semibold text-[#7C5CFC] hover:underline"
          >
            Update Personality Quiz →
          </button>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
          {photos.map((p) => (
            <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100">
              <img src={p.url} alt="Profile" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={async () => {
                  await apiFetch(`/api/profiles/media/${p.id}`, { method: 'DELETE' });
                  setPhotos((prev) => prev.filter((x) => x.id !== p.id));
                }}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/65 text-white flex items-center justify-center"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {photos.length < 6 && (
            <label className="aspect-square rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center cursor-pointer text-[11px] text-slate-500">
              <Upload className="w-4 h-4 mb-0.5" />
              Add
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoUpload} />
            </label>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1">Display Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Approximate City</label>
            <input
              value={cityRegion}
              onChange={(e) => setCityRegion(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Occupation</label>
            <input
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Relationship Goal</label>
            <select
              value={relationshipGoal}
              onChange={(e) => setRelationshipGoal(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2 text-sm"
            >
              <option>Long-term relationship</option>
              <option>Intentional dating</option>
              <option>Life partnership</option>
              <option>Getting to know someone slowly</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1">Bio</label>
          <textarea
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1">Interests (comma-separated)</label>
          <input
            value={interestsText}
            onChange={(e) => setInterestsText(e.target.value)}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            value={favoriteMusic}
            onChange={(e) => setFavoriteMusic(e.target.value)}
            placeholder="Favorite music"
            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
          />
          <input
            value={favoriteMovies}
            onChange={(e) => setFavoriteMovies(e.target.value)}
            placeholder="Favorite films"
            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1">Min Age Pref</label>
            <input
              type="number"
              min={18}
              max={99}
              value={minAge}
              onChange={(e) => setMinAge(Math.max(18, Number(e.target.value)))}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Max Age Pref</label>
            <input
              type="number"
              min={18}
              max={100}
              value={maxAge}
              onChange={(e) => setMaxAge(Math.min(100, Number(e.target.value)))}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
            />
          </div>
        </div>

        {savedMsg && <p className="text-xs text-emerald-600 font-semibold">{savedMsg}</p>}

        <button
          type="submit"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#7C5CFC] text-white text-sm font-semibold"
        >
          <Save className="w-4 h-4" />
          Save Changes
        </button>
      </form>

      {/* AI Profile Assistant */}
      <aside className="lg:col-span-5 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-4 self-start">
        <div className="flex items-center gap-2 text-[#7C5CFC] text-xs font-semibold">
          <Sparkles className="w-4 h-4" />
          <span>Optional AI Profile Assistant</span>
        </div>
        <h2 className="font-display text-xl font-semibold">Refine your bio authentically</h2>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          Only uses the facts you typed on the left—never invents achievements or scores appearance.
        </p>

        <select
          value={aiMode}
          onChange={(e) => setAiMode(e.target.value as typeof aiMode)}
          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2 text-sm"
        >
          <option value="improve_bio">Polish Bio Readability</option>
          <option value="grammar">Grammar &amp; Clarity Check</option>
          <option value="variations">Generate Creative Variations</option>
          <option value="prompts">Suggest Authentic Prompts</option>
          <option value="completeness">Completeness Audit</option>
        </select>

        <button
          type="button"
          disabled={aiLoading}
          onClick={runProfileAssistant}
          className="w-full py-2.5 rounded-xl bg-[#E85D93] text-white text-xs font-semibold"
        >
          {aiLoading ? 'Analyzing...' : 'Get Suggestions'}
        </button>

        {completenessTips.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold">Completeness Notes</p>
            <ul className="text-xs text-slate-600 dark:text-slate-300 list-disc pl-4 space-y-1">
              {completenessTips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        {aiSuggestions.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold">Suggestions (click to apply to Bio)</p>
            {aiSuggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setBio(s)}
                className="w-full text-left p-3 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-[#7C5CFC] text-xs leading-relaxed"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
};
