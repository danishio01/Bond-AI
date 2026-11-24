import React, { useState } from 'react';
import { Check, Mic, Square, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const INTEREST_OPTIONS = [
  'Ceramics',
  'Bookstores',
  'Indie Cinema',
  'Filter Coffee',
  'Cooking',
  'Cycling',
  'Hiking',
  'Film Photography',
  'Museums',
  'Jazz Vinyl',
  'Slow Travel',
  'Botanical Gardens',
  'Live Acoustic',
  'Board Games',
  'Privacy Tech',
  'Ocean Swimming',
];

export const OnboardingPage: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => {
  const { profile, preferences, consent, apiFetch, refreshMe } = useAuth();
  const [step, setStep] = useState(2);

  // Step 2: Personal Info
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [gender, setGender] = useState(profile?.gender || 'Woman');
  const [datingPreferences, setDatingPreferences] = useState<string[]>(
    profile?.datingPreferences?.length ? profile.datingPreferences : ['Everyone']
  );
  const [cityRegion, setCityRegion] = useState(profile?.cityRegion || '');
  const [occupation, setOccupation] = useState(profile?.occupation || '');
  const [education, setEducation] = useState(profile?.education || '');
  const [languagesText, setLanguagesText] = useState((profile?.languages || ['English']).join(', '));

  // Step 3: Profile Creation
  const [bio, setBio] = useState(profile?.bio || '');
  const [interests, setInterests] = useState<string[]>(profile?.interests || []);
  const [favoriteMusic, setFavoriteMusic] = useState(profile?.favoriteMusic || '');
  const [favoriteMovies, setFavoriteMovies] = useState(profile?.favoriteMovies || '');
  const [favoriteActivities, setFavoriteActivities] = useState(profile?.favoriteActivities || '');
  const [photos, setPhotos] = useState(profile?.photos || []);
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [voiceUrl, setVoiceUrl] = useState(profile?.voiceIntroUrl || '');

  // Step 5: Match Preferences
  const [minAge, setMinAge] = useState(preferences?.minAge || 22);
  const [maxAge, setMaxAge] = useState(preferences?.maxAge || 40);
  const [maxDistanceKm, setMaxDistanceKm] = useState(preferences?.maxDistanceKm || 50);
  const [relationshipGoal, setRelationshipGoal] = useState(
    profile?.relationshipGoal || 'Long-term relationship'
  );
  const [diet, setDiet] = useState(profile?.lifestyle?.diet || 'Flexible');
  const [exercise, setExercise] = useState(profile?.lifestyle?.exercise || 'Regularly');

  // Step 6: Privacy Defaults
  const [profileVisibility, setProfileVisibility] = useState<'everyone' | 'matches_only' | 'hidden'>(
    consent?.profileVisibility || 'everyone'
  );
  const [photoVisibility, setPhotoVisibility] = useState<'everyone' | 'matches_only' | 'blind_only'>(
    consent?.photoVisibility || 'everyone'
  );
  const [showOnlineStatus, setShowOnlineStatus] = useState(consent?.showOnlineStatus ?? false);
  const [shareApproxLocation, setShareApproxLocation] = useState(consent?.shareApproxLocation ?? true);
  const [aiProcessingConsent, setAiProcessingConsent] = useState(consent?.aiProcessingConsent ?? false);
  const [blindConnectEnabled, setBlindConnectEnabled] = useState(profile?.blindConnectEnabled ?? false);

  const [statusMsg, setStatusMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleInterest = (item: string) => {
    setInterests((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : prev.length < 12 ? [...prev, item] : prev
    );
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('photo', file);
    setSaving(true);
    setStatusMsg('');
    try {
      const res = await apiFetch('/api/profiles/media/photo', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setStatusMsg(data.error || 'Upload failed');
      } else {
        setPhotos(data.photos);
        await refreshMe();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePhoto = async (id: string) => {
    await apiFetch(`/api/profiles/media/${id}`, { method: 'DELETE' });
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    await refreshMe();
  };

  const toggleVoiceRecording = async () => {
    if (recording && mediaRecorder) {
      mediaRecorder.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const form = new FormData();
        form.append('voice', blob, 'voice-intro.webm');
        const res = await apiFetch('/api/profiles/media/voice', { method: 'POST', body: form });
        const data = await res.json();
        if (res.ok) {
          setVoiceUrl(data.voiceIntroUrl);
          await refreshMe();
        }
      };
      rec.start();
      setMediaRecorder(rec);
      setRecording(true);
    } catch {
      setStatusMsg('Microphone permission unavailable in this browser.');
    }
  };

  const saveStepAndAdvance = async (nextStep: number) => {
    setSaving(true);
    setStatusMsg('');
    try {
      await apiFetch('/api/profiles/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName || undefined,
          gender,
          datingPreferences,
          cityRegion,
          occupation,
          education,
          languages: languagesText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          bio,
          interests,
          favoriteMusic,
          favoriteMovies,
          favoriteActivities,
          relationshipGoal,
          lifestyle: { diet, exercise },
          blindConnectEnabled,
          onboardingStep: nextStep,
        }),
      });

      await apiFetch('/api/profiles/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minAge,
          maxAge,
          maxDistanceKm,
          preferredGenders: datingPreferences,
          relationshipGoals: [relationshipGoal],
        }),
      });

      await apiFetch('/api/safety/privacy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileVisibility,
          photoVisibility,
          showOnlineStatus,
          shareApproxLocation,
          aiProcessingConsent,
        }),
      });

      await refreshMe();
      if (nextStep === 4) {
        navigate('/questionnaire');
      } else if (nextStep >= 7) {
        navigate('/discover');
      } else {
        setStep(nextStep);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-[#7C5CFC]">Onboarding · Step {step} of 6</p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white">
            Build your private, authentic profile
          </h1>
        </div>
        <button
          type="button"
          onClick={() => navigate('/discover')}
          className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
        >
          Skip to Discover →
        </button>
      </div>

      {/* Step Indicator */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { n: 2, label: 'Personal' },
          { n: 3, label: 'Profile & Media' },
          { n: 4, label: 'Personality' },
          { n: 5, label: 'Preferences' },
          { n: 6, label: 'Privacy' },
        ].map((s) => (
          <button
            key={s.n}
            type="button"
            onClick={() => (s.n === 4 ? navigate('/questionnaire') : setStep(s.n))}
            className={`py-2 px-2 rounded-xl text-xs font-semibold transition-colors ${
              step === s.n
                ? 'bg-[#7C5CFC] text-white'
                : 'bg-white dark:bg-[#161220] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {statusMsg && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800">
          {statusMsg}
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 sm:p-8 space-y-5">
        {step === 2 && (
          <>
            <h2 className="font-display text-xl font-semibold">Step 2 · Personal Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Display Name</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Gender Identity</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3.5 py-2.5 text-sm"
                >
                  <option>Woman</option>
                  <option>Man</option>
                  <option>Non-binary</option>
                  <option>Prefer not to say</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Approximate City / Region</label>
                <input
                  value={cityRegion}
                  onChange={(e) => setCityRegion(e.target.value)}
                  placeholder="e.g. Bengaluru · Koramangala"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Occupation (optional)</label>
                <input
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Education (optional)</label>
                <input
                  value={education}
                  onChange={(e) => setEducation(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Languages (comma-separated)</label>
                <input
                  value={languagesText}
                  onChange={(e) => setLanguagesText(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3.5 py-2.5 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-2">Interested in meeting</label>
              <div className="flex flex-wrap gap-2">
                {['Women', 'Men', 'Non-binary', 'Everyone'].map((opt) => {
                  const active = datingPreferences.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        setDatingPreferences((prev) =>
                          opt === 'Everyone'
                            ? ['Everyone']
                            : prev.includes(opt)
                              ? prev.filter((x) => x !== opt)
                              : [...prev.filter((x) => x !== 'Everyone'), opt]
                        )
                      }
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border ${
                        active
                          ? 'bg-[#7C5CFC] text-white border-[#7C5CFC]'
                          : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() => saveStepAndAdvance(3)}
                className="px-6 py-2.5 rounded-xl bg-[#7C5CFC] text-white text-sm font-semibold"
              >
                Save &amp; Continue
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="font-display text-xl font-semibold">Step 3 · Photos, Bio &amp; Voice Intro</h2>
            <div>
              <p className="text-xs font-semibold mb-2">Profile Photos (up to 6 · private access controlled)</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {photos.map((p) => (
                  <div key={p.id} className="relative aspect-square rounded-2xl overflow-hidden bg-slate-100">
                    <img src={p.url} alt="Uploaded profile" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleDeletePhoto(p.id)}
                      aria-label="Delete photo"
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/65 text-white flex items-center justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {photos.length < 6 && (
                  <label className="aspect-square rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center cursor-pointer hover:border-[#7C5CFC] text-xs text-slate-500">
                    <Upload className="w-5 h-5 mb-1" />
                    <span>Add</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoUpload} />
                  </label>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Personal Bio</label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Share what excites you, how you spend free time, and what connection feels like to you..."
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3.5 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-2">Interests &amp; Hobbies</label>
              <div className="flex flex-wrap gap-2">
                {INTEREST_OPTIONS.map((item) => {
                  const active = interests.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleInterest(item)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border ${
                        active
                          ? 'bg-[#7C5CFC] text-white border-[#7C5CFC]'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <input
                value={favoriteActivities}
                onChange={(e) => setFavoriteActivities(e.target.value)}
                placeholder="Favorite activities"
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleVoiceRecording}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold ${
                    recording ? 'bg-rose-600 text-white' : 'border border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {recording ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  {recording ? 'Stop Recording' : 'Record Voice Intro (Optional)'}
                </button>
                {voiceUrl && <audio controls src={voiceUrl} className="h-8" />}
              </div>

              <button
                type="button"
                disabled={saving}
                onClick={() => saveStepAndAdvance(4)}
                className="px-6 py-2.5 rounded-xl bg-[#7C5CFC] text-white text-sm font-semibold"
              >
                Next: Personality Quiz →
              </button>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <h2 className="font-display text-xl font-semibold">Step 5 · Match Preferences</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Minimum Age (18+)</label>
                <input
                  type="number"
                  min={18}
                  max={99}
                  value={minAge}
                  onChange={(e) => setMinAge(Math.max(18, Number(e.target.value)))}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3.5 py-2 text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Maximum Age</label>
                <input
                  type="number"
                  min={18}
                  max={100}
                  value={maxAge}
                  onChange={(e) => setMaxAge(Math.min(100, Number(e.target.value)))}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3.5 py-2 text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Approximate Distance (km)</label>
                <input
                  type="number"
                  min={5}
                  max={5000}
                  value={maxDistanceKm}
                  onChange={(e) => setMaxDistanceKm(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3.5 py-2 text-sm tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <div>
                <label className="block text-xs font-semibold mb-1">Diet</label>
                <select
                  value={diet}
                  onChange={(e) => setDiet(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2 text-sm"
                >
                  <option>Flexible</option>
                  <option>Vegetarian</option>
                  <option>Vegan</option>
                  <option>Pescatarian</option>
                  <option>Omnivore</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Movement &amp; Exercise</label>
                <select
                  value={exercise}
                  onChange={(e) => setExercise(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2 text-sm"
                >
                  <option>Active</option>
                  <option>Regularly</option>
                  <option>Occasionally</option>
                  <option>Light walks</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() => saveStepAndAdvance(6)}
                className="px-6 py-2.5 rounded-xl bg-[#7C5CFC] text-white text-sm font-semibold"
              >
                Next: Privacy Settings →
              </button>
            </div>
          </>
        )}

        {step === 6 && (
          <>
            <h2 className="font-display text-xl font-semibold">Step 6 · Privacy &amp; Consent Settings</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Profile Visibility</label>
                <select
                  value={profileVisibility}
                  onChange={(e) => setProfileVisibility(e.target.value as typeof profileVisibility)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2 text-sm"
                >
                  <option value="everyone">Discoverable to compatible adults</option>
                  <option value="matches_only">Visible to matches only</option>
                  <option value="hidden">Hidden</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Photo Visibility</label>
                <select
                  value={photoVisibility}
                  onChange={(e) => setPhotoVisibility(e.target.value as typeof photoVisibility)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2 text-sm"
                >
                  <option value="everyone">Standard discovery</option>
                  <option value="matches_only">Matches only</option>
                  <option value="blind_only">Blind Connect mutual reveal only</option>
                </select>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              {[
                {
                  label: 'Participate in Blind Connect (personality-first matching)',
                  checked: blindConnectEnabled,
                  set: setBlindConnectEnabled,
                },
                {
                  label: 'Allow Gemini AI to summarize compatibility & suggest icebreakers (optional, never reads private chats)',
                  checked: aiProcessingConsent,
                  set: setAiProcessingConsent,
                },
                {
                  label: 'Share approximate city/region on profile',
                  checked: shareApproxLocation,
                  set: setShareApproxLocation,
                },
                {
                  label: 'Show online activity indicator to matches',
                  checked: showOnlineStatus,
                  set: setShowOnlineStatus,
                },
              ].map((item) => (
                <label key={item.label} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => item.set(e.target.checked)}
                    className="mt-1 accent-[#7C5CFC]"
                  />
                  <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">{item.label}</span>
                </label>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() => saveStepAndAdvance(7)}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#7C5CFC] text-white text-sm font-semibold"
              >
                <Check className="w-4 h-4" />
                Finish &amp; Enter Discover
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
