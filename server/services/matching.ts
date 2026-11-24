import { PERSONALITY_QUESTIONS } from '../../shared/questionnaire.ts';

export interface CandidateProfileRecord {
  userId: string;
  ageYears: number;
  displayName: string;
  gender: string;
  datingPreferences: string[];
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
  voiceIntroUrl: string;
  relationshipGoal: string;
  lifestyle: Record<string, string>;
  verifiedBadge: boolean;
  blindConnectEnabled: boolean;
  isDevDemo: boolean;
  minAgePref: number;
  maxAgePref: number;
  preferredGenders: string[];
  relationshipGoalsPref: string[];
  answers: Record<string, number>;
  weights?: { values: number; personality: number; interests: number; goals: number; lifestyle: number };
}

export interface CompatibilityResult {
  overallScore: number;
  breakdown: {
    sharedValues: number;
    personality: number;
    interests: number;
    relationshipGoals: number;
    lifestyle: number;
  };
  sharedInterests: string[];
  similarTraits: string[];
  lifestyleSimilarities: string[];
  sharedGoals: string[];
  potentialDifferences: string[];
  disclaimer: string;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0.5;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0.5;
  return Math.max(0, Math.min(1, dot / (Math.sqrt(magA) * Math.sqrt(magB))));
}

function buildCategoryVector(
  answers: Record<string, number>,
  categories: string[]
): { vec: number[]; answeredCount: number } {
  const vec: number[] = [];
  let answeredCount = 0;
  for (const q of PERSONALITY_QUESTIONS) {
    if (categories.includes(q.category)) {
      const val = answers[q.id];
      if (typeof val === 'number' && val >= 1 && val <= 4) {
        vec.push(val);
        answeredCount++;
      } else {
        vec.push(2.5); // neutral midpoint for skipped optional questions
      }
    }
  }
  return { vec, answeredCount };
}

function genderCompatible(viewerGender: string, targetPreferredGenders: string[]): boolean {
  if (!targetPreferredGenders || targetPreferredGenders.length === 0) return true;
  if (targetPreferredGenders.includes('Everyone')) return true;
  const g = viewerGender.toLowerCase();
  return targetPreferredGenders.some((pref) => {
    const p = pref.toLowerCase();
    if (p === 'everyone') return true;
    if (p === 'women' && (g === 'woman' || g === 'female')) return true;
    if (p === 'men' && (g === 'man' || g === 'male')) return true;
    if (p === 'non-binary' && g.includes('non-binary')) return true;
    return p === g;
  });
}

export function areMutuallyCompatiblePreferences(
  viewer: CandidateProfileRecord,
  candidate: CandidateProfileRecord
): boolean {
  if (viewer.userId === candidate.userId) return false;
  // Enforce mutual age boundaries
  if (candidate.ageYears < viewer.minAgePref || candidate.ageYears > viewer.maxAgePref) {
    return false;
  }
  if (viewer.ageYears < candidate.minAgePref || viewer.ageYears > candidate.maxAgePref) {
    return false;
  }
  // Enforce mutual gender preferences
  if (!genderCompatible(candidate.gender, viewer.preferredGenders)) {
    return false;
  }
  if (!genderCompatible(viewer.gender, candidate.preferredGenders)) {
    return false;
  }
  return true;
}

export function computeExplainableCompatibility(
  a: CandidateProfileRecord,
  b: CandidateProfileRecord
): CompatibilityResult {
  const weights = a.weights || { values: 25, personality: 25, interests: 20, goals: 20, lifestyle: 10 };
  const totalWeight =
    weights.values + weights.personality + weights.interests + weights.goals + weights.lifestyle || 100;

  // 1. Shared Values (25%)
  const valCats = ['values', 'expectations', 'future'];
  const valA = buildCategoryVector(a.answers, valCats);
  const valB = buildCategoryVector(b.answers, valCats);
  const valuesCosine = cosineSimilarity(valA.vec, valB.vec);
  // Also factor direct option agreement so subtle vector differences show clearly
  let exactValMatches = 0;
  for (let i = 0; i < valA.vec.length; i++) {
    const diff = Math.abs(valA.vec[i] - valB.vec[i]);
    exactValMatches += Math.max(0, 1 - diff / 3);
  }
  const valuesScore = Math.round(
    ((valuesCosine * 0.45 + (exactValMatches / Math.max(1, valA.vec.length)) * 0.55) * 100)
  );

  // 2. Personality Compatibility (25%)
  const persCats = ['social', 'communication', 'conflict', 'hobbies', 'travel'];
  const persA = buildCategoryVector(a.answers, persCats);
  const persB = buildCategoryVector(b.answers, persCats);
  const persCosine = cosineSimilarity(persA.vec, persB.vec);
  let persClose = 0;
  for (let i = 0; i < persA.vec.length; i++) {
    const diff = Math.abs(persA.vec[i] - persB.vec[i]);
    persClose += Math.max(0, 1 - diff / 3);
  }
  const personalityScore = Math.round(
    ((persCosine * 0.45 + (persClose / Math.max(1, persA.vec.length)) * 0.55) * 100)
  );

  // 3. Shared Interests (20%)
  const setA = new Set(a.interests.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const setB = new Set(b.interests.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const sharedInterests: string[] = [];
  for (const item of b.interests) {
    if (setA.has(item.trim().toLowerCase())) {
      sharedInterests.push(item);
    }
  }
  const unionSize = new Set([...setA, ...setB]).size;
  const jaccard = unionSize > 0 ? sharedInterests.length / unionSize : 0;
  // Normalize nicely so 3+ shared interests out of ~6 each yields strong score
  const interestsScore = Math.round(
    Math.min(100, (jaccard * 1.4 + Math.min(sharedInterests.length, 4) * 0.12) * 100)
  );

  // 4. Relationship Goals (20%)
  const aGoals = new Set([a.relationshipGoal, ...a.relationshipGoalsPref].map((g) => g.toLowerCase()));
  const bGoals = new Set([b.relationshipGoal, ...b.relationshipGoalsPref].map((g) => g.toLowerCase()));
  const sharedGoals: string[] = [];
  if (a.relationshipGoal.toLowerCase() === b.relationshipGoal.toLowerCase()) {
    sharedGoals.push(a.relationshipGoal);
  } else if (aGoals.has(b.relationshipGoal.toLowerCase()) || bGoals.has(a.relationshipGoal.toLowerCase())) {
    sharedGoals.push(b.relationshipGoal);
  }
  const goalOverlap = [...aGoals].filter((g) => bGoals.has(g)).length;
  const goalsScore =
    a.relationshipGoal.toLowerCase() === b.relationshipGoal.toLowerCase()
      ? 96
      : goalOverlap > 0
        ? 76
        : 42;

  // 5. Lifestyle Preferences (10%)
  const lifestyleKeys = ['smoking', 'drinking', 'exercise', 'diet'];
  const lifestyleSimilarities: string[] = [];
  const potentialDifferences: string[] = [];
  let lifeMatches = 0;
  let lifeCompared = 0;
  for (const k of lifestyleKeys) {
    const va = a.lifestyle?.[k];
    const vb = b.lifestyle?.[k];
    if (va && vb) {
      lifeCompared++;
      if (va.toLowerCase() === vb.toLowerCase()) {
        lifeMatches++;
        lifestyleSimilarities.push(`${k[0].toUpperCase() + k.slice(1)}: ${vb}`);
      } else {
        potentialDifferences.push(`${k[0].toUpperCase() + k.slice(1)} (${va} vs. ${vb})`);
      }
    }
  }
  const lifestyleScore = lifeCompared > 0 ? Math.round((lifeMatches / lifeCompared) * 100) : 70;

  // Extract top similar personality traits & differences from answered questions
  const similarTraits: string[] = [];
  for (const q of PERSONALITY_QUESTIONS) {
    const ansA = a.answers[q.id];
    const ansB = b.answers[q.id];
    if (typeof ansA === 'number' && typeof ansB === 'number') {
      if (ansA === ansB && similarTraits.length < 4) {
        const opt = q.options[ansB - 1]?.label;
        if (opt) similarTraits.push(`${q.category[0].toUpperCase() + q.category.slice(1)}: ${opt}`);
      } else if (Math.abs(ansA - ansB) >= 2 && potentialDifferences.length < 4) {
        potentialDifferences.push(`Different pace on ${q.category}: "${q.prompt}"`);
      }
    }
  }

  const overallScore = Math.max(
    1,
    Math.min(
      99,
      Math.round(
        (valuesScore * weights.values +
          personalityScore * weights.personality +
          interestsScore * weights.interests +
          goalsScore * weights.goals +
          lifestyleScore * weights.lifestyle) /
          totalWeight
      )
    )
  );

  return {
    overallScore,
    breakdown: {
      sharedValues: valuesScore,
      personality: personalityScore,
      interests: interestsScore,
      relationshipGoals: goalsScore,
      lifestyle: lifestyleScore,
    },
    sharedInterests,
    similarTraits,
    lifestyleSimilarities,
    sharedGoals,
    potentialDifferences,
    disclaimer:
      'Compatibility scores summarize shared interests, values, and preferences — never a scientific prediction of relationship success.',
  };
}
