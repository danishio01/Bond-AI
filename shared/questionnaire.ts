export interface PersonalityQuestion {
  id: string;
  category:
    | 'social'
    | 'communication'
    | 'lifestyle'
    | 'values'
    | 'travel'
    | 'hobbies'
    | 'expectations'
    | 'future'
    | 'conflict';
  prompt: string;
  options: { label: string; score: number }[];
  optional?: boolean;
}

export const PERSONALITY_QUESTIONS: PersonalityQuestion[] = [
  {
    id: 'q_social_1',
    category: 'social',
    prompt: 'How do you recharge best after a busy week?',
    options: [
      { label: 'Quiet evening at home or one-on-one time', score: 1 },
      { label: 'Small dinner with two or three close friends', score: 2 },
      { label: 'Hosting a casual game night or café meetup', score: 3 },
      { label: 'Lively party, live music, or social gathering', score: 4 },
    ],
  },
  {
    id: 'q_social_2',
    category: 'social',
    prompt: 'In a new group setting, what feels most natural to you?',
    options: [
      { label: 'Observing quietly and listening deeply', score: 1 },
      { label: 'Connecting closely with one person nearby', score: 2 },
      { label: 'Joining conversations when a topic sparks interest', score: 3 },
      { label: 'Introducing people and energizing the room', score: 4 },
    ],
  },
  {
    id: 'q_comm_1',
    category: 'communication',
    prompt: 'What kind of daily communication rhythm feels healthiest with a partner?',
    options: [
      { label: 'Thoughtful check-ins once or twice a day', score: 1 },
      { label: 'Light texts during breaks, deeper calls at night', score: 2 },
      { label: 'Frequent playful updates throughout the day', score: 3 },
      { label: 'Open-ended voice notes and long evening conversations', score: 4 },
    ],
  },
  {
    id: 'q_comm_2',
    category: 'communication',
    prompt: 'How do you prefer to express care and affection?',
    options: [
      { label: 'Practical acts of thoughtful help', score: 1 },
      { label: 'Undivided quality time together', score: 2 },
      { label: 'Warm verbal appreciation and encouragement', score: 3 },
      { label: 'Physical closeness and small surprise gestures', score: 4 },
    ],
  },
  {
    id: 'q_comm_3',
    category: 'communication',
    prompt: 'When a topic gets emotionally nuanced, you prefer to:',
    options: [
      { label: 'Take time to journal or reflect before speaking', score: 1 },
      { label: 'Discuss calmly in person when both feel grounded', score: 2 },
      { label: 'Talk it through gently right away', score: 3 },
      { label: 'Share feelings candidly and brainstorm together', score: 4 },
    ],
  },
  {
    id: 'q_life_1',
    category: 'lifestyle',
    prompt: 'What does your ideal Sunday morning look like?',
    options: [
      { label: 'Sleeping in, slow coffee, and quiet reading', score: 1 },
      { label: 'Farmers market stroll and cooking brunch', score: 2 },
      { label: 'Early trail hike, run, or yoga session', score: 3 },
      { label: 'Spontaneous road trip or museum opening', score: 4 },
    ],
  },
  {
    id: 'q_life_2',
    category: 'lifestyle',
    prompt: 'How structured do you like your daily routine?',
    options: [
      { label: 'Very spontaneous — I follow curiosity', score: 1 },
      { label: 'Flexible rhythm with loose anchors', score: 2 },
      { label: 'Organized weekdays, open weekends', score: 3 },
      { label: 'Consistent habits, calendars, and early mornings', score: 4 },
    ],
  },
  {
    id: 'q_life_3',
    category: 'lifestyle',
    prompt: 'How important is shared health, movement, or outdoor activity?',
    options: [
      { label: 'Nice occasionally, not a core focus', score: 1 },
      { label: 'Moderate — evening walks and casual movement', score: 2 },
      { label: 'Important part of weekly balance', score: 3 },
      { label: 'Central lifestyle pillar we both enjoy', score: 4 },
    ],
  },
  {
    id: 'q_values_1',
    category: 'values',
    prompt: 'Which value anchors your life decisions most strongly?',
    options: [
      { label: 'Personal autonomy and creative freedom', score: 1 },
      { label: 'Empathy, kindness, and emotional honesty', score: 2 },
      { label: 'Curiosity, lifelong learning, and growth', score: 3 },
      { label: 'Community, loyalty, and family roots', score: 4 },
    ],
  },
  {
    id: 'q_values_2',
    category: 'values',
    prompt: 'How do you approach personal privacy and digital boundaries in a relationship?',
    options: [
      { label: 'Strong personal space; devices stay private', score: 1 },
      { label: 'Clear boundaries with full emotional transparency', score: 2 },
      { label: 'Open sharing by choice, minimal social media', score: 3 },
      { label: 'Very open digital life and shared calendars', score: 4 },
    ],
  },
  {
    id: 'q_values_3',
    category: 'values',
    prompt: 'How do you view financial planning and lifestyle choices?',
    options: [
      { label: 'Experience-first, minimalist possessions', score: 1 },
      { label: 'Balanced saving with mindful travel and dining', score: 2 },
      { label: 'Goal-oriented investing and long-term security', score: 3 },
      { label: 'Generous hospitality mixed with steady budgeting', score: 4 },
    ],
  },
  {
    id: 'q_travel_1',
    category: 'travel',
    prompt: 'When planning a week away together, what appeals most?',
    options: [
      { label: 'Quiet mountain cabin or coastal retreat', score: 1 },
      { label: 'Food, architecture, and slow neighborhood walks', score: 2 },
      { label: 'Cultural museums, galleries, and local music', score: 3 },
      { label: 'Backpacking trails and active outdoor exploration', score: 4 },
    ],
  },
  {
    id: 'q_travel_2',
    category: 'travel',
    prompt: 'How much itinerary planning do you prefer on trips?',
    options: [
      { label: 'Zero schedule — wander and discover', score: 1 },
      { label: 'Book lodging + one highlight per day', score: 2 },
      { label: 'Curated list of cafes, museums, and routes', score: 3 },
      { label: 'Detailed day-by-day route and reservations', score: 4 },
    ],
  },
  {
    id: 'q_hobbies_1',
    category: 'hobbies',
    prompt: 'How do you feel about partners having separate vs. shared hobbies?',
    options: [
      { label: 'Mostly independent hobbies with dinner catch-ups', score: 1 },
      { label: 'A healthy mix of personal projects and shared rituals', score: 2 },
      { label: 'Love learning each other’s crafts and interests', score: 3 },
      { label: 'Ideally share most creative or outdoor pursuits', score: 4 },
    ],
  },
  {
    id: 'q_hobbies_2',
    category: 'hobbies',
    prompt: 'Which creative or cultural ritual excites you most on a date?',
    options: [
      { label: 'Indie cinema, vinyl listening, or bookstore browsing', score: 1 },
      { label: 'Cooking a new cuisine together at home', score: 2 },
      { label: 'Photography walks, pottery, or live acoustic sets', score: 3 },
      { label: 'Trivia nights, board games, or comedy shows', score: 4 },
    ],
  },
  {
    id: 'q_exp_1',
    category: 'expectations',
    prompt: 'How quickly do you like emotional intimacy to build?',
    options: [
      { label: 'Slow and steady — friendship forms the foundation', score: 1 },
      { label: 'Gradual trust over thoughtful unhurried dates', score: 2 },
      { label: 'Warm openness from early conversations', score: 3 },
      { label: 'Deep honesty early on to see if values align', score: 4 },
    ],
  },
  {
    id: 'q_exp_2',
    category: 'expectations',
    prompt: 'What role does humor play in your ideal partnership?',
    options: [
      { label: 'Dry wit and subtle inside jokes', score: 1 },
      { label: 'Warm, gentle playfulness during everyday chores', score: 2 },
      { label: 'Silly banter that lightens tense moments', score: 3 },
      { label: 'Constant laughter and shared curiosity', score: 4 },
    ],
  },
  {
    id: 'q_future_1',
    category: 'future',
    prompt: 'Where do you imagine feeling most at home over the next 5 years?',
    options: [
      { label: 'Vibrant walkable city neighborhood', score: 1 },
      { label: 'Green leafy suburb near cultural hubs', score: 2 },
      { label: 'Coastal town or mountain-adjacent community', score: 3 },
      { label: 'Flexible remote base splitting time across places', score: 4 },
    ],
  },
  {
    id: 'q_future_2',
    category: 'future',
    prompt: 'How do you balance career ambition and personal relationship time?',
    options: [
      { label: 'Work supports life — evenings stay protected', score: 1 },
      { label: 'Steady passion for craft with intentional weekends', score: 2 },
      { label: 'Driven phases balanced by planned getaways', score: 3 },
      { label: 'Building big ambitious projects together', score: 4 },
    ],
    optional: true,
  },
  {
    id: 'q_conflict_1',
    category: 'conflict',
    prompt: 'During a disagreement, what helps you resolve things constructively?',
    options: [
      { label: 'Taking a 20-minute breather so tone stays kind', score: 1 },
      { label: 'Listening to understand before defending my view', score: 2 },
      { label: 'Using "I feel" statements and finding middle ground', score: 3 },
      { label: 'Addressing it gently right away with reassurance', score: 4 },
    ],
  },
  {
    id: 'q_conflict_2',
    category: 'conflict',
    prompt: 'After a tough conversation, how do you reconnect?',
    options: [
      { label: 'A quiet walk together without phones', score: 1 },
      { label: 'Making tea or dinner and checking in softly', score: 2 },
      { label: 'Naming one thing we appreciate about each other', score: 3 },
      { label: 'A warm hug and light humor once resolved', score: 4 },
    ],
  },
  {
    id: 'q_values_4',
    category: 'values',
    prompt: 'What matters most to you in a dating platform’s design?',
    options: [
      { label: 'Zero creepy tracking and strict privacy controls', score: 1 },
      { label: 'Getting to know someone’s mind before judging photos', score: 2 },
      { label: 'Transparent compatibility reasons without dark patterns', score: 3 },
      { label: 'Authentic, respectful conversations at an unhurried pace', score: 4 },
    ],
    optional: true,
  },
];
