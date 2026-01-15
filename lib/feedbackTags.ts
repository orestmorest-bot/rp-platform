// Shared feedback tags definition with emojis
export const feedbackTags = [
  { id: "great_chemistry", label: "Great Chemistry", emoji: "💫", positive: true },
  { id: "interesting_story", label: "Interesting Story", emoji: "📖", positive: true },
  { id: "quick_responses", label: "Quick Responses", emoji: "⚡", positive: true },
  { id: "creative_writing", label: "Creative Writing", emoji: "✨", positive: true },
  { id: "good_character_development", label: "Good Character Development", emoji: "🎭", positive: true },
  { id: "slow_responses", label: "Slow Responses", emoji: "🐌", positive: false },
  { id: "poor_communication", label: "Poor Communication", emoji: "📵", positive: false },
  { id: "inconsistent_character", label: "Inconsistent Character", emoji: "🔄", positive: false },
] as const;

export type FeedbackTagId = typeof feedbackTags[number]["id"];







