import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../config/env.ts';
import type { CompatibilityResult } from './matching.ts';

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  if (!env.geminiApiKey || env.geminiApiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: env.geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

function sanitizeTextForPrompt(input: string, maxLen = 300): string {
  // Strip control characters and prompt-injection style delimiters
  return input
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/```/g, '')
    .slice(0, maxLen)
    .trim();
}

async function withTimeout<T>(promise: Promise<T>, ms = 12000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('AI request timed out')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function generateCompatibilityExplanation(params: {
  hasConsent: boolean;
  viewerFirstName: string;
  candidateFirstName: string;
  result: CompatibilityResult;
}): Promise<{ explanation: string; usedAi: boolean }> {
  const { hasConsent, viewerFirstName, candidateFirstName, result } = params;
  const fallback = `You and ${sanitizeTextForPrompt(candidateFirstName, 40)} share an estimated ${
    result.overallScore
  }% alignment based on your questionnaire and profile settings.${
    result.sharedInterests.length > 0
      ? ` Common interests include ${result.sharedInterests.slice(0, 3).join(', ')}.`
      : ''
  }${
    result.sharedGoals.length > 0 ? ` You also align on ${result.sharedGoals[0].toLowerCase()}.` : ''
  } ${result.disclaimer}`;

  if (!hasConsent) {
    return { explanation: fallback, usedAi: false };
  }

  const ai = getAiClient();
  if (!ai) {
    return { explanation: fallback, usedAi: false };
  }

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: JSON.stringify({
          viewerLabel: sanitizeTextForPrompt(viewerFirstName, 30),
          candidateLabel: sanitizeTextForPrompt(candidateFirstName, 30),
          overallScore: result.overallScore,
          breakdown: result.breakdown,
          sharedInterests: result.sharedInterests.slice(0, 6),
          similarTraits: result.similarTraits.slice(0, 4),
          sharedGoals: result.sharedGoals.slice(0, 2),
          potentialDifferences: result.potentialDifferences.slice(0, 3),
        }),
        config: {
          systemInstruction:
            'You are BondAI compatibility explainer. Given ONLY pseudonymized compatibility metrics JSON, write a warm, grounded 3-sentence summary explaining why two people might enjoy getting to know each other and noting one gentle difference to stay curious about. Never invent facts not in the JSON, never claim scientific certainty, and never treat scores as relationship guarantees.',
        },
      })
    );
    const text = response.text?.trim();
    if (!text) return { explanation: fallback, usedAi: false };
    return { explanation: text, usedAi: true };
  } catch {
    return { explanation: fallback, usedAi: false };
  }
}

export async function generateIcebreakers(params: {
  hasConsent: boolean;
  category: string;
  sharedInterests: string[];
  candidatePrompts: { question: string; answer: string }[];
  relationshipGoal: string;
}): Promise<{ starters: string[]; usedAi: boolean }> {
  const { hasConsent, category, sharedInterests, candidatePrompts, relationshipGoal } = params;
  const topInterest = sharedInterests[0] || 'exploring new places';
  const fallbackStarters = [
    `You both enjoy ${topInterest}. What is one moment or recommendation from it you would share with a friend?`,
    `If you had an unhurried Saturday morning with zero errands, how would you spend it?`,
    `What kind of small everyday ritual makes you feel most grounded?`,
  ];

  if (!hasConsent) {
    return { starters: fallbackStarters, usedAi: false };
  }
  const ai = getAiClient();
  if (!ai) {
    return { starters: fallbackStarters, usedAi: false };
  }

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: JSON.stringify({
          toneCategory: sanitizeTextForPrompt(category, 30),
          sharedInterests: sharedInterests.slice(0, 5).map((s) => sanitizeTextForPrompt(s, 40)),
          visiblePromptThemes: candidatePrompts
            .slice(0, 2)
            .map((p) => sanitizeTextForPrompt(p.question, 80)),
          relationshipGoal: sanitizeTextForPrompt(relationshipGoal, 50),
        }),
        config: {
          systemInstruction:
            'Generate 3 respectful, natural dating conversation starters matching the requested toneCategory (Funny, Thoughtful, Casual, Creative, Travel-related, or Personality-based). Ground them only in the provided interests and prompt themes. Never include personal data or cheesy pickup lines.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              starters: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
          },
        },
      })
    );
    const parsed = JSON.parse(response.text || '{}') as { starters?: string[] };
    if (Array.isArray(parsed.starters) && parsed.starters.length > 0) {
      return { starters: parsed.starters.slice(0, 4).map((s) => String(s).trim()), usedAi: true };
    }
    return { starters: fallbackStarters, usedAi: false };
  } catch {
    return { starters: fallbackStarters, usedAi: false };
  }
}

export async function generateProfileAssistance(params: {
  hasConsent: boolean;
  mode: 'improve_bio' | 'grammar' | 'variations' | 'prompts' | 'completeness';
  bio: string;
  interests: string[];
  occupation: string;
  favoriteMusic: string;
  favoriteMovies: string;
}): Promise<{ suggestions: string[]; completenessTips: string[]; usedAi: boolean }> {
  const { hasConsent, mode, bio, interests, occupation, favoriteMusic, favoriteMovies } = params;
  const tips: string[] = [];
  if (bio.trim().length < 50) tips.push('Add a specific detail about how you spend a free weekend (50+ characters).');
  if (interests.length < 3) tips.push('Select at least 3 hobbies or interests so compatibility matching has strong signal.');
  if (!favoriteMusic && !favoriteMovies) tips.push('Sharing a favorite album or film sparks easy first messages.');
  if (tips.length === 0) tips.push('Your core bio and interests look balanced and specific.');

  const cleanBio = sanitizeTextForPrompt(bio, 450);
  const cleanInterests = interests.slice(0, 8).map((i) => sanitizeTextForPrompt(i, 40));

  const fallbackSuggestions = [
    cleanBio
      ? `${cleanBio} Always happy to trade recommendations on ${cleanInterests.slice(0, 2).join(' and ') || 'good coffee and books'}.`
      : `Curious about ${cleanInterests.slice(0, 3).join(', ') || 'art, good food, and thoughtful conversation'}. Looking for genuine, unhurried connection.`,
    `Weekends usually mean ${cleanInterests[0] || 'a long walk'}, discovering new ${
      favoriteMusic ? `sounds like ${sanitizeTextForPrompt(favoriteMusic, 40)}` : 'music'
    }, and honest conversations.`,
  ];

  if (!hasConsent) {
    return { suggestions: fallbackSuggestions, completenessTips: tips, usedAi: false };
  }
  const ai = getAiClient();
  if (!ai) {
    return { suggestions: fallbackSuggestions, completenessTips: tips, usedAi: false };
  }

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: JSON.stringify({
          task: mode,
          approvedBio: cleanBio,
          approvedInterests: cleanInterests,
          approvedOccupation: sanitizeTextForPrompt(occupation, 60),
          approvedMusic: sanitizeTextForPrompt(favoriteMusic, 80),
          approvedMovies: sanitizeTextForPrompt(favoriteMovies, 80),
        }),
        config: {
          systemInstruction:
            'You are BondAI Profile Assistant. Help polish the user profile strictly using ONLY the approved facts provided. NEVER invent degrees, travels, awards, or life experiences. Never evaluate attractiveness. Return 3 concise, authentic suggestions and 2 actionable completeness tips.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
              completenessTips: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
          },
        },
      })
    );
    const parsed = JSON.parse(response.text || '{}') as {
      suggestions?: string[];
      completenessTips?: string[];
    };
    return {
      suggestions:
        Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0
          ? parsed.suggestions.slice(0, 3)
          : fallbackSuggestions,
      completenessTips:
        Array.isArray(parsed.completenessTips) && parsed.completenessTips.length > 0
          ? parsed.completenessTips.slice(0, 3)
          : tips,
      usedAi: true,
    };
  } catch {
    return { suggestions: fallbackSuggestions, completenessTips: tips, usedAi: false };
  }
}

export interface DateIdea {
  title: string;
  category: string;
  estimatedBudget: string;
  duration: string;
  whyItFits: string;
  safetyGuidance: string;
}

export async function generateDateIdeas(params: {
  hasConsent: boolean;
  sharedInterests: string[];
  approxCity: string;
  budget: string;
  dietary: string;
  availability: string;
}): Promise<{ ideas: DateIdea[]; usedAi: boolean }> {
  const { hasConsent, sharedInterests, approxCity, budget, dietary, availability } = params;
  const interest = sharedInterests[0] || 'conversation';
  const fallbackIdeas: DateIdea[] = [
    {
      title: 'Independent Bookstore & Coffee Tasting',
      category: 'Bookstore & Café',
      estimatedBudget: budget || 'Moderate ($15–$35)',
      duration: '1.5 – 2 hours',
      whyItFits: `Low-pressure public setting with built-in conversation topics around ${interest}.`,
      safetyGuidance: 'Meet at a well-lit public café during daytime and arrange independent transport.',
    },
    {
      title: 'Botanical Garden or Museum Afternoon Walk',
      category: 'Museum & Outdoors',
      estimatedBudget: budget || 'Low–Moderate ($10–$30)',
      duration: '2 hours',
      whyItFits: 'Easy pace for meaningful dialogue with plenty of visual inspiration around you.',
      safetyGuidance: 'Share your general plan with a trusted friend and keep personal addresses private.',
    },
    {
      title: 'Casual Neighborhood Bite (Dietary-Friendly)',
      category: 'Casual Dining',
      estimatedBudget: budget || 'Moderate ($25–$50)',
      duration: '1.5 hours',
      whyItFits: `Tailored around ${dietary || 'flexible dining preferences'} in a relaxed public spot.`,
      safetyGuidance: 'Choose a busy public eatery in a central neighborhood.',
    },
  ];

  if (!hasConsent) {
    return { ideas: fallbackIdeas, usedAi: false };
  }
  const ai = getAiClient();
  if (!ai) {
    return { ideas: fallbackIdeas, usedAi: false };
  }

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: JSON.stringify({
          sharedInterests: sharedInterests.slice(0, 6),
          approximateRegion: sanitizeTextForPrompt(approxCity, 60),
          budget: sanitizeTextForPrompt(budget, 40),
          dietaryPreferences: sanitizeTextForPrompt(dietary, 60),
          availability: sanitizeTextForPrompt(availability, 60),
        }),
        config: {
          systemInstruction:
            'Suggest 3 thoughtful first-date activity concepts tailored to sharedInterests, approximateRegion, budget, and dietaryPreferences. CRITICAL RULES: Only suggest public daytime/evening venues (coffee, bookstore, museum, park walk, casual café). NEVER fabricate specific venue opening hours, live table availability, exact menu prices, or private addresses. Include concise first-date public safety guidance for each idea.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ideas: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    category: { type: Type.STRING },
                    estimatedBudget: { type: Type.STRING },
                    duration: { type: Type.STRING },
                    whyItFits: { type: Type.STRING },
                    safetyGuidance: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      })
    );
    const parsed = JSON.parse(response.text || '{}') as { ideas?: DateIdea[] };
    if (Array.isArray(parsed.ideas) && parsed.ideas.length > 0) {
      return { ideas: parsed.ideas.slice(0, 4), usedAi: true };
    }
    return { ideas: fallbackIdeas, usedAi: false };
  } catch {
    return { ideas: fallbackIdeas, usedAi: false };
  }
}

export async function generateGameInsight(params: {
  hasConsent: boolean;
  gameType: string;
  promptText: string;
  answerA: string;
  answerB: string;
}): Promise<{ summary: string; usedAi: boolean }> {
  const { hasConsent, gameType, promptText, answerA, answerB } = params;
  const fallback = `You both shared thoughtful perspectives on "${sanitizeTextForPrompt(
    promptText,
    90
  )}" — a helpful spark to compare how you each approach ${sanitizeTextForPrompt(gameType, 40)}.`;

  if (!hasConsent) return { summary: fallback, usedAi: false };
  const ai = getAiClient();
  if (!ai) return { summary: fallback, usedAi: false };

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: JSON.stringify({
          gameType: sanitizeTextForPrompt(gameType, 40),
          prompt: sanitizeTextForPrompt(promptText, 120),
          partnerOneAnswer: sanitizeTextForPrompt(answerA, 160),
          partnerTwoAnswer: sanitizeTextForPrompt(answerB, 160),
        }),
        config: {
          systemInstruction:
            'Summarize in 2 warm sentences what these two mutually consented compatibility game answers reveal about shared curiosity or complementary styles. Never judge or claim relationship predictions.',
        },
      })
    );
    return { summary: response.text?.trim() || fallback, usedAi: true };
  } catch {
    return { summary: fallback, usedAi: false };
  }
}
